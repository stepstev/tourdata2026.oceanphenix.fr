# Déploiement — OceanPhenix / TourData 2026
## Hébergement : O2Switch (mutualisé, cPanel, Apache + PHP 8.x)
## URL de production : `https://www.tourdata2026.oceanphenix.fr`

---

## TL;DR — Mise à jour rapide (déploiement courant)

```
1. npm run build
2. double-clic sur deploy.bat
3. Vérifier https://www.tourdata2026.oceanphenix.fr
```

C'est tout. Le script `deploy.bat` fait le build ET le FTP automatiquement.

---

## Prérequis (une seule fois sur votre machine)

| Outil | Téléchargement |
|---|---|
| Node.js 20+ | https://nodejs.org |
| WinSCP | https://winscp.net/eng/download.php |
| Fichier `deploy.env` | voir § 1.1 ci-dessous |

### 1.1 Créer `deploy.env` à la racine du projet

Copier `deploy.env.example` → `deploy.env` et remplir :

```env
FTP_HOST=ftp.oceanphenix.fr
FTP_USER=votre_login_cpanel
FTP_PASS=votre_mot_de_passe_ftp
FTP_REMOTE=/www/tourdata2026.oceanphenix.fr/
```

> `deploy.env` est exclu du repo par `.gitignore` — ne jamais le committer.

---

## 1. Première installation sur O2Switch

### 1.2 Uploader le site pour la première fois

```bash
npm run build
```
puis double-clic sur `deploy.bat`.

