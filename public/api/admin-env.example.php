<?php
/**
 * admin-env.php — Clé secrète Admin (OceanPhenix TourData 2026)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  SETUP PREMIÈRE FOIS (faire UNE SEULE FOIS sur O2Switch)           │
 * │                                                                     │
 * │  1. Copiez ce fichier en "admin-env.php" dans le même dossier      │
 * │  2. Remplacez la clé ci-dessous par une chaîne aléatoire forte     │
 * │  3. Uploadez admin-env.php via FTP/cPanel — jamais via deploy.bat  │
 * │  4. Ne committez JAMAIS admin-env.php (il est dans .gitignore)     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Cette clé protège l'endpoint admin-save.php (écriture de site-data.json).
 * Elle doit correspondre à la valeur saisie dans l'interface Admin Terrain.
 *
 * Générer une clé aléatoire :
 *   → https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html
 *   → ou en terminal : openssl rand -hex 24
 */

define('ADMIN_SECRET', 'remplacer-par-une-cle-aleatoire-forte');
