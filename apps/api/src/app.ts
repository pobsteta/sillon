// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assemblage de l'API. `buildApp` sert aussi bien au serveur qu'aux tests d'intégration.

import './json.js';
import { createRequire } from 'node:module';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { loadEnv, type Env } from './env.js';
import type { Mailer } from './mail.js';
import type { PhotoStorage } from './storage.js';
import { registerErrorHandler } from './errors.js';
import { authPlugin } from './plugins/auth.js';
import { mailPlugin } from './plugins/mail.js';
import { storagePlugin } from './plugins/storage.js';
import { authRoutes } from './routes/auth.js';
import { farmRoutes } from './routes/farms.js';
import { referenceRoutes } from './routes/reference.js';
import { plantingRoutes } from './routes/plantings.js';
import { locationRoutes } from './routes/locations.js';
import { taskRoutes } from './routes/tasks.js';
import { recordRoutes } from './routes/records.js';
import { orderRoutes } from './routes/orders.js';
import { statsRoutes } from './routes/stats.js';
import { exportRoutes } from './routes/export.js';

/**
 * Version publiée, lue dans le package.json que release-please tient à jour : `/health`
 * et la documentation OpenAPI suivent les releases sans qu'on y pense.
 */
const VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export interface BuildOptions {
  /** Transport de courriels ; sans lui, il est choisi d'après la configuration. */
  mailer?: Mailer | undefined;
  /** Stockage des photos ; sans lui, il est choisi d'après la configuration. */
  storage?: PhotoStorage | undefined;
}

export async function buildApp(
  overrides: Partial<Env> = {},
  options: BuildOptions = {},
): Promise<FastifyInstance> {
  const env = { ...loadEnv(), ...overrides };

  const app = Fastify({
    logger:
      env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
    // Le front envoie des dates ISO ; on garde le corps brut sous 1 Mio hors photos.
    bodyLimit: 1_048_576,
    trustProxy: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, {
    // L'interface est servie séparément (Vite en développement, Nginx en production) :
    // l'API ne renvoie que du JSON, la CSP par défaut suffit.
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(cors, { origin: env.corsOrigins, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Sillon — API',
        description:
          'API de planification et de suivi des cultures maraîchères. ' +
          'Toutes les mesures sont des entiers, aux unités de stockage de Brinjel : ' +
          'longueurs de planche en millimètres, espacements en dixièmes de millimètre, ' +
          'rendements et quantités récoltées en millièmes d’unité, densité de semences en ' +
          'graines par kilogramme, montants en centimes, durées de culture en jours, ' +
          'temps de travail en secondes.',
        version: VERSION,
        license: { name: 'AGPL-3.0-or-later', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
      },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin, { env });
  await app.register(mailPlugin, { env, mailer: options.mailer });
  await app.register(storagePlugin, { env, storage: options.storage });

  app.get(
    '/health',
    { schema: { tags: ['infrastructure'], summary: 'État du service' } },
    async () => ({
      status: 'ok',
      version: VERSION,
    }),
  );

  await app.register(async (instance) => authRoutes(instance, { env }));
  await app.register(farmRoutes);
  await app.register(referenceRoutes);
  await app.register(plantingRoutes);
  await app.register(locationRoutes);
  await app.register(taskRoutes);
  await app.register(recordRoutes);
  await app.register(orderRoutes);
  await app.register(statsRoutes);
  await app.register(exportRoutes);

  return app;
}
