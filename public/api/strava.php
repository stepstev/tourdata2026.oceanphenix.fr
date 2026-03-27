<?php
/**
 * Strava API Proxy — OceanPhenix TourData 2026
 *
 * Gère le refresh token OAuth2 Strava côté serveur (jamais exposé au client).
 * Cache la réponse 10 min dans strava-cache.json.
 * Auto-sauvegarde le nouveau refresh token si Strava le fait tourner.
 *
 * SETUP : créer public/api/strava-env.php sur le serveur (jamais dans le repo) :
 * <?php
 * $STRAVA_CLIENT_ID     = '12345';
 * $STRAVA_CLIENT_SECRET = 'abcdef...';
 * $STRAVA_REFRESH_TOKEN = 'xyz...';
 * $STRAVA_CRON_SECRET   = 'un-secret-long-et-aleatoire';  // utilisé par le cron cPanel
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ── CORS (même origine en prod, localhost en dev) ────────────────────────────
$allowedOrigins = [
    'https://www.tourdata2026.oceanphenix.fr',
    'https://tourdata2026.oceanphenix.fr',
    'https://oceanphenix.fr',
    'https://www.oceanphenix.fr',
    'http://localhost:4321',
    'http://localhost:4322',
    'http://localhost:4323',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Credentials ──────────────────────────────────────────────────────────────
$envFile = __DIR__ . '/strava-env.php';
if (!file_exists($envFile)) {
    http_response_code(503);
    echo json_encode([
        'error'   => 'Strava non configuré',
        'detail'  => 'Créez public/api/strava-env.php sur le serveur (voir commentaire dans strava.php)',
        'setup'   => true,
    ]);
    exit;
}
require_once $envFile;
// Variables attendues : $STRAVA_CLIENT_ID, $STRAVA_CLIENT_SECRET, $STRAVA_REFRESH_TOKEN, $STRAVA_CRON_SECRET
foreach ([
    'STRAVA_CLIENT_ID'     => $STRAVA_CLIENT_ID     ?? null,
    'STRAVA_CLIENT_SECRET' => $STRAVA_CLIENT_SECRET ?? null,
    'STRAVA_REFRESH_TOKEN' => $STRAVA_REFRESH_TOKEN ?? null,
] as $varName => $varValue) {
    if (empty($varValue)) {
        http_response_code(503);
        echo json_encode(['error' => "Variable \$$varName manquante dans strava-env.php"]);
        exit;
    }
}

// ── Cache ────────────────────────────────────────────────────────────────────
$cacheFile = __DIR__ . '/strava-cache.json';
$cacheTTL  = 600; // 10 minutes
$staleData = null;

// ?force=1&secret=XXX permet au cron cPanel de forcer le refresh sans attendre le TTL.
// Le secret doit correspondre à $STRAVA_CRON_SECRET dans strava-env.php.
$forceRefresh = false;
if (isset($_GET['force']) && $_GET['force'] === '1') {
    $cronSecret = $STRAVA_CRON_SECRET ?? '';
    $reqSecret  = $_GET['secret'] ?? '';
    if ($cronSecret !== '' && hash_equals($cronSecret, $reqSecret)) {
        $forceRefresh = true;
    }
    // Secret absent ou incorrect → on ignore silencieusement le ?force=1
    // (pas d'erreur pour ne pas révéler l'existence du secret)
}

if (!$forceRefresh && file_exists($cacheFile)) {
    $rawCache = file_get_contents($cacheFile);
    $cache    = json_decode($rawCache, true);
    if ($cache && isset($cache['ts'])) {
        $staleData = $cache['data'];
        if ((time() - $cache['ts']) < $cacheTTL) {
            header('X-Strava-Cache: HIT');
            echo json_encode($cache['data']);
            exit;
        }
    }
} elseif ($forceRefresh && file_exists($cacheFile)) {
    // En mode force, charger quand même le stale pour le fallback si Strava est KO
    $rawCache = @file_get_contents($cacheFile);
    $cache    = $rawCache ? json_decode($rawCache, true) : null;
    if ($cache && isset($cache['data'])) {
        $staleData = $cache['data'];
    }
}

// ── Helper : GET Strava avec Bearer ──────────────────────────────────────────
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

function stravaGet(string $url, string $token): ?array {
    $ctx = stream_context_create(['http' => [
        'method'        => 'GET',
        'header'        => "Authorization: Bearer $token\r\nUser-Agent: OceanPhenix-TourData/1.0\r\n",
        'timeout'       => 12,
        'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    return $raw !== false ? json_decode($raw, true) : null;
}

// ── Étape 1 : Refresh access token ──────────────────────────────────────────
$tokenCtx = stream_context_create(['http' => [
    'method'        => 'POST',
    'header'        => "Content-Type: application/x-www-form-urlencoded\r\nUser-Agent: OceanPhenix-TourData/1.0\r\n",
    'content'       => http_build_query([
        'client_id'     => $STRAVA_CLIENT_ID,
        'client_secret' => $STRAVA_CLIENT_SECRET,
        'refresh_token' => $STRAVA_REFRESH_TOKEN,
        'grant_type'    => 'refresh_token',
    ]),
    'timeout'       => 12,
    'ignore_errors' => true,
]]);
$tokenRaw = @file_get_contents(STRAVA_TOKEN_URL, false, $tokenCtx);

if (!$tokenRaw) {
    // Strava injoignable → servir le cache périmé si disponible
    if ($staleData) {
        header('X-Strava-Cache: STALE');
        echo json_encode($staleData);
        exit;
    }
    http_response_code(502);
    echo json_encode(['error' => 'Impossible de contacter l\'API Strava']);
    exit;
}

$tokenData = json_decode($tokenRaw, true);
if (empty($tokenData['access_token'])) {
    http_response_code(502);
    echo json_encode([
        'error'  => 'Token Strava invalide ou expiré',
        'detail' => $tokenData['message'] ?? 'Réautorisez l\'application Strava',
    ]);
    exit;
}

$accessToken = $tokenData['access_token'];

// Auto-sauvegarde si Strava a fait tourner le refresh token
if (!empty($tokenData['refresh_token']) && $tokenData['refresh_token'] !== $STRAVA_REFRESH_TOKEN) {
    $newRefresh  = $tokenData['refresh_token'];
    $envContent  = "<?php\n";
    $envContent .= "\$STRAVA_CLIENT_ID     = " . var_export((string)$STRAVA_CLIENT_ID, true) . ";\n";
    $envContent .= "\$STRAVA_CLIENT_SECRET = " . var_export((string)$STRAVA_CLIENT_SECRET, true) . ";\n";
    $envContent .= "\$STRAVA_REFRESH_TOKEN = " . var_export((string)$newRefresh, true) . ";\n";
    @file_put_contents($envFile, $envContent);
}

// ── Étape 2 : Profil athlète ─────────────────────────────────────────────────
$athlete   = stravaGet('https://www.strava.com/api/v3/athlete', $accessToken);
$athleteId = $athlete['id'] ?? null;

// ── Étape 3 : 30 dernières activités ────────────────────────────────────────
$rawActivities = stravaGet(
    'https://www.strava.com/api/v3/athlete/activities?per_page=100&page=1',
    $accessToken
) ?? [];

// ── Étape 4 : Stats cumulées (YTD) ───────────────────────────────────────────
$stats = $athleteId
    ? stravaGet("https://www.strava.com/api/v3/athletes/$athleteId/stats", $accessToken)
    : null;

// ── Traitement des activités ─────────────────────────────────────────────────
$totalDist = 0;
$totalElev = 0;
$totalTime = 0;
$processed = [];

foreach ($rawActivities as $act) {
    $dist = $act['distance'] ?? 0;
    $elev = $act['total_elevation_gain'] ?? 0;
    $time = $act['moving_time'] ?? 0;

    $totalDist += $dist;
    $totalElev += $elev;
    $totalTime += $time;

    $processed[] = [
        'id'           => $act['id'],
        'name'         => $act['name'],
        'type'         => $act['sport_type'] ?? $act['type'],
        'date'         => $act['start_date_local'],
        'distance_km'  => round($dist / 1000, 2),
        'elevation_m'  => (int)round($elev),
        'duration_s'   => (int)$time,
        'avg_speed_kmh'=> round(($act['average_speed'] ?? 0) * 3.6, 1),
        'avg_hr'       => isset($act['average_heartrate']) ? (int)round($act['average_heartrate']) : null,
        'kudos'        => $act['kudos_count'] ?? 0,
        'polyline'     => $act['map']['summary_polyline'] ?? null,
        'strava_url'   => "https://www.strava.com/activities/{$act['id']}",
        'max_hr'       => isset($act['max_heartrate'])              ? (int)$act['max_heartrate']                       : null,
        'calories'     => isset($act['calories'])                   ? (int)$act['calories']                            : null,
        'avg_watts'    => isset($act['average_watts'])              ? (int)round($act['average_watts'])                : null,
        'w_avg_watts'  => isset($act['weighted_average_watts'])     ? (int)round($act['weighted_average_watts'])       : null,
        'cadence'      => isset($act['average_cadence'])            ? round($act['average_cadence'], 1)                : null,
        'suffer'       => isset($act['suffer_score'])               ? (int)$act['suffer_score']                       : null,
        'pr_count'     => (int)($act['pr_count']                   ?? 0),
        'achievements' => (int)($act['achievement_count']          ?? 0),
        'is_trainer'   => !empty($act['trainer']),
    ];
}

// ── Construction de la réponse ───────────────────────────────────────────────
$data = [
    'athlete' => [
        'name'   => trim(($athlete['firstname'] ?? '') . ' ' . ($athlete['lastname'] ?? '')),
        'avatar' => $athlete['profile_medium'] ?? null,
        'city'   => $athlete['city'] ?? null,
    ],
    'recent_30' => [
        'total_km'         => round($totalDist / 1000, 1),
        'total_elevation_m'=> (int)round($totalElev),
        'total_time_h'     => round($totalTime / 3600, 1),
        'count'            => count($rawActivities),
    ],
    'ytd' => $stats ? [
        'run_km'           => round(($stats['ytd_run_totals']['distance'] ?? 0) / 1000, 1),
        'ride_km'          => round(($stats['ytd_ride_totals']['distance'] ?? 0) / 1000, 1),
        'swim_m'           => (int)round($stats['ytd_swim_totals']['distance'] ?? 0),
        'total_elevation_m'=> (int)round(
            ($stats['ytd_run_totals']['elevation_gain']  ?? 0) +
            ($stats['ytd_ride_totals']['elevation_gain'] ?? 0)
        ),
    ] : null,
    'activities'    => array_slice($processed, 0, 50),
    'total_count'   => count($processed),
    'updated_at'    => date('c'),
];

// ── Mise en cache ────────────────────────────────────────────────────────────
@file_put_contents($cacheFile, json_encode(['ts' => time(), 'data' => $data], JSON_PRETTY_PRINT));

header('X-Strava-Cache: ' . ($forceRefresh ? 'FORCE' : 'MISS'));
echo json_encode($data);
