# OceanPhenix.fr — Site Portfolio Professionnel

> **OceanPhenix™** · Data Product Management · Business Intelligence · Observabilité · Innovation IA

---

## À propos

**OceanPhenix.fr** est le site de présentation de mon profil et de mes services en tant que **Data Product Manager** orienté **Business Intelligence** et **Observabilité**.

Le site met en avant :

- Mon **parcours** et mes **compétences** en pilotage de produits data, BI et monitoring
- Mes **domaines d'expertise** : stratégie data, dashboards décisionnels, pipelines d'observabilité, gouvernance des données
- Mes **services** : conseil, accompagnement et delivery sur les sujets data, BI et observabilité

Construit avec **Astro v4** · Hébergé sur **GitHub Pages** · Domaine custom `oceanphenix.fr`

---

## Stack technique

| Couche | Technologie |
| ------ | ----------- |
| Framework | [Astro v4](https://astro.build) (SSG) |
| CSS | Design tokens + CSS global scopé |
| JS | Vanilla JS |
| CI/CD | GitHub Actions |
| Hébergement | GitHub Pages |
| Domaine | `oceanphenix.fr` |
| Fonts | Inter (Google Fonts) |
| Icons | Font Awesome 6.5 (CDN avec SRI) |

---

## Structure du projet

```text
src/
├── components/         # Composants Astro réutilisables
├── layouts/
│   └── BaseLayout.astro   # Layout SEO (OG, Twitter Card, canonical)
├── pages/
│   ├── index.astro        # Page principale
│   ├── portfolio.astro    # Vitrine profil
│   ├── expertises.astro   # Domaines d'intervention
│   └── 404.astro          # Page d'erreur
└── styles/
    ├── tokens.css         # Design tokens (variables CSS)
    └── global.css         # Styles globaux & composants

public/
├── Images/                # Assets visuels
├── js/main.js             # JS vanilla
├── robots.txt
├── sitemap.xml
└── CNAME
```

---

## Pages

| Route | Description |
| ----- | ----------- |
| `/` | Page principale — Hero, Plateformes, CV |
| `/portfolio` | Vitrine profil — bio, compétences, hashtags |
| `/expertises` | Domaines d'expertise |
| `/404` | Page d'erreur personnalisée |

---

## Architecture CSS

- **`tokens.css`** — Source de vérité de l'identité visuelle (couleurs, typo, espacements)
- **`global.css`** — Reset, layout, composants, animations. Consomme les variables de `tokens.css`

---

## SEO

- Open Graph + Twitter Card sur toutes les pages
- Canonical URL par page
- JSON-LD `Person` schema sur `/portfolio`
- Sitemap : `/`, `/portfolio`, `/expertises`

---

## Développement local

```bash
npm install       # Installer les dépendances
npm run dev       # Dev server → http://localhost:4321
npm run build     # Build production → dist/
npm run preview   # Prévisualiser dist/
```

---

## Déploiement

Automatique à chaque push sur `main` via GitHub Actions :

```text
push main → GitHub Actions → build → GitHub Pages
```

---

## Qualité code

- Zéro `style=""` inline
- Couleurs via CSS custom properties
- Séparation design tokens / styles globaux
- HTML sémantique, SEO meta complets
- `rel="noopener noreferrer"` sur les liens externes
- SRI hash sur ressources CDN
- Logo SVG inline

---

## Licence

PROPRIÉTAIRE — TOUS DROITS RÉSERVÉS

Toute reproduction sans autorisation écrite préalable est interdite.

| Élément | Statut |
| ------- | ------ |
| Code source | Usage privé uniquement |
| Concept & design | Protégé — reproduction interdite |
| Marque OceanPhenix™ | Marque déposée |

---

[oceanphenix.fr](https://oceanphenix.fr)
