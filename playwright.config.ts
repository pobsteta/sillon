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
      },
    },
    {
      command: `npm run preview -w @sillon/web -- --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