Le script WinSCP synchronise `dist/` → dossier distant avec `--delete`
(supprime les anciens fichiers, conserve ce qui n'est pas dans `dist/`).

### 1.3 Créer `strava-env.php` sur le serveur

Ce fichier contient les credentials Strava. Il **n'est pas dans `dist/`** — à créer manuellement **une seule fois**.

Via **cPanel → Gestionnaire de fichiers** ou FileZilla :

**Chemin sur le serveur** : `www/tourdata2026.oceanphenix.fr/api/strava-env.php`

```php
<?php
$STRAVA_CLIENT_ID     = '213901';
$STRAVA_CLIENT_SECRET = 'VOTRE_SECRET';
$STRAVA_REFRESH_TOKEN = 'VOTRE_REFRESH_TOKEN';
$STRAVA_CRON_SECRET   = 'op-cron-strava-2026-oceanphenix';
```

> Le `.htaccess` de `api/` bloque l'accès direct (→ 403). Ne jamais committer ce fichier.

### 1.4 Permissions des fichiers PHP

Via **cPanel → Gestionnaire de fichiers → Modifier permissions** :

| Fichier | Permission |
|---|---|
| `api/strava.php` | `644` |
| `api/radar-proxy.php` | `644` |
| `api/strava-env.php` | `600` |

### 1.5 Cron Strava (optionnel)

Dans **cPanel → Tâches planifiées (Cron Jobs)** :

```
*/15 * * * *   curl -s "https://www.tourdata2026.oceanphenix.fr/api/strava.php?force=1&secret=op-cron-strava-2026-oceanphenix" > /dev/null
```

---

## 2. Mise à jour du site (déploiement courant)

### Option A — Automatique (recommandée)

```
double-clic deploy.bat
```

Le script fait :
1. `npm run build` — génère `dist/`
2. WinSCP synchronise `dist/` → O2Switch par FTP/TLS
3. Affiche l'URL de prod à la fin

**Log disponible** dans `deploy.log` à la racine en cas d'erreur.

### Option B — Manuelle (FileZilla)

1. `npm run build`
2. Ouvrir FileZilla → se connecter à `ftp.oceanphenix.fr`
3. Naviguer vers `/www/tourdata2026.oceanphenix.fr/`
4. Glisser le **contenu** de `dist/` (pas le dossier lui-même)
5. Activer "Écraser les fichiers existants" (Édition → Paramètres → Transferts)

> **Ne jamais uploader** : `node_modules/`, `src/`, `.git/`, `deploy.env`, `admin-api.cjs`

### Ce que contient `dist/` après le build

```
dist/
├── index.html
├── radar/index.html          ← page radar (statique)
├── terrain/index.html
├── strava/index.html
├── assets/                   ← CSS + JS hashés
├── api/
│   ├── radar-proxy.php       ← proxy Radar (PHP)
│   ├── strava.php            ← proxy Strava (PHP)
│   ├── strava-mock.json
│   └── .htaccess             ← protège strava-env.php
├── .htaccess                 ← HTTPS, GZIP, cache
└── ...
```

---

## 3. Faire fonctionner la page Radar en production

### Comment fonctionne le Radar

La page `/radar` est un site statique (HTML + JS). Le JavaScript appelle un proxy PHP
côté serveur pour éviter les erreurs CORS des APIs externes :

```
Navigateur → /api/radar-proxy.php → Campings : public.opendatasoft.com
                                  → Entreprises : recherche-entreprises.api.gouv.fr
                                  → Commune : geo.api.gouv.fr
Navigateur → overpass-api.de      ← direct (CORS ok, pas de proxy nécessaire)
```

### Ce qui est automatique

`radar-proxy.php` est dans `public/api/` → il est inclus dans `dist/api/` à chaque build
et uploadé automatiquement par `deploy.bat`. **Aucune configuration manuelle** n'est
nécessaire après le premier déploiement.

### Vérification que le Radar fonctionne

Tester ces URLs après déploiement :

```
https://www.tourdata2026.oceanphenix.fr/api/radar-proxy.php
  → doit retourner : {"error":"Type inconnu : ..."}  ← 400 JSON (normal, paramètre manquant)

https://www.tourdata2026.oceanphenix.fr/api/radar-proxy.php?type=commune&lat=48.86&lon=2.35
  → doit retourner : [{"nom":"Paris","codeDepartement":"75"}]
```

Si vous obtenez une page blanche ou une erreur 500 → voir § 5 Dépannage.

### Configuration CORS dans `radar-proxy.php`

Le proxy autorise les origines suivantes (déjà configurées) :

```php
'https://www.tourdata2026.oceanphenix.fr',
'https://tourdata2026.oceanphenix.fr',
'https://oceanphenix.fr',
'https://www.oceanphenix.fr',
'http://localhost:4321',  // dev
'http://localhost:4322',  // dev
```

Si vous ajoutez un nouveau domaine, modifier `$allowedOrigins` dans `public/api/radar-proxy.php`
puis redéployer.

### Cache du Radar

Le proxy stocke les réponses dans `/tmp` du serveur O2Switch :

| Type | Durée |
|---|---|
| Campings | 10 min |
| Communes | 1 heure |
| Entreprises | 30 min |

O2Switch autorise l'écriture dans `/tmp` — aucune configuration nécessaire.

---

## 4. Vérifications post-déploiement

| URL | Résultat attendu |
|---|---|
| `https://www.tourdata2026.oceanphenix.fr/` | Redirect 301 → `/terrain/` |
| `https://www.tourdata2026.oceanphenix.fr/terrain/` | Page terrain charge |
| `https://www.tourdata2026.oceanphenix.fr/radar/` | Page radar charge, carte Leaflet visible |
| `https://www.tourdata2026.oceanphenix.fr/strava/` | Point vert, données réelles (pas "mock") |
| `https://www.tourdata2026.oceanphenix.fr/api/radar-proxy.php` | JSON `{"error":"Type inconnu..."}` |
| `https://www.tourdata2026.oceanphenix.fr/api/strava-env.php` | **403 Forbidden** ← obligatoire |
| `https://www.tourdata2026.oceanphenix.fr/api/strava-cache.json` | **403 Forbidden** ← obligatoire |
| `http://www.tourdata2026.oceanphenix.fr/` | Redirect 301 → `https://` |

---

## 5. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Radar : "aucun résultat" sans erreur réseau | `radar-proxy.php` absent | Redéployer avec `deploy.bat` |
| Erreur 500 sur `radar-proxy.php` | `allow_url_fopen` désactivé | cPanel → PHP Settings → activer `allow_url_fopen` |
| Erreur CORS sur `/api/radar-proxy.php` | Domaine non listé | Ajouter l'URL dans `$allowedOrigins` dans `radar-proxy.php` |
| Radar : erreur sur Overpass API | API externe lente/indisponible | Normal, réessayer — l'API est publique et parfois lente |
| Page `/strava` affiche "mock" | `strava-env.php` absent | Créer le fichier via cPanel (§ 1.3) |
| `strava-env.php` retourne 200 au lieu de 403 | `.htaccess` api/ non uploadé | Uploader `dist/api/.htaccess` |
| CSS/JS non chargés après update | Hash assets changé | Vider le cache navigateur (`Ctrl+Shift+R`) |
| Erreur 500 sur PHP en général | Permission incorrecte | Mettre `644` sur les `.php` (§ 1.4) |
| HTTPS non forcé | `.htaccess` racine manquant | Uploader `dist/.htaccess` |
| `deploy.bat` bloque sur WinSCP | WinSCP non installé | Installer depuis https://winscp.net |
| `deploy.bat` bloque sur `deploy.env` | Fichier manquant | Copier `deploy.env.example` → `deploy.env` et remplir |

---

## 6. Tag activités Strava

Ajouter `#Tourdata2026` dans le titre d'une activité Strava.
Effectif au prochain chargement (cache max 10 min, ou 15 min si cron actif).

---

## 7. Résumé des fichiers importants

| Fichier | Rôle | Dans le repo |
|---|---|---|
| `public/api/radar-proxy.php` | Proxy Radar (APIs campings, entreprises, commune) | ✅ oui |
| `public/api/strava.php` | Proxy Strava OAuth2 | ✅ oui |
| `public/api/.htaccess` | Protège `strava-env.php` | ✅ oui |
| `public/.htaccess` | HTTPS, GZIP, cache, CSP | ✅ oui |
| `deploy.bat` | Script build + FTP automatique | ✅ oui |
| `deploy.env.example` | Template credentials FTP | ✅ oui |
| `deploy.env` | Credentials FTP réels | ❌ non (`.gitignore`) |
| `api/strava-env.php` (sur serveur) | Credentials Strava — **créer sur le serveur** | ❌ jamais |
