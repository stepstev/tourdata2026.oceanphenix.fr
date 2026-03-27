# Garmin Connect → Strava API — Guide d'exploitation TourData 2026

Chaîne complète : **Garmin Edge/Forerunner → Garmin Connect → Strava → PHP Proxy → Page `/strava`**

---

## 1. Flux de données

```
Appareil Garmin
    │  Bluetooth / USB / WiFi
    ▼
Garmin Connect (app mobile / web)
    │  Synchronisation automatique (partenariat officiel)
    ▼
Strava (strava.com)
    │  OAuth2 API — refresh_token stocké côté serveur
    ▼
public/api/strava.php  ← proxy PHP (cache 10 min)
    │  JSON structuré
    ▼
/strava  (page Astro — fetch toutes les 60 s)
```

---

## 2. Activer la synchronisation Garmin → Strava

1. Dans **Garmin Connect** (app ou web) → *Paramètres → Applications connectées*
2. Connecter le compte **Strava** (autorisation OAuth)
3. Toutes les nouvelles activités Garmin sont désormais envoyées automatiquement à Strava dans les minutes suivant la synchronisation de l'appareil.

**Données transmises par Garmin via Strava :**

| Champ Garmin | Champ Strava API | Disponible dans proxy |
|---|---|---|
| GPS track | `map.summary_polyline` | `polyline` (encodé) |
| Distance | `distance` | `distance_km` |
| Dénivelé positif | `total_elevation_gain` | `elevation_m` |
| Durée active | `moving_time` | `duration_s` |
| Vitesse moy. | `average_speed` | `avg_speed_kmh` |
| FC moyenne | `average_heartrate` | `avg_hr` |
| Type de sport | `sport_type` | `type` |
| Nom de l'activité | `name` | `name` |
| Date locale | `start_date_local` | `date` |
| Kudos | `kudos_count` | `kudos` |

> **Données Garmin NON exposées par Strava :** cadence, puissance, VO2max, Body Battery, stress, sleep. Ces données restent dans Garmin Connect et nécessitent l'API Garmin Health séparément.

---

## 3. Configuration Strava API (OAuth2)

### 3.1 Créer l'application

1. Aller sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Remplir :
   - **Application Name** : OceanPhenix TourData
   - **Website** : `https://oceanphenix.fr`
   - **Authorization Callback Domain** : `localhost`
3. Récupérer `Client ID` et `Client Secret`

### 3.2 Obtenir le refresh token (une seule fois)

**Étape A — Ouvrir dans le navigateur :**
```
https://www.strava.com/oauth/authorize
  ?client_id=VOTRE_CLIENT_ID
  &response_type=code
  &redirect_uri=http://localhost/
  &approval_prompt=force
  &scope=activity:read_all
```

Autoriser l'accès → Strava redirige vers `http://localhost/?code=XXXX&scope=...`

**Étape B — Échanger le code contre les tokens :**
```bash
curl -X POST https://www.strava.com/oauth/token \
  -d "client_id=VOTRE_CLIENT_ID" \
  -d "client_secret=VOTRE_CLIENT_SECRET" \
  -d "code=CODE_DE_LETAPE_A" \
  -d "grant_type=authorization_code"
```

Réponse JSON :
```json
{
  "access_token": "...",
  "refresh_token": "GARDER_CE_TOKEN",
  "expires_at": 1234567890
}
```

