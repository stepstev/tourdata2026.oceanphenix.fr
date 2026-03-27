# OceanPhenix.fr — Contexte de reprise pour Claude Code

> Généré le 2026-03-14. À lire EN PREMIER avant toute intervention.

---

## 1. Identité du projet

**Site vitrine + outil de suivi terrain** pour **Stéphane Celton** (OceanPhenix™)  
Consultant indépendant Data & AI — Power BI, Data Platforms, IA Souveraine/RAG.

- **URL prod** : https://oceanphenix.fr  
- **Repo** : https://github.com/stepstev/oceanphenix.fr (branche `main`)  
- **Hébergement** : GitHub Pages (déploiement auto via GitHub Actions sur push `main`)  
- **Stack** : Astro v4 (SSG) + Vanilla JS + Leaflet + CSS custom tokens

---

## 2. Architecture des pages

| Fichier | URL | Description |
|---|---|---|
| `src/pages/index.astro` | `/` | Homepage vitrine |
| `src/pages/expertises.astro` | `/expertises` | 6 domaines d'expertise |
| `src/pages/portfolio.astro` | `/portfolio` | Portfolio modal panel |
| `src/pages/terrain.astro` | `/terrain` | Suivi itinéraire vélo (~3150 km) — **auth-gardé** |
| `src/pages/admin-terrain.astro` | `/admin-terrain` | Panel admin 8 onglets — **auth SHA-256 + CAPTCHA** |
| `src/pages/rag-2026.astro` | `/rag-2026` | Demo RAG Platform 2026 publique |
| `src/pages/404.astro` | `*` | Page 404 |

---

## 3. Projet "Retour au Terrain" (fonctionnalité principale)

### Concept
Itinéraire vélo **Fontenay-lès-Briis → France entière** (~3150 km, 14 étapes), Avril–Juillet 2026.  
Objectif : identifier des opportunités de mission Data/AI en entreprise en visitant des villes françaises à vélo.

### Départ prévu
**15 avril 2026** depuis Fontenay-lès-Briis (48.5358, 2.1647)

### 14 étapes
Fontenay-lès-Briis → Caen → Rennes → Nantes → Bordeaux → Toulouse → Montpellier → Marseille → Nice → Sophia Antipolis → Lyon → Grenoble → Strasbourg → Lille

### Données
- **Source de vérité** : `src/data/terrain-etapes.json` (build time)
- **Runtime** : `localStorage['op-terrain-admin']` (admin panel → live page)
- **Compteurs live** : kmParcourus=0, joursRoute=0, besoinsIdentifies=0, rencontresEntreprises=0

---

## 4. Authentification admin

- **Page login** : `/admin-terrain`
- **Mécanisme** : SHA-256 côté client via `crypto.subtle` + CAPTCHA mathématique
- **Session** : `sessionStorage['op-admin-auth']` format v2 `{v:2, ts:timestamp}` TTL 1h
- **Rate limit** : 5 essais, lockout 30s
- **La page `/terrain`** vérifie la session au load et redirige vers `/admin-terrain` si invalide

> ⚠️ Le hash du mot de passe est hardcodé dans `src/pages/admin-terrain.astro`

---

## 5. Persistance des données (localStorage)

| Clé | Contenu |
|---|---|
| `op-terrain-admin` | Tout l'état terrain (étapes, journal, photos, position, compteurs) |
| `op-terrain-gpx` | Fichiers GPX uploadés (contenu base64/XML inline) |
| `op-terrain-coworking` | Liste des espaces coworking (lat, lng, nom, visible) |
| `op-theme` | `"light"` ou absent (dark par défaut) |
| `op-theme-hint-seen` | Boolean hint thème vu |

---

## 6. Cartes Leaflet

### Deux instances
1. **Main map** (`#terrain-map`) — page terrain, zoom libre, toggles overlay
2. **Dashboard map** (`#tdash-map`) — composant `TerrainDashboard`, compact 340px

### Variables globales
- `window._terrainMainMap` — instance Leaflet main map
- `window._terrainDashMap` — instance Leaflet dashboard map

### Overlays disponibles (checkboxes)
- `#cw-toggle` — drapeaux coworking
- `#cyclosm-toggle` — tuiles CyclOSM
- `#waymarked-toggle` — Waymarked Trails cycling
- `#gpx-toggle` — tracés GPX

