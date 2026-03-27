# OceanPhenix.fr — TourData 2026

> **OceanPhenix™** · Data Product Management · Business Intelligence · Observabilité · Innovation IA

Site vitrine et plateforme de projet pour **TourData 2026** — un parcours cyclo professionnel
croisant exploration terrain, data en open data et recrutement Data / IT.

**Production :** [tourdata2026.oceanphenix.fr](https://tourdata2026.oceanphenix.fr)

---

## Stack technique

| Couche | Technologie |
| ------ | ----------- |
| Framework | [Astro v4](https://astro.build) (SSG) |
| CSS | Design tokens + CSS custom properties scopé par page |
| JS | Vanilla JS — zéro framework front |
| Carte | [Leaflet.js](https://leafletjs.com) + [MarkerCluster](https://github.com/Leaflet/Leaflet.markercluster) (local) |
| APIs | Overpass (OSM), recherche-entreprises.api.gouv.fr, OpenAgenda, opendatasoft |
| Proxy | PHP 8 (`/api/radar-proxy.php`) — CORS + cache fichier |
| Hébergement | O2Switch (FTP sync via WinSCP) |
| Déploiement | `deploy.bat` — build + FTP push |
| Fonts | Inter (Google Fonts) |
| Icons | Font Awesome 6.5 (CDN) |

---

## Structure du projet

```text
src/
├── components/
│   ├── Nav.astro              # Navigation principale
│   ├── Footer.astro           # Pied de page
│   ├── Hero.astro             # Section Hero réutilisable
│   ├── TerrainDashboard.astro # Dashboard stats terrain
│   ├── CvSection.astro        # Section CV / parcours
│   ├── AboutModal.astro       # Modal À propos
│   ├── CguModal.astro         # Modal CGU
│   ├── OceanBackground.astro  # Fond animé
│   ├── ThemeHint.astro        # Hint thème clair/sombre
│   └── WelcomePopup.astro     # Popup de bienvenue
├── layouts/
│   └── BaseLayout.astro       # Layout SEO (OG, Twitter Card, canonical)
├── pages/
│   ├── index.astro            # Accueil
│   ├── portfolio.astro        # Vitrine profil
│   ├── expertises.astro       # Domaines d'expertise
│   ├── tourdata.astro         # Présentation projet TourData 2026
│   ├── etapes.astro           # Étapes du parcours cyclo
│   ├── terrain.astro          # Journal terrain (carte + GPX)
│   ├── radar.astro            # Radar Pro / Cyclo (carte interactive)
│   ├── strava.astro           # Activités Strava
│   ├── rag-2026.astro         # RAG 2026 — IA documentaire
│   ├── admin-terrain.astro    # Interface admin terrain (protégée)
│   └── 404.astro              # Page d'erreur
└── styles/
    ├── tokens.css             # Design tokens (couleurs, typo, espacements)
    └── global.css             # Reset + composants globaux

public/
├── api/
│   └── radar-proxy.php        # Proxy PHP — APIs externes (CORS + cache)
├── lib/
│   ├── leaflet.min.js         # Leaflet.js (local)
│   ├── leaflet.min.css
│   ├── leaflet.markercluster.min.js   # MarkerCluster (local)
│   ├── MarkerCluster.css
│   └── MarkerCluster.Default.css
├── gpx/                       # Traces GPX des étapes
├── Images/                    # Assets visuels
├── robots.txt
└── sitemap.xml
```

---

## Pages

| Route | Description |
| ----- | ----------- |
| `/` | Accueil — Hero, présentation TourData 2026 |
| `/portfolio` | Vitrine profil — parcours, compétences, hashtags |
| `/expertises` | Domaines d'intervention Data / BI / IA |
| `/tourdata` | Projet TourData 2026 — concept, objectifs |
| `/etapes` | Étapes du parcours cyclo — carte + planning |
| `/terrain` | Journal terrain — positions, photos, GPX |
| `/radar` | Radar Pro / Cyclo — carte interactive open data |
| `/strava` | Activités Strava — statistiques vélo |
| `/rag-2026` | Interface RAG — IA documentaire 2026 |
| `/admin-terrain` | Admin terrain — accès restreint |
| `/404` | Page d'erreur personnalisée |

---

## Page Radar — architecture détaillée

La page `/radar` est la fonctionnalité principale de découverte terrain.

### Deux modes

| Mode | Catégories |
| ---- | ---------- |
| **Pro** | Coworkings (OSM Overpass), Entreprises Data/IT (SIRENE), Événements IT/Emploi (OpenAgenda) |
| **Cyclo** | Campings (OSM + data.gouv.fr), Piscines/Baignade, Points d'eau, Douches publiques, Abris/Refuges (OSM Overpass) |

### Sources de données

| Source | Usage | Clé API |
| ------ | ----- | ------- |
| [Overpass API](https://overpass-api.de) | Coworkings, campings OSM, équipements cyclo | Non |
| [opendatasoft — hébergements classés](https://public.opendatasoft.com) | Campings officiels classés | Non |
| [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr) | Entreprises par code NAF + département | Non |
| [OpenAgenda](https://openagenda.com/agendas) | Événements locaux + salons nationaux | Oui (`OPENAGENDA_KEY`) |
| [geo.api.gouv.fr](https://geo.api.gouv.fr) | Résolution commune / département | Non |

### Proxy PHP (`/api/radar-proxy.php`)

Évite les erreurs CORS en production. Gère le cache fichier côté serveur.

| Paramètre `type` | Description | Cache |
| ---------------- | ----------- | ----- |
| `campings` | Campings classés (opendatasoft) par coordonnées + rayon | 10 min |
| `entreprises` | Entreprises Data/IT par département (SIRENE) | 30 min |
| `commune` | Résolution commune depuis lat/lon | 1 h |
| `events` | Événements IT locaux (OpenAgenda) | 1 h |
| `salons-nationaux` | Salons emploi Data/IA nationaux (OpenAgenda) | 2 h |

Variable d'environnement à configurer sur le serveur :
```
OPENAGENDA_KEY=votre_clé_openagenda
```

---

## Développement local

```bash
npm install        # Installer les dépendances
npm run dev        # Dev server → http://localhost:4321
npm run build      # Build production → dist/
npm run preview    # Prévisualiser dist/
```

> Le proxy PHP (`/api/radar-proxy.php`) ne s'exécute qu'en production sur O2Switch.
> En dev, les appels API se font directement depuis le navigateur (CORS permissif en local).

---

## Déploiement

### Automatique (recommandé)

```bat
deploy.bat
```

1. Lit les identifiants FTP dans `deploy.env`
2. Lance `npm run build`
3. Synchronise `dist/` vers O2Switch via WinSCP FTP

### Configuration FTP

Copier `deploy.env.example` → `deploy.env` (non commité) :

```env
FTP_HOST=ftp.oceanphenix.fr
FTP_USER=votre_login_cpanel
FTP_PASS=votre_mot_de_passe_ftp
FTP_REMOTE=/tourdata2026/
```

### Manuel (fallback)

1. `npm run build`
2. Uploader le contenu de `dist/` via FileZilla ou le gestionnaire O2Switch
3. S'assurer que `public/api/radar-proxy.php` est bien déployé dans `public_html/api/`

---

## Branches

| Branche | Usage |
| ------- | ----- |
| `main` | Production — code stable |
| `dev` | Développement actif |

---

## Architecture CSS

- **`tokens.css`** — Source de vérité design (couleurs, typo, espacements, ombres)
- **`global.css`** — Reset, layout, composants partagés
- Chaque page `.astro` contient ses styles scopés dans un bloc `<style>` local
- Thème clair / sombre géré via `[data-theme="light"]` sur `<html>`

---

## SEO

- Open Graph + Twitter Card sur toutes les pages
- Canonical URL par page
- JSON-LD `Person` schema sur `/portfolio`
- `robots.txt` et `sitemap.xml`

---

## Licence

PROPRIÉTAIRE — TOUS DROITS RÉSERVÉS

| Élément | Statut |
| ------- | ------ |
| Code source | Usage privé uniquement |
| Concept & design | Protégé — reproduction interdite |
| Marque OceanPhenix™ | Marque déposée |

---

[tourdata2026.oceanphenix.fr](https://tourdata2026.oceanphenix.fr)
