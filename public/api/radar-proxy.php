<?php
/**
 * Radar Terrain — Proxy API
 * OceanPhenix TourData 2026
 *
 * Proxifie les appels vers Overpass (OSM) + OpenDataSoft (Atout France)
 * pour éviter les erreurs CORS et les timeouts côté navigateur.
 *
 * Handlers actifs :
 *   /api/radar-proxy.php?type=campings&lat=48.63&lon=2.09&radius=10
 *   /api/radar-proxy.php?type=overpass&lat=48.63&lon=2.09&radius=10&mode=pro|cyclo
 *
 * Purge cache (POST) :
 *   POST /api/radar-proxy.php  body: { action: "purge-cache", secret: "..." }
 */

// Augmenter la limite d'exécution PHP pour les appels réseau lents (O2Switch)
@set_time_limit(60);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=300');

// ── CORS (tout sous-domaine oceanphenix.fr + localhost) ───────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = (
    preg_match('#^https?://([\w-]+\.)*oceanphenix\.fr$#', $origin) ||
    preg_match('#^http://localhost:\d+$#', $origin)
);
if ($allowed) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Paramètres ────────────────────────────────────────────────────────────────
$type    = $_GET['type']   ?? '';
$lat     = isset($_GET['lat'])    ? (float)$_GET['lat']    : null;
$lon     = isset($_GET['lon'])    ? (float)$_GET['lon']    : null;
$radius  = isset($_GET['radius']) ? (int)$_GET['radius']   : 10;
$nocache = ($_GET['nocache'] ?? '') === '1'; // Bypass lecture cache fichier

// ── Validation ────────────────────────────────────────────────────────────────
$radius = max(1, min(50, $radius));
if ($lat !== null && ($lat < -90  || $lat > 90))   jsonError('Latitude invalide');
if ($lon !== null && ($lon < -180 || $lon > 180))  jsonError('Longitude invalide');

// ── Cache fichier ─────────────────────────────────────────────────────────────
function cachePath(string $key): string {
    return sys_get_temp_dir() . '/radar_' . md5($key) . '.json';
}

function cacheGet(string $key, int $ttl = 300): ?string {
    $path = cachePath($key);
    if (!file_exists($path)) return null;
    if ((time() - filemtime($path)) > $ttl) return null;
    return file_get_contents($path) ?: null;
}

// Retourne un cache périmé comme fallback de dernier recours
function cacheGetStale(string $key): ?string {
    $path = cachePath($key);
    if (!file_exists($path)) return null;
    return file_get_contents($path) ?: null;
}

function cacheSet(string $key, string $data): void {
    @file_put_contents(cachePath($key), $data);
}

/**
 * Fetch une URL avec cache. Sur erreur réseau, sert le cache périmé si disponible
 * plutôt que de retourner 502 (résilience O2Switch).
 * $nocache = true : ignore la lecture du cache mais continue à écrire.
 */
function proxyFetchCached(string $url, string $cacheKey, int $ttl = 300, bool $nocache = false): void {
    if (!$nocache) {
        $cached = cacheGet($cacheKey, $ttl);
        if ($cached !== null) { echo $cached; exit; }
    }

    $body = httpGet($url, 12);

    if ($body === false) {
        $stale = cacheGetStale($cacheKey);
        if ($stale !== null) {
            header('X-Cache: stale');
            echo $stale;
            exit;
        }
        jsonError('Source externe injoignable', 502);
    }

    $trimmed = ltrim($body);
    if ($trimmed !== '' && $trimmed[0] === '<') {
        $stale = cacheGetStale($cacheKey);
        if ($stale !== null) { header('X-Cache: stale'); echo $stale; exit; }
        jsonError('Source externe a renvoyé du HTML/XML (non-JSON)', 502);
    }

    if (json_decode($body) === null) {
        $stale = cacheGetStale($cacheKey);
        if ($stale !== null) { header('X-Cache: stale'); echo $stale; exit; }
        jsonError('Source externe a renvoyé un JSON invalide', 502);
    }

    cacheSet($cacheKey, $body);
    echo $body;
    exit;
}

// ── Purge cache (POST sécurisé) ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (($body['action'] ?? '') === 'purge-cache') {
        $envFile = __DIR__ . '/admin-env.php';
        if (file_exists($envFile)) require_once $envFile;
        if (!defined('ADMIN_SECRET')) define('ADMIN_SECRET', 'op-admin-save-2026-oceanphenix');
        if (!hash_equals(ADMIN_SECRET, trim($body['secret'] ?? ''))) {
            http_response_code(403);
            echo json_encode(['error' => 'Accès refusé']);
            exit;
        }
        $files   = glob(sys_get_temp_dir() . '/radar_*.json') ?: [];
        $deleted = 0;
        foreach ($files as $f) { if (@unlink($f)) $deleted++; }
        echo json_encode(['ok' => true, 'deleted' => $deleted]);
        exit;
    }
    jsonError('Action POST inconnue', 400);
}

