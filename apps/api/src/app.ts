// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assemblage de l'API. `buildApp` sert aussi bien au serveur qu'aux tests d'intégration.

import './json.js';
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
import { registerErrorHandler } from './errors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { farmRoutes } from './routes/farms.js';
import { referenceRoutes } from './routes/reference.js';
import { plantingRoutes } from './routes/plantings.js';
import { locationRoutes } from './routes/locations.js';
import { taskRoutes } from './routes/tasks.js';
import { recordRoutes } from './routes/records.js';
import { orderRoutes } from './routes/orders.js';
import { statsRoutes } from './routes/stats.js';

export async function buildApp(overrides: Partial<Env> = {}): Promise<FastifyInstance> {
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
          'Toutes les mesures sont des entiers : longueurs en centimètres, prix en centimes, ' +
          'durées en jours, temps de travail en minutes.',
        version: '0.1.0',
        license: { name: 'AGPL-3.0-or-later', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
      },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin, { env });

  app.get(
    '/health',
    { schema: { tags: ['infrastructure'], summary: 'État du service' } },
    async () => ({
      status: 'ok',
      version: '0.1.0',
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

  return app;
}
