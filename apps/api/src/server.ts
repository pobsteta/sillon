// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadEnv } from './env.js';
import { initSupervision, viderSupervision } from './observability.js';

const env = loadEnv();
// Avant tout le reste : les instrumentations de Sentry s'accrochent aux modules au moment
// où ils sont chargés, donc l'import de l'application vient après.
const supervision = initSupervision(env);

const { buildApp } = await import('./app.js');
const { disconnectPrisma } = await import('./db.js');

const app = await buildApp();
if (supervision) app.log.info('supervision des erreurs active');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info(`arrêt demandé (${signal})`);
      await app.close();
      await disconnectPrisma();
      // Une erreur survenue pendant l'arrêt ne doit pas mourir avec le processus.
      await viderSupervision();
      process.exit(0);
    })();
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
