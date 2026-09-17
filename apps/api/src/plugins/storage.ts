// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Expose le stockage des photos sur l'instance Fastify, comme le plugin des courriels le
// fait du transport. Avant, `recordRoutes` appelait `createStorage()` qui lisait
// `process.env` au moment où les routes s'enregistraient : impossible de configurer un
// stockage objet à travers `Env`, et impossible d'en fournir un double aux essais.

import fp from 'fastify-plugin';
import { createStorage, type PhotoStorage } from '../storage.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    photos: PhotoStorage;
  }
}

export const storagePlugin = fp(
  async (app, options: { env: Env; storage?: PhotoStorage | undefined }) => {
    app.decorate('photos', options.storage ?? createStorage(options.env));
  },
);
