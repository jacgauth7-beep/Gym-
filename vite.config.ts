import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// BASE_PATH=/Gym-/ pour GitHub Pages ; "/" pour Vercel ou le dev local.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    VitePWA({
      // Le service worker s'active tout seul (fiable sur iOS) ; c'est la page qui décide quand recharger (src/lib/pwa.ts).
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'ding.wav'],
      manifest: {
        name: 'Carnet de muscu',
        short_name: 'Muscu',
        description: "Carnet de musculation hors ligne : cibles calculées pour chaque set, coach et suivi des progrès.",
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#09090b',
        theme_color: '#09090b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wav,webmanifest}'],
        // les écrans de démarrage ne servent qu'à l'installation : inutile de les mettre en cache
        globIgnores: ['**/splash-*.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Indispensable : le nouveau service worker prend la main dès qu'il est installé.
        // Sans ça, il resterait « en attente » et l'app installée ne se mettrait jamais à jour sur iOS.
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' }
} as any);
