// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tests de bout en bout sur les deux formats exigés par le brief (§11) : un smartphone
// de milieu de gamme et un poste de bureau. Ils tournent sur le build de production,
// servi par `vite preview`, devant l'API réelle.

import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4173;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://sillon:sillon@localhost:5432/sillon_test?schema=public';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // L'interface suit la langue du navigateur : on fixe le français pour les assertions.
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Permet d'utiliser un Chromium déjà présent (image CI, poste hors ligne) plutôt que
    // de le retélécharger : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chrome`.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'smartphone', use: { ...devices['Pixel 5'] } },
    {
      name: 'bureau',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @sillon/api',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        NODE_ENV: 'production',
        SESSION_SECRET: 'secret-de-bout-en-bout-secret-32ch',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        COOKIE_SECURE: 'false',
        // Tous les parcours partent de la même adresse, à pleine vitesse : ils dépassent
        // la limite par minute que l'API oppose à un abus. Ce n'est pas la limite qui est
        // mauvaise, c'est la situation qui n'a rien d'un abus — et un plafond atteint se
        // manifeste par un écran qui n'affiche rien, donc par un échec dont la cause n'a
        // aucun rapport avec ce que l'essai vérifie.
        RATE_LIMIT_MAX: '100000',
        // Un second fond, pour que le sélecteur existe. L'adresse est volontairement
        // injoignable : l'essai vérifie le sélecteur, pas les tuiles, et joindre un
        // service tiers depuis une suite d'essais est ce qu'on évite partout ailleurs.
        MAP_TILE_URL: 'https://fond.exemple.test/{z}/{x}/{y}.png',
        MAP_TILE_ATTRIBUTION: 'Fond d’essai',
        MAP_TILE_NAME: 'Vue aérienne',
      },
    },
    {
      command: `npm run preview -w @sillon/web -- --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      // Le proxy de `vite preview` doit viser l'API démarrée ci-dessus, pas celle de développement.
      env: { API_PORT: String(API_PORT) },
    },
  ],
});