### Couleurs markers
- 🟠 Amber = position actuelle
- 🔵 Bleu = étape planifiée
- 🟢 Vert = étape visitée

### Polylines
- Vert solide = tronçon réalisé
- Bleu pointillé = tronçon planifié

---

## 7. JS public (public/js/)

| Fichier | Rôle |
|---|---|
| `theme-init.js` | Anti-FOUC (inline dans `<head>`) |
| `theme-hint.js` | Toast hint thème clair |
| `main.js` | Theme toggle, smooth scroll, CGU modal, parallax, load time |
| `terrain-maps.js` | Init Leaflet maps + markers + GPX + coworking |
| `terrain-live.js` | Sync localStorage → DOM live (terrain page) |
| `admin-terrain.js` | Logique complète panel admin (auth, CRUD, tabs, export) |

---

## 8. CSS / Design System

| Fichier | Rôle |
|---|---|
| `src/styles/tokens.css` | Variables CSS : couleurs, typographie, spacing, shadows |
| `src/styles/global.css` | Reset + layout global (nav, hero, footer, modal, etc.) |
| `src/styles/terrain.css` | Styles page terrain |
| `src/styles/terrain-dashboard.css` | Styles composant `.tdash` dashboard |

### Thème
- **Dark** par défaut (`--primary-dark: #0a1628`, `--accent-cyan: #4db8d4`)
- **Light** via `[data-theme="light"]` sur `<html>`
- Persiste en `localStorage['op-theme']`

---

## 9. Composants Astro (src/components/)

| Composant | Description |
|---|---|
| `Nav.astro` | Nav fixe glassmorphism, lien Terrain conditionnel (auth) |
| `Hero.astro` | Hero vitrine avec CTA Calendly |
| `Platforms.astro` | Grille 6 cards projets (Lucide icons) |
| `CvSection.astro` | Business card + social links |
| `TerrainDashboard.astro` | Carte dashboard (build-time depuis JSON) |
| `Footer.astro` | Footer bio + copyright |
| `OceanBackground.astro` | Background animated waves (CSS) |
| `CguModal.astro` | Modale CGU complète (8 sections RGPD) |
| `CopyrightBar.astro` | Barre bas : last-modified + load time + CGU link |
| `WelcomePopup.astro` | Popup image d'accueil |
| `ThemeHint.astro` | Toast hint thème |

---

## 10. Build & Deploy

```bash
# Dev local
npm run dev        # http://localhost:4321

# Build
npm run build      # → dist/

# Preview build
npm run preview
```

**Deploy** : Push sur `main` → GitHub Actions → GitHub Pages  
**CNAME** : `public/CNAME` → `oceanphenix.fr`

---

## 11. Liens importants du projet

- **Portfolio subdomain** : https://stephanecelton.oceanphenix.fr
- **LinkedIn** : https://www.linkedin.com/company/oceanphenix/
- **YouTube** : https://www.youtube.com/@DiscoveryITDATA
- **GitHub** : https://github.com/stepstev
- **RAG project** : https://github.com/stepstev/rag-platform-2026-public
- **Calendly** : https://calendly.com/... (dans Hero.astro)

---

## 12. Points d'attention / TODO connus

- Les compteurs live (km, jours...) sont à **0** — ils seront mis à jour via l'admin panel quand le terrain démarrera (15 avril 2026)
- La page `/terrain` nécessite une session admin valide — en production, accès direct via `/admin-terrain`
- `admin-terrain.js` est volumineux (~1000+ lignes) — c'est le cerveau du système
- GPX files dans `public/gpx/` ont des noms avec espaces/accents → utilisés comme fallback
- `terrain-etapes.json` est la source de vérité build-time, mais le runtime utilise localStorage
- `src/pages/admin-terrain.astro` contient tout le HTML + CSS + logique auth inline (fichier ~2000 lignes)

---

## 13. Dépendances npm

```json
{
  "astro": "^4.16.0",
  "astro-icon": "^1.1.5",
  "@astrojs/mdx": "^3.1.9",
  "@iconify-json/lucide": "^1.2.96"
}
```
Leaflet est chargé depuis CDN dans les pages terrain (pas npm).

---

*Ce fichier a été généré automatiquement pour faciliter la reprise du projet dans Claude Code.*