> Le `refresh_token` est permanent (jusqu'à révocation). L'`access_token` expire après 6 h — le proxy le renouvelle automatiquement.

### 3.3 Créer le fichier de credentials

Créer **sur le serveur uniquement** (jamais dans git) :

```
public/api/strava-env.php
```

```php
<?php
$STRAVA_CLIENT_ID     = '12345';
$STRAVA_CLIENT_SECRET = 'abc...def';
$STRAVA_REFRESH_TOKEN = 'xyz...uvw';
$STRAVA_CRON_SECRET   = 'un-secret-long-aleatoire-pour-le-cron';
```

Upload via FTP/SFTP — ce fichier est exclu du repo par `.gitignore`.

---

## 4. Structure de la réponse JSON (`/api/strava.php`)

```json
{
  "athlete": {
    "name":   "Stéphane Celton",
    "avatar": "https://dgalywyr863hv.cloudfront.net/...",
    "city":   "Bordeaux"
  },
  "recent_30": {
    "total_km":          342.5,
    "total_elevation_m": 4820,
    "total_time_h":      28.3,
    "count":             18
  },
  "ytd": {
    "run_km":            125.0,
    "ride_km":           1240.5,
    "swim_m":            0,
    "total_elevation_m": 15600
  },
  "activities": [
    {
      "id":            12345678901,
      "name":          "Sortie Bordeaux → Arcachon",
      "type":          "Ride",
      "date":          "2026-03-19T08:30:00",
      "distance_km":   62.4,
      "elevation_m":   380,
      "duration_s":    9240,
      "avg_speed_kmh": 24.3,
      "avg_hr":        142,
      "kudos":         12,
      "polyline":      "encodedPolylineString...",
      "strava_url":    "https://www.strava.com/activities/12345678901"
    }
  ],
  "total_count": 10,
  "updated_at":  "2026-03-19T10:45:00+02:00"
}
```

> `activities` contient les 10 premières des 30 dernières (tri Strava : plus récente en premier).

---

## 5. Cache et rafraîchissement

| Mécanisme | Comportement |
|---|---|
| **Cache normal** | Réponse servie depuis `strava-cache.json` pendant 10 min |
| **Cache STALE** | Si Strava est injoignable, données périmées servies (header `X-Strava-Cache: STALE`) |
| **Force refresh** | `GET /api/strava.php?force=1&secret=VOTRE_CRON_SECRET` — bypass le TTL |
| **Auto-rotate token** | Si Strava émet un nouveau refresh_token, `strava-env.php` est mis à jour automatiquement |

### Cron cPanel (rafraîchissement toutes les 10 min)

```bash
*/10 * * * * curl -s "https://oceanphenix.fr/api/strava.php?force=1&secret=VOTRE_CRON_SECRET" > /dev/null
```

---

## 6. Données Garmin manquantes — extensions possibles

Pour accéder aux données santé Garmin (FC repos, sommeil, stress, VO2max) :

- **Garmin Health API** — accès restreint aux partenaires officiels
- **Garmin Connect IQ** — apps tierces sur l'appareil
- **Export FIT manuel** — `Garmin Connect → Activité → Exporter en FIT` puis parsage avec une lib PHP/Python

**Librairies de parsing FIT :**
- PHP : [adriangibbons/php-fit-file-analysis](https://github.com/adriangibbons/php-fit-file-analysis)
- Python : `fitparse` (`pip install fitparse`)
- Node.js : `fit-file-parser` (`npm install fit-file-parser`)

---

## 7. Fichiers concernés dans le projet

```
public/
  api/
    strava.php          ← proxy OAuth2 + cache (dans le repo)
    strava-env.php      ← credentials (HORS repo, sur serveur uniquement)
    strava-cache.json   ← cache généré automatiquement (HORS repo)

src/
  pages/
    strava.astro        ← page de visualisation

docs/
  STRAVA-GARMIN-API.md  ← ce fichier
```

---

## 8. Dépannage

| Erreur | Cause probable | Solution |
|---|---|---|
| `Strava non configuré` | `strava-env.php` absent | Uploader le fichier sur le serveur |
| `Token Strava invalide ou expiré` | Refresh token révoqué | Réautoriser l'app (étapes 3.2 A+B) |
| `Impossible de contacter l'API Strava` | Strava down ou timeout | Attendre — le cache périmé est servi |
| Page affiche `—` partout | Erreur JS ou CORS | Vérifier la console navigateur et les origines autorisées dans `strava.php` |
| Activité Garmin absente | Sync Garmin → Strava en retard | Attendre quelques minutes après la sync Garmin |
