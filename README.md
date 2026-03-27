# OceanPhenix™ — TourData 2026

> **OceanPhenix™** · Data Product Management · Business Intelligence · Observabilité · Innovation IA

Site vitrine et plateforme de suivi terrain pour **TourData 2026** — parcours cyclo professionnel (~3 150 km, 14 étapes, Avril–Juillet 2026) croisant exploration terrain, open data et recrutement Data / IT.

**Production :** [tourdata2026.oceanphenix.fr](https://tourdata2026.oceanphenix.fr)

---

## Architecture système

```mermaid
graph TB
    subgraph DEV["Poste developpeur Windows"]
        SRC["src/ - Composants Astro"]
        BUILD["npm run build"]
        BAT["deploy.bat - WinSCP FTP"]
    end

    subgraph GH["GitHub"]
        REPO["stepstev/tourdata2026.oceanphenix.fr"]
        CI["GitHub Actions - build check"]
    end

    subgraph O2["O2Switch - Hebergement PHP"]
        DIST["dist/ - HTML CSS JS statiques"]
        PROXY["api/radar-proxy.php"]
        SAVE["api/admin-save.php"]
        SDATA["data/site-data.json"]
    end

    subgraph NAV["Navigateur"]
        LEAF["Leaflet.js - Carte"]
        LS["localStorage - Etat admin"]
    end

    subgraph APIS["APIs Open Data"]
        OSM["Overpass / OSM"]
        SIR["SIRENE - entreprises"]
        OAG["OpenAgenda"]
        ODS["opendatasoft"]
        GEO["geo.api.gouv.fr"]
    end

    SRC --> BUILD --> DIST
    SRC --> REPO --> CI
    BAT -->|"FTP sync dist/"| DIST

    DIST --> LEAF
    DIST --> LS
    LEAF -->|"fetch CORS"| PROXY
    PROXY --> OSM
    PROXY --> SIR
    PROXY --> OAG
    PROXY --> ODS
    PROXY --> GEO

    LS -->|"POST JSON secret key"| SAVE
    SAVE --> SDATA
    SDATA -->|"fetch au chargement"| LEAF
```

---

## Stack technique

| Couche | Technologie | Rôle |
| ------ | ----------- | ---- |
| Framework | [Astro v4](https://astro.build) (SSG) | Génère du HTML statique pur au build — zéro JS serveur |
| CSS | Design tokens + CSS custom properties | `tokens.css` = source de vérité, styles scopés par page |
| JS | Vanilla JS | Zéro framework front — maps, auth, admin, live sync |
| Carte | [Leaflet.js](https://leafletjs.com) + MarkerCluster (local) | Rendu carte OSM, GPX, coworkings, campings |
| APIs | Overpass, SIRENE, OpenAgenda, opendatasoft | Open data terrain : pros, cyclo, événements |
| Proxy | PHP 8 `radar-proxy.php` | Évite CORS, met en cache les réponses API |
| Admin backend | PHP 8 `admin-save.php` | Persiste `site-data.json`, valide secret key |
| Hébergement | O2Switch mutualisé | Supporte PHP — GitHub Pages incompatible |
| Déploiement | `deploy.bat` + WinSCP FTP | Build Astro → sync `dist/` vers sous-domaine O2Switch |
| Fonts | Inter (Google Fonts) | Typographie principale |
| Icons | Font Awesome 6.5 CDN | Icônes interface |

---

## Structure du projet

```text
.
├── src/
│   ├── components/            # Composants Astro réutilisables
│   │   ├── Nav.astro          # Navigation glassmorphism (auth-aware)
│   │   ├── Hero.astro         # Section hero + CTA
│   │   ├── TerrainDashboard.astro  # Dashboard stats (build-time JSON)
│   │   ├── CvSection.astro    # Business card + social links
│   │   ├── Footer.astro
│   │   ├── OceanBackground.astro   # Waves CSS animées
│   │   ├── AboutModal.astro / CguModal.astro / WelcomePopup.astro
│   │   └── ThemeHint.astro    # Toast hint dark/light
│   ├── layouts/
│   │   └── BaseLayout.astro   # Layout SEO : OG, Twitter Card, canonical, JSON-LD
│   ├── pages/
│   │   ├── index.astro        # Accueil
│   │   ├── portfolio.astro    # Vitrine profil
│   │   ├── expertises.astro   # Domaines Data / BI / IA
│   │   ├── tourdata.astro     # Concept TourData 2026
│   │   ├── etapes.astro       # Planning 14 étapes cyclo
│   │   ├── terrain.astro      # Journal terrain live (auth-gardé)
│   │   ├── radar.astro        # Radar Pro/Cyclo — carte open data
│   │   ├── strava.astro       # Activités Strava
│   │   ├── rag-2026.astro     # Demo RAG Platform IA
│   │   ├── admin-terrain.astro # Panel admin 8 onglets (auth SHA-256)
│   │   └── 404.astro
│   ├── data/
│   │   └── terrain-etapes.json # Source de vérité build-time (14 étapes)
│   └── styles/
│       ├── tokens.css         # Variables CSS : couleurs, typo, spacing, ombres
│       ├── global.css         # Reset + composants partagés
│       ├── terrain.css        # Styles page terrain
│       └── terrain-dashboard.css
│
├── public/
│   ├── api/
│   │   ├── admin-save.php     # Endpoint persistance JSON (secret key)
│   │   ├── radar-proxy.php    # Proxy CORS + cache APIs externes
│   │   └── strava.php         # Proxy activités Strava
│   ├── js/
│   │   ├── admin-terrain.js   # Logique panel admin complet
│   │   ├── terrain-maps.js    # Init Leaflet + markers + GPX + coworking
│   │   ├── terrain-live.js    # Sync localStorage → DOM (page terrain)
│   │   ├── main.js            # Theme toggle, scroll, modal, load time
│   │   ├── theme-init.js      # Anti-FOUC (chargé inline dans <head>)
│   │   └── theme-hint.js      # Toast hint thème clair
│   ├── lib/                   # Librairies JS/CSS locales (offline-safe)
│   │   ├── leaflet.min.js / leaflet.min.css
│   │   └── leaflet.markercluster.min.js / MarkerCluster*.css
│   ├── gpx/                   # Traces GPX des étapes
│   └── Images/                # Assets visuels
│
├── deploy.bat                 # Script déploiement Windows (WinSCP FTP)
├── deploy.env.example         # Template identifiants FTP (ne pas commiter)
├── astro.config.mjs
└── package.json
```

---

## Pages et routing

| Route | Fichier | Accès | Description |
| ----- | ------- | ------ | ----------- |
| `/` | `index.astro` | Public | Accueil — Hero, présentation TourData 2026 |
| `/portfolio` | `portfolio.astro` | Public | Vitrine profil — parcours, compétences |
| `/expertises` | `expertises.astro` | Public | 6 domaines d'intervention Data / BI / IA |
| `/tourdata` | `tourdata.astro` | Public | Concept TourData 2026 |
| `/etapes` | `etapes.astro` | Public | Planning 14 étapes cyclo (carte + dates) |
| `/terrain` | `terrain.astro` | Auth | Journal terrain live (positions, photos, GPX) |
| `/radar` | `radar.astro` | Public | Radar Pro/Cyclo — carte interactive open data |
| `/strava` | `strava.astro` | Public | Métriques Strava |
| `/rag-2026` | `rag-2026.astro` | Public | Demo RAG Platform IA 2026 |
| `/admin-terrain` | `admin-terrain.astro` | Admin | Panel admin 8 onglets (auth SHA-256 + CAPTCHA) |
| `/404` | `404.astro` | — | Page d'erreur personnalisée |

---

## Flux d'authentification admin

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant P as /admin-terrain
    participant CS as crypto.subtle
    participant SS as sessionStorage

    U->>P: Saisie mot de passe + CAPTCHA
    P->>CS: SHA-256(password)
    CS-->>P: hash hex
    P->>P: Comparaison hash stocke vs hash calcule

    alt Authentification reussie
        P->>SS: Session v2 - TTL 1h
        P-->>U: Acces panel admin - 8 onglets
    else Echec - max 5 essais
        P-->>U: Lockout 30 secondes
    end

    Note over P,SS: /terrain verifie sessionStorage au chargement
    Note over P,SS: Redirection /admin-terrain si session absente ou expiree
```

---

## Flux de données terrain

```mermaid
flowchart LR
    subgraph ADMIN["Panel Admin /admin-terrain"]
        FORM["Formulaire etapes, journal, position"]
        LS["localStorage op-terrain-admin"]
    end

    subgraph SERVER["O2Switch PHP"]
        PHP["admin-save.php\nvalidation secret key"]
        JSON["data/site-data.json"]
    end

    subgraph PUBLIC["Pages publiques"]
        TERRAIN["/terrain - Journal live"]
        DASH["TerrainDashboard - build time"]
    end

    FORM -->|"collectDashboard + collectPosition"| LS
    LS -->|"POST JSON + secret key"| PHP
    PHP -->|"ecriture atomique"| JSON
    JSON -->|"fetch au chargement"| TERRAIN
    JSON -.->|"lu au npm run build"| DASH

    style PHP fill:#2d4a6e,color:#fff
    style JSON fill:#1a3a1a,color:#aef
```

---

## Architecture Radar — sources open data

```mermaid
graph LR
    subgraph NAV["Navigateur /radar"]
        MAP["Carte Leaflet"]
        MODE{"Mode"}
    end

    subgraph PROXY["radar-proxy.php - Cache serveur"]
        C_ENT["entreprises - 30 min"]
        C_EVT["events locaux - 1h"]
        C_SAL["salons nationaux - 2h"]
        C_CAMP["campings - 10 min"]
        C_COM["commune - 1h"]
    end

    subgraph OPENDATA["APIs Open Data"]
        OSM["Overpass / OSM"]
        SIRENE["SIRENE - entreprises NAF"]
        OA["OpenAgenda"]
        ODS["opendatasoft - campings"]
        GEO["geo.api.gouv.fr"]
    end

    MAP --> MODE
    MODE -->|"Pro"| C_ENT
    MODE -->|"Pro"| C_EVT
    MODE -->|"Pro"| C_SAL
    MODE -->|"Cyclo"| C_CAMP
    MAP -->|"geoloc"| C_COM

    C_ENT --> SIRENE
    C_EVT --> OA
    C_SAL --> OA
    C_CAMP --> ODS
    C_CAMP --> OSM
    C_COM --> GEO
    MAP -->|"direct OSM"| OSM
```

---

## Pipeline de déploiement

```mermaid
sequenceDiagram
    actor DEV as Developpeur
    participant BAT as deploy.bat
    participant NPM as Astro Build
    participant WS as WinSCP
    participant O2 as O2Switch FTP

    DEV->>BAT: Double-clic deploy.bat
    BAT->>BAT: Lecture deploy.env - host user pass remote
    BAT->>NPM: npm run build
    NPM-->>BAT: dist/ genere OK

    BAT->>WS: Execution script FTP inline
    WS->>O2: Connexion FTPS explicite passif
    WS->>O2: synchronize remote -delete dist vers remote
    O2-->>WS: Upload termine
    WS-->>BAT: Exit code 0

    BAT-->>DEV: DEPLOY TERMINE
    Note over BAT,O2: deploy.log disponible pour debug
```

---

## Design system CSS

```mermaid
graph TD
    TOK["tokens.css - source de verite"]
    GLO["global.css - reset + composants partages"]
    TER["terrain.css"]
    TDB["terrain-dashboard.css"]
    SCP["Styles scopes dans chaque composant .astro"]

    TOK --> GLO
    TOK --> TER
    TOK --> TDB
    TOK --> SCP

    subgraph THEME["Theme clair / sombre"]
        DARK["Dark par defaut - primary-dark + accent-cyan"]
        LIGHT["Light via attribut data-theme=light sur html"]
    end

    TOK --> DARK
    DARK -.->|"toggle"| LIGHT
    LIGHT -.->|"toggle"| DARK
```

**Conventions CSS :**
- `tokens.css` — variables globales (couleurs, typographie, espacements, ombres, border-radius)
- `global.css` — reset, layout nav/hero/footer, composants modaux
- Chaque page `.astro` encapsule ses styles dans `<style>` (scopé automatiquement par Astro)
- Thème persisté en `localStorage['op-theme']`

---

## Persistance des données (localStorage)

| Clé | Contenu | Écrit par |
| --- | ------- | --------- |
| `op-terrain-admin` | État complet terrain (étapes, journal, photos, position, compteurs) | Panel admin |
| `op-terrain-gpx` | Fichiers GPX uploadés (XML inline) | Admin — onglet GPX |
| `op-terrain-coworking` | Espaces coworking (lat, lng, nom, visible) | Admin — onglet Coworking |
| `op-theme` | `"light"` ou absent (dark par défaut) | theme-init.js |
| `op-theme-hint-seen` | Boolean — hint thème déjà affiché | theme-hint.js |

---

## Page Radar — sources open data

| Source | Mode | Données | Cache proxy |
| ------ | ---- | ------- | ----------- |
| [Overpass / OSM](https://overpass-api.de) | Pro + Cyclo | Coworkings, campings OSM, équip. cyclo | Direct |
| [opendatasoft](https://public.opendatasoft.com) | Cyclo | Campings officiels classés | 10 min |
| [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr) | Pro | Entreprises par code NAF + département | 30 min |
| [OpenAgenda](https://openagenda.com) | Pro | Événements IT locaux + salons nationaux | 1–2 h |
| [geo.api.gouv.fr](https://geo.api.gouv.fr) | Commun | Résolution commune depuis lat/lon | 1 h |

Variable d'environnement serveur à renseigner dans `admin-env.php` ou l'environnement O2Switch :

```
OPENAGENDA_KEY=votre_cle_openagenda
```

---

## Développement local

```bash
npm install        # Installer les dépendances (Node 20+)
npm run dev        # Dev server → http://localhost:4321
npm run build      # Build production → dist/
npm run preview    # Prévisualiser dist/ en local
```

> **Note :** Le proxy PHP (`radar-proxy.php`, `admin-save.php`) ne s'exécute qu'en production sur O2Switch.  
> En dev, les appels API se font directement depuis le navigateur. Le bouton **Publier tout** retourne une erreur attendue (PHP non disponible).

---

## Déploiement

### Automatique — recommandé

```bat
deploy.bat
```

1. Lit `deploy.env` → identifiants FTP
2. Lance `npm run build` (Astro SSG)
3. Synchronise `dist/` → O2Switch via WinSCP FTP (mode passif + TLS explicite)
4. Génère `deploy.log` pour debug

### Configuration FTP (`deploy.env`)

```env
# Copier depuis deploy.env.example — ne jamais commiter ce fichier
FTP_HOST=ftp.oceanphenix.fr
FTP_USER=votre_login_cpanel
FTP_PASS=votre_mot_de_passe_ftp
FTP_REMOTE=/goal.oceanphenix.fr/   # Dossier cible sur O2Switch
```

> `FTP_REMOTE` = chemin du sous-domaine sur O2Switch (`/goal.oceanphenix.fr/`, `/tourdata2026.oceanphenix.fr/`, etc.)  
> Utiliser `/public_html/` uniquement pour le domaine nu `oceanphenix.fr`.

### CI GitHub Actions

Le workflow `.github/workflows/deploy.yml` vérifie uniquement que le build Astro passe.  
Il ne déploie pas (O2Switch PHP incompatible avec GitHub Pages).

---

## SEO

- Open Graph + Twitter Card sur toutes les pages via `BaseLayout.astro`
- Canonical URL par page
- JSON-LD `Person` schema sur `/portfolio`
- `robots.txt` et `sitemap.xml` statiques dans `public/`

---

## Branches

| Branche | Usage |
| ------- | ----- |
| `main` | Production — code stable, CI vérifie le build |
| `dev` | Développement actif |

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
