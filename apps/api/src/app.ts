// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assemblage de l'API. `buildApp` sert aussi bien au serveur qu'aux tests d'intégration.

import './json.js';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
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
import { agreger, sonder, statutHttp } from './health.js';
import { getPrisma } from './db.js';
import { createProducerRedis } from './queue.js';
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
  registerErrorHandler(app, { serveWeb: env.WEB_DIST !== undefined });

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

  // L'interface servie par l'API : un seul service, ce qu'exigent les hébergements
  // gratuits. En déploiement ordinaire, `WEB_DIST` est absent et Nginx s'en charge —
  // il le fait mieux, mais il coûte un second conteneur.
  if (env.WEB_DIST) {
    await app.register(fastifyStatic, {
      root: resolve(env.WEB_DIST),
      // Pas de route fourre-tout : les URL inconnues passent par le gestionnaire de 404,
      // qui distingue une route d'API d'une route du navigateur.
      wildcard: false,
    });

    // Les en-têtes de cache par un crochet Fastify plutôt que par l'option `setHeaders` du
    // greffon : celle-ci reçoit tantôt la réponse brute de Node, tantôt celle de Fastify
    // selon le chemin pris, et les deux n'ont pas les mêmes méthodes — un `sw.js` répondait
    // 500 d'un côté ou de l'autre. `onSend` a une signature stable et documentée.
    app.addHook('onSend', async (request, reply) => {
      // Le service worker ne doit jamais venir d'un cache périmé, sans quoi une version
      // ancienne de l'application survivrait à son remplacement. Les fichiers d'`assets`
      // portent une empreinte dans leur nom : ils peuvent être gardés un an.
      if (request.url === '/sw.js') reply.header('cache-control', 'no-cache');
      else if (request.url.startsWith('/assets/')) {
        reply.header('cache-control', 'public, max-age=31536000, immutable');
      }
    });
  }

  await app.register(authPlugin, { env });
  await app.register(mailPlugin, { env, mailer: options.mailer });
  await app.register(storagePlugin, { env, storage: options.storage });

  app.get(
    '/health',
    { schema: { tags: ['infrastructure'], summary: 'Le processus est-il vivant ?' } },
    async () => ({
      status: 'ok',
      version: VERSION,
    }),
  );

  /**
   * Sonde de supervision : c'est elle qu'une page d'état publique interroge. Elle touche
   * aux dépendances, donc elle coûte — d'où deux routes plutôt qu'une, `/health` restant
   * gratuite pour le répartiteur de charge.
   */
  app.get(
    '/ready',
    { schema: { tags: ['infrastructure'], summary: 'Le service peut-il travailler ?' } },
    async (_request, reply) => {
      const sondes = [
        await sonder('postgresql', true, 2_000, () => getPrisma().$queryRaw`SELECT 1`),
        ...(env.REDIS_URL
          ? [
              await sonder('redis', false, 2_000, async () => {
                // Connexion à part, jetée aussitôt : emprunter celle de la file ferait
                // dépendre la sonde de l'état de la file, alors qu'on veut l'inverse.
                const connexion = createProducerRedis(env.REDIS_URL!);
                try {
                  await connexion.connect();
                  await connexion.ping();
                } finally {
                  connexion.disconnect();
                }
              }),
            ]
          : []),
        await sonder('stockage', false, 3_000, async () => {
          // Une lecture d'objet absent suffit : elle prouve que le stockage répond, sans
          // rien y écrire. C'est la panne d'identifiants ou de réseau qu'on cherche.
          await app.photos.get('sonde-de-supervision').catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            // « Absent » est la bonne réponse : le stockage a parlé.
            if (/ENOENT|NoSuchKey|NotFound|not found/i.test(message)) return;
            throw error;
          });
        }),
      ];

      const etat = agreger(sondes);
      return reply.status(statutHttp(etat)).send({ status: etat, version: VERSION, sondes });
    },
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
