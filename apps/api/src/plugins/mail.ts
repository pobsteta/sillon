// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Expose le transport de courriels sur l'instance Fastify. Les tests en fournissent un
// de capture ; sinon il est choisi d'après la configuration.

import fp from 'fastify-plugin';
import { createMailer, type Mailer } from '../mail.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    /** Adresse publique de l'interface, sans barre oblique finale : base des liens envoyés. */
    appUrl: string;
  }
}

export const mailPlugin = fp(async (app, options: { env: Env; mailer?: Mailer | undefined }) => {
  app.decorate('mailer', options.mailer ?? createMailer(options.env));
  app.decorate('appUrl', options.env.APP_URL.replace(/\/+$/, ''));
});
