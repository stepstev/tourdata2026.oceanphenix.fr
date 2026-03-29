<?php
/**
 * Radar Terrain — Proxy API
 * OceanPhenix TourData 2026
 *
 * Proxifie les appels vers data.gouv.fr / opendatasoft pour éviter
 * les erreurs CORS en production sur o2switch.
 *
 * Usage :
 *   /api/radar-proxy.php?type=campings&lat=48.63&lon=2.09&radius=10
 *   /api/radar-proxy.php?type=entreprises&dept=91
 *   /api/radar-proxy.php?type=commune&lat=48.63&lon=2.09
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=300'); // Cache 5 min côté client

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
$type   = $_GET['type']   ?? '';
$lat    = isset($_GET['lat'])    ? (float)$_GET['lat']    : null;
$lon    = isset($_GET['lon'])    ? (float)$_GET['lon']    : null;
$radius = isset($_GET['radius']) ? (int)$_GET['radius']   : 10;
$dept   = $_GET['dept']   ?? '';

// ── Validation basique ────────────────────────────────────────────────────────
$radius = max(1, min(50, $radius));
if ($lat !== null && ($lat < -90 || $lat > 90)) { jsonError('Latitude invalide'); }
if ($lon !== null && ($lon < -180 || $lon > 180)) { jsonError('Longitude invalide'); }

// ── Cache fichier (tmp, 5 min par défaut) ────────────────────────────────────
function cacheGet(string $key, int $ttl = 300): ?string {
    $path = sys_get_temp_dir() . '/radar_' . md5($key) . '.json';
    if (!file_exists($path)) return null;
    if ((time() - filemtime($path)) > $ttl) return null;
    return file_get_contents($path) ?: null;
}

function cacheSet(string $key, string $data): void {
    $path = sys_get_temp_dir() . '/radar_' . md5($key) . '.json';
    @file_put_contents($path, $data);
}

function proxyFetchCached(string $url, string $cacheKey, int $ttl = 300): void {
    $cached = cacheGet($cacheKey, $ttl);
    if ($cached !== null) {
        echo $cached;
        exit;
    }
    $body = httpGet($url, 12);
    if ($body === false) {
        jsonError('Erreur lors de la requête vers la source externe', 502);
    }
    // Détecter une réponse HTML/XML d'erreur
    $trimmed = ltrim($body);
    if ($trimmed !== '' && $trimmed[0] === '<') {
        jsonError('Source externe a renvoyé une réponse non-JSON (HTML/XML)', 502);
    }
    // Vérifier JSON valide
    if (json_decode($body) === null) {
        jsonError('Source externe a renvoyé un JSON invalide', 502);
    }
    cacheSet($cacheKey, $body);
    echo $body;
    exit;
}

// ── Purge cache (POST sécurisé, même secret que admin-save.php) ─────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (($body['action'] ?? '') === 'purge-cache') {
        $envFile = __DIR__ . '/admin-env.php';
        if (file_exists($envFile)) { require_once $envFile; }
        if (!defined('ADMIN_SECRET')) { define('ADMIN_SECRET', 'op-admin-save-2026-oceanphenix'); }
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

    case 'campings':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $url = sprintf(
            'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/hebergements-classes/records'
            . '?where=%s&limit=20&select=nom_commercial,adresse,code_postal,commune,coordonnees_geo,classement,nombre_emplacements',
            urlencode("distance(coordonnees_geo, geom'POINT($lon $lat)', {$radius}km) AND type_hebergement = \"Camping\"")
        );
        // Cache 10 min — campings ne changent pas en cours de journée
        proxyFetchCached($url, "campings_{$lat}_{$lon}_{$radius}", 600);
        break;

    case 'entreprises':
        if (empty($dept)) jsonError('dept requis');
        $cacheKey = "entreprises_{$dept}";
        $cached = cacheGet($cacheKey, 1800); // Cache 30 min — très stable
        if ($cached !== null) { echo $cached; exit; }

        $nafs = ['6311Z', '6202A', '7022Z', '6201Z', '5829A'];
        $results = [];
        $debug   = [];
        $tBudget = microtime(true); // budget temps total : 22s max pour 5 NAFs
        foreach ($nafs as $naf) {
            if ((microtime(true) - $tBudget) > 22) {
                $debug[] = "$naf: skip (budget temps épuisé)";
                continue;
            }
            $url = "https://recherche-entreprises.api.gouv.fr/search"
                 . "?activite_principale={$naf}&departement={$dept}&per_page=10&page=1";
            $raw = httpGet($url, 5); // 5s par NAF — évite le timeout PHP global
            if ($raw === false) {
                $debug[] = "$naf: timeout/erreur réseau";
                continue;
            }
            $json = json_decode($raw, true);
            if ($json === null) {
                $debug[] = "$naf: JSON invalide";
                continue;
            }
            $found = count($json['results'] ?? []);
            $debug[] = "$naf: $found résultats bruts";
            if (!empty($json['results'])) {
                // Normaliser les champs utiles uniquement
                foreach ($json['results'] as $e) {
                    $results[] = [
                        'siren'            => $e['siren'] ?? null,
                        'nom_complet'      => $e['nom_complet'] ?? ($e['nom_raison_sociale'] ?? null),
                        'activite_principale' => $e['activite_principale'] ?? $naf,
                        'libelle_activite_principale_libelle_65' => $e['libelle_activite_principale_libelle_65'] ?? null,
                        'tranche_effectif_salarie' => $e['tranche_effectif_salarie'] ?? null,
                        'siege' => isset($e['siege']) ? [
                            'latitude'         => $e['siege']['latitude']         ?? null,
                            'longitude'        => $e['siege']['longitude']        ?? null,
                            'adresse'          => $e['siege']['adresse']          ?? null,
                            'code_postal'      => $e['siege']['code_postal']      ?? null,
                            'libelle_commune'  => $e['siege']['libelle_commune']  ?? null,
                        ] : null,
                    ];
                }
            }
        }
        $out = json_encode([
            'results' => $results,
            '_debug'  => $debug,
            '_dept'   => $dept,
            '_count'  => count($results),
        ], JSON_UNESCAPED_UNICODE);
        cacheSet($cacheKey, $out);
        echo $out;
        break;

    case 'commune':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $url = "https://geo.api.gouv.fr/communes?lat={$lat}&lon={$lon}&fields=codeDepartement,nom&format=json";
        // Cache 1h — la commune ne change pas
        proxyFetchCached($url, "commune_{$lat}_{$lon}", 3600);
        break;

    case 'overpass':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $mode    = in_array($_GET['mode'] ?? '', ['pro', 'cyclo']) ? $_GET['mode'] : 'cyclo';
        $radiusM = $radius * 1000;

        // Garder seulement ce bloc — le second case overpass plus bas est la version correcte
        $cacheKey2 = "overpass_{$mode}_{$lat}_{$lon}_{$radius}";
        $cached2   = cacheGet($cacheKey2, 600);
        if ($cached2 !== null) { echo $cached2; exit; }

        if ($mode === 'pro') {
            $query = "[out:json][timeout:20];"
                   . "(node[amenity=coworking_space](around:{$radiusM},{$lat},{$lon});"
                   . "way[amenity=coworking_space](around:{$radiusM},{$lat},{$lon});"
                   . "node[office=coworking](around:{$radiusM},{$lat},{$lon});"
                   . "way[office=coworking](around:{$radiusM},{$lat},{$lon}););"
                   . "out center tags;";
        } else {
            $query = "[out:json][timeout:25];("
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
        $data = httpPost('https://overpass-api.de/api/interpreter', ['data' => $query], 25);
        if ($data === false) jsonError('Erreur Overpass API', 502);
        // Détecter une réponse XML d'erreur (Overpass timeout, quota…)
        if (ltrim($data)[0] === '<') jsonError('Overpass API indisponible (réponse XML)', 503);
        // Vérifier JSON valide
        $decoded = json_decode($data, true);
        if ($decoded === null) jsonError('Overpass API : réponse JSON invalide', 502);
        cacheSet($cacheKey2, $data);
        echo $data;
        break;

    case 'events':
        if ($lat === null || $lon === null) jsonError('lat/lon requis');
        $openagendaKey = getenv('OPENAGENDA_KEY') ?: '';
        if (empty($openagendaKey)) {
            echo json_encode(['total' => 0, 'events' => [], '_nokey' => true, '_info' => 'Configurez OPENAGENDA_KEY en variable d\'environnement sur le serveur.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $keywords = 'data informatique intelligence-artificielle emploi numérique BI tech développeur recrutement';
        $url = sprintf(
            'https://api.openagenda.com/v2/events?key=%s&latlng=%s,%s&radius=%d&keyword=%s&size=20&monolingual=fr&timings[gte]=%s',
            urlencode($openagendaKey),
            $lat, $lon,
            min(150, $radius * 5), // rayon élargi pour les événements (max 150 km)
            urlencode($keywords),
            urlencode(date('Y-m-d'))
        );
        proxyFetchCached($url, "events_{$lat}_{$lon}", 3600); // Cache 1h
        break;

    case 'salons-nationaux':
        $openagendaKey = getenv('OPENAGENDA_KEY') ?: '';
        if (empty($openagendaKey)) {
            echo json_encode(['total' => 0, 'events' => [], '_nokey' => true, '_info' => 'Configurez OPENAGENDA_KEY sur le serveur.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $keywords = 'data informatique intelligence-artificielle emploi numérique BI tech développeur recrutement salon forum';
        $url = sprintf(
            'https://api.openagenda.com/v2/events?key=%s&keyword=%s&size=50&monolingual=fr&timings[gte]=%s&sort=timings.asc',
            urlencode($openagendaKey),
            urlencode($keywords),
            urlencode(date('Y-m-d'))
        );
        proxyFetchCached($url, 'salons-nationaux', 3600); // Cache 1h
        break;

    default:
        jsonError("Type inconnu : $type. Valeurs acceptées : campings, entreprises, commune, overpass, events");
}

// ── Fonctions utilitaires ─────────────────────────────────────────────────────

function httpPost(string $url, array $params, int $timeout = 10): string|false {
    $body = http_build_query($params);
    $ctx = stream_context_create([
        'http' => [
            'method'     => 'POST',
            'header'     => "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: " . strlen($body),
            'content'    => $body,
            'timeout'    => $timeout,
            'user_agent' => 'OceanPhenix-TourData2026/1.0 (tourdata2026.oceanphenix.fr)',
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