// ── Routage ───────────────────────────────────────────────────────────────────
switch ($type) {

    // ── Campings classifiés (Atout France / OpenDataSoft) ─────────────────────
    case 'campings':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $url = sprintf(
            'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/hebergements-classes/records'
            . '?where=%s&limit=20&select=nom_commercial,adresse,code_postal,commune,coordonnees_geo,classement,nombre_emplacements',
            urlencode("distance(coordonnees_geo, geom'POINT($lon $lat)', {$radius}km) AND type_hebergement = \"Camping\"")
        );
        proxyFetchCached($url, "campings_{$lat}_{$lon}_{$radius}", 600, $nocache);
        break;

    // ── Points d'intérêt OSM via Overpass ─────────────────────────────────────
    case 'overpass':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $mode    = in_array($_GET['mode'] ?? '', ['pro', 'cyclo']) ? $_GET['mode'] : 'cyclo';
        $radiusM = $radius * 1000;

        $cacheKey = "overpass_{$mode}_{$lat}_{$lon}_{$radius}";
        if (!$nocache) {
            $cached = cacheGet($cacheKey, 600);
            if ($cached !== null) { echo $cached; exit; }
        }

        // Timeout OQL calé sur le timeout PHP POST (marge de 2s)
        if ($mode === 'pro') {
            $oqlTimeout = 18;
            $query = "[out:json][timeout:{$oqlTimeout}];"
                   . "(node[amenity=coworking_space](around:{$radiusM},{$lat},{$lon});"
                   . "way[amenity=coworking_space](around:{$radiusM},{$lat},{$lon});"
                   . "node[office=coworking](around:{$radiusM},{$lat},{$lon});"
                   . "way[office=coworking](around:{$radiusM},{$lat},{$lon}););"
                   . "out center tags;";
        } else {
            $oqlTimeout = 22;
            $query = "[out:json][timeout:{$oqlTimeout}];("
                   . "node[tourism=camp_site](around:{$radiusM},{$lat},{$lon});"
                   . "way[tourism=camp_site](around:{$radiusM},{$lat},{$lon});"
                   . "node[leisure=swimming_pool][access!=private](around:{$radiusM},{$lat},{$lon});"
                   . "node[sport=swimming](around:{$radiusM},{$lat},{$lon});"
                   . "node[amenity=drinking_water](around:{$radiusM},{$lat},{$lon});"
                   . "node[man_made=water_tap](around:{$radiusM},{$lat},{$lon});"
                   . "node[amenity=shower](around:{$radiusM},{$lat},{$lon});"
                   . "node[amenity=shelter](around:{$radiusM},{$lat},{$lon});"
                   . "node[tourism=wilderness_hut](around:{$radiusM},{$lat},{$lon});"
                   . "node[tourism=alpine_hut](around:{$radiusM},{$lat},{$lon});"
                   . ");out center tags;";
        }

        // POST timeout = OQL timeout + 2s de marge réseau
        $data = httpPost('https://overpass-api.de/api/interpreter', ['data' => $query], $oqlTimeout + 2);

        if ($data === false) {
            // Fallback : servir le cache périmé plutôt que 502
            $stale = cacheGetStale($cacheKey);
            if ($stale !== null) { header('X-Cache: stale'); echo $stale; exit; }
            jsonError('Overpass API injoignable — réessayez dans quelques secondes', 503);
        }

        $trimmedData = ltrim($data);
        if ($trimmedData !== '' && $trimmedData[0] === '<') {
            // Overpass a renvoyé XML (quota dépassé ou timeout serveur)
            $stale = cacheGetStale($cacheKey);
            if ($stale !== null) { header('X-Cache: stale'); echo $stale; exit; }
            jsonError('Overpass API surchargée — réessayez dans quelques secondes', 503);
        }

        if (json_decode($data, true) === null) {
            $stale = cacheGetStale($cacheKey);
            if ($stale !== null) { header('X-Cache: stale'); echo $stale; exit; }
            jsonError('Overpass API : réponse JSON invalide', 502);
        }

        cacheSet($cacheKey, $data);
        echo $data;
        break;

    default:
        jsonError("Type inconnu : '$type'. Valeurs acceptées : campings, overpass");
}

// ── Fonctions utilitaires ─────────────────────────────────────────────────────

function httpPost(string $url, array $params, int $timeout = 10): string|false {
    $body = http_build_query($params);
    $ctx  = stream_context_create([
        'http' => [
            'method'          => 'POST',
            'header'          => "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: " . strlen($body),
            'content'         => $body,
            'timeout'         => $timeout,
            'user_agent'      => 'OceanPhenix-TourData2026/1.0 (tourdata2026.oceanphenix.fr)',
            'ignore_errors'   => true,
            'follow_location' => true,
        ],
        'ssl' => ['verify_peer' => true],
    ]);
    return @file_get_contents($url, false, $ctx);
}

function httpGet(string $url, int $timeout = 10): string|false {
    $ctx = stream_context_create([
        'http' => [
            'method'          => 'GET',
            'timeout'         => $timeout,
            'user_agent'      => 'OceanPhenix-TourData2026/1.0 (tourdata2026.oceanphenix.fr)',
            'ignore_errors'   => true,
            'follow_location' => true,
            'max_redirects'   => 3,
        ],
        'ssl' => ['verify_peer' => true],
    ]);
    return @file_get_contents($url, false, $ctx);
}

function jsonError(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
