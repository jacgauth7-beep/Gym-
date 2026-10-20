import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH=/Gym-/ pour GitHub Pages ; "/" pour Vercel ou le dev local.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'ding.wav'],
      manifest: {
        name: 'Carnet de muscu',
        short_name: 'Muscu',
        description: "Suivi d'entraînement hors ligne avec moteur de progression",
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b0c',
        theme_color: '#0b0b0c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wav,webmanifest}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' }
} as any);
