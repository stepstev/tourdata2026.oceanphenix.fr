/// <reference path="../.astro/types.d.ts" />

// Déclaration générique pour les imports de fichiers .astro
// Supprime les faux positifs TS2307 du serveur TypeScript de VS Code.
// Le support complet est assuré par l'extension Astro pour VS Code.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
  const component: AstroComponentFactory;
  export default component;
}