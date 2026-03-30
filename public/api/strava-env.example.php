<?php
/**
 * strava-env.php — Credentials Strava OAuth2 (OceanPhenix TourData 2026)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  SETUP PREMIÈRE FOIS (faire UNE SEULE FOIS sur O2Switch)           │
 * │                                                                     │
 * │  1. Copiez ce fichier en "strava-env.php" dans le même dossier     │
 * │  2. Remplissez vos vraies valeurs Strava ci-dessous                 │
 * │  3. Uploadez strava-env.php via FTP/cPanel — jamais via deploy.bat │
 * │  4. Ne committez JAMAIS strava-env.php (il est dans .gitignore)    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Obtenir vos credentials Strava :
 *   → https://www.strava.com/settings/api
 *   → Créez une application → notez Client ID + Client Secret
 *   → Autorisez l'app et récupérez le Refresh Token (voir README.md)
 *
 * Variables attendues par public/api/strava.php :
 */

$STRAVA_CLIENT_ID     = 'votre_client_id_numerique';          // ex: 123456
$STRAVA_CLIENT_SECRET = 'votre_client_secret_hex';             // ex: a1b2c3d4e5f6...
$STRAVA_REFRESH_TOKEN = 'votre_refresh_token_initial';         // ex: fe65e09...
$STRAVA_CRON_SECRET   = 'chaine-aleatoire-pour-le-cron';       // ex: op-cron-strava-2026-XXXXX
