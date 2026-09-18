// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cible du proxy vers l'API : le port de développement par défaut, que les tests de bout
// en bout surchargent puisqu'ils démarrent l'API sur un port dédié.
const apiTarget = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-512.png'],
      manifest: {
        name: 'Sillon — planification maraîchère libre',
        short_name: 'Sillon',
        description:
          'Planification et suivi des cultures maraîchères : plan de culture, tâches, assolement, récoltes.',
        lang: 'fr',
        theme_color: '#4d7c0f',
        background_color: '#faf9f5',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/docs/],
        runtimeCaching: [
          {
            // Le calendrier lunaire d'une année ne change plus : `CacheFirst`, et non le
            // `NetworkFirst` des lectures métier. Il attend quatre secondes de réseau à
            // chaque consultation sinon, alors qu'il n'a aucune raison de changer — et
            // c'est précisément au champ, sans réseau, qu'on le consulte.
            urlPattern: ({ url }) => /\/api\/farms\/\d+\/moon\/\d+$/.test(url.pathname),
            handler: 'CacheFirst',
            method: 'GET',
            options: {
              cacheName: 'sillon-lune',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Les lectures métier restent consultables au champ, réseau coupé.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'sillon-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/docs': { target: apiTarget, changeOrigin: true },
    },
  },
  // `vite preview` sert le build : les tests de bout en bout tournent sur le vrai bundle.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/docs': { target: apiTarget, changeOrigin: true },
    },
  },
  build: { target: 'es2022', sourcemap: true },
});
