// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Expose le transport de courriels sur l'instance Fastify. Les tests en fournissent un
// de capture ; sinon il est choisi d'après la configuration.
//
// Avec `REDIS_URL`, le transport choisi est enveloppé dans `QueuedMailer` : les routes
// continuent d'appeler `app.mailer.send()`, mais le message part dans une file que le
// worker (`dist/worker.js`) vide de son côté. Sans `REDIS_URL`, rien ne change.

import fp from 'fastify-plugin';
import { createMailer, QueuedMailer, type Mailer } from '../mail.js';
import { createMailQueue, createProducerRedis } from '../queue.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    /** Adresse publique de l'interface, sans barre oblique finale : base des liens envoyés. */
    appUrl: string;
  }
}

export const mailPlugin = fp(async (app, options: { env: Env; mailer?: Mailer | undefined }) => {
  app.decorate('appUrl', options.env.APP_URL.replace(/\/+$/, ''));

  // Un transport fourni (tests) reste tel quel : on veut inspecter ce que les routes
  // demandent, pas ce qu'une file finit par livrer.
  if (options.mailer) {
    app.decorate('mailer', options.mailer);
    return;
  }

  const transport = createMailer(options.env);
  if (!options.env.REDIS_URL) {
    app.decorate('mailer', transport);
    return;
  }

  const connection = createProducerRedis(options.env.REDIS_URL);
  // Sans écouteur, une erreur de connexion ioredis remonte en exception non capturée et
  // emporte le processus — or une panne de Redis ne doit pas arrêter l'API.
  connection.on('error', (error) => app.log.error({ err: error }, 'file des courriels'));
  // La connexion s'ouvre en tâche de fond : le démarrage n'attend pas Redis, et le premier
  // courriel n'a pas à essuyer les plâtres d'une connexion encore à faire.
  void connection.connect().catch(() => undefined);

  const queue = createMailQueue(connection);
  app.decorate(
    'mailer',
    new QueuedMailer(queue, transport, {
      // `status` d'ioredis dit si la connexion est utilisable tout de suite. Sans cette
      // question, chaque courriel envoyé Redis arrêté paierait le délai complet avant de
      // partir en direct — trois secondes ajoutées à autant de requêtes.
      joignable: () => connection.status === 'ready',
      log: (error) => app.log.error({ err: error }, 'file des courriels'),
    }),
  );
  app.addHook('onClose', async () => {
    // `disconnect()` d'abord : sur un Redis injoignable, `close()` attendrait une réponse
    // qui ne viendra pas, et l'arrêt de l'API resterait suspendu.
    connection.disconnect();
    await queue.close().catch(() => undefined);
  });
});
