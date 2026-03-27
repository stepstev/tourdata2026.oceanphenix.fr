// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  integrations: [icon()],
  // Domaine custom via CNAME → base: '/'
  // Si test sur stepstev.github.io/oceanphenix.fr → changer en base: '/oceanphenix.fr'
  site: 'https://www.tourdata2026.oceanphenix.fr',
  base: '/',
  trailingSlash: 'ignore',
  build: {
    assets: 'assets',
  },
});
