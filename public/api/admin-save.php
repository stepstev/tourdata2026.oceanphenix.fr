<?php
/**
 * admin-save.php — Publication unifiée Admin Terrain
 * OceanPhenix TourData 2026
 *
 * Reçoit un POST JSON depuis l'interface admin et écrit
 * {webroot}/data/site-data.json sur O2Switch (fonctionne quel que soit le dossier du sous-domaine).
 *
 * Payload attendu :
 *   { secret, terrain, coworking, radar }
 *
 * Réponse JSON :
 *   { ok: true, updated_at, summary }  |  { error: "..." } (HTTP 4xx)
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// ── CORS (tout sous-domaine oceanphenix.fr + localhost) ──────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$corsOk = (
    preg_match('#^https?://([\w-]+\.)*oceanphenix\.fr$#', $origin) ||
    preg_match('#^http://localhost:\d+$#', $origin)
);
if ($corsOk) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Méthode unique : POST ─────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Lecture du body JSON ──────────────────────────────────────────────────────
$raw = file_get_contents('php://input');
if (!$raw) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}
$payload = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON: ' . json_last_error_msg()]);
    exit;
}

// ── Clé secrète (modifier ici APRÈS le premier upload sur o2switch) ───────────
// Par sécurité, définir ADMIN_SECRET dans un fichier admin-env.php non versionné.
// Si absent, repli sur la clé par défaut définie à l'installation.
$envFile = __DIR__ . '/admin-env.php';
if (file_exists($envFile)) {
    require $envFile; // doit définir : define('ADMIN_SECRET', 'votre-clé');
}
if (!defined('ADMIN_SECRET')) {
    define('ADMIN_SECRET', 'op-admin-save-2026-oceanphenix');
}

$receivedSecret = trim($payload['secret'] ?? '');
if (!hash_equals(ADMIN_SECRET, $receivedSecret)) {
    http_response_code(403);
    echo json_encode(['error' => 'Clé incorrecte — accès refusé']);
    exit;
}

// ── Destination : ../data/site-data.json ─────────────────────────────────────
$dataDir  = dirname(__DIR__) . '/data';
$destFile = $dataDir . '/site-data.json';

if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['error' => 'Impossible de créer /data/']);
    exit;
}

// ── Construction du document à écrire ────────────────────────────────────────
$updatedAt = date('c'); // ISO 8601
$document  = [
    'updated_at' => $updatedAt,
    'terrain'    => $payload['terrain']   ?? [],
    'coworking'  => $payload['coworking'] ?? [],
    'radar'      => $payload['radar']     ?? [],
];

$json = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur encodage JSON']);
    exit;
}

// Écriture atomique (tmp → rename)
$tmpFile = $destFile . '.tmp';
if (file_put_contents($tmpFile, $json, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Impossible d\'écrire sur le disque']);
    exit;
}
if (!rename($tmpFile, $destFile)) {
    @unlink($tmpFile);
    http_response_code(500);
    echo json_encode(['error' => 'Impossible de finaliser l\'écriture']);
    exit;
}

// ── Résumé pour l'interface ───────────────────────────────────────────────────
$terrain   = $document['terrain'];
$nbEtapes  = count($terrain['etapes']  ?? []);
$nbJournal = count($terrain['journal'] ?? []);
$nbCo      = count($document['coworking']);
$nbRadar   = count($document['radar']['entreprises'] ?? [])
           + count($document['radar']['salons']      ?? [])
           + count($document['radar']['events']      ?? []);

$summary = "{$nbEtapes} étapes · {$nbJournal} entrées journal · {$nbCo} coworking · {$nbRadar} radar";

echo json_encode([
    'ok'         => true,
    'updated_at' => $updatedAt,
    'summary'    => $summary,
]);
