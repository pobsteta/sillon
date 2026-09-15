// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildApp } from './app.js';
import { disconnectPrisma } from './db.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info(`arrêt demandé (${signal})`);
      await app.close();
      await disconnectPrisma();
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
