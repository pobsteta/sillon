// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Authentification par cookie de session et contrôle d'accès par ferme.

import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  roleAtLeast,
  userFromSessionToken,
  type Role,
  type SessionUser,
} from '../auth.js';
import { forbidden, notFound, unauthorized } from '../errors.js';
import { withoutFarmScope } from '../tenant.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser | null;
    /** Ferme résolue depuis `:farmId`, avec le rôle de l'utilisateur dessus. */
    farm: { id: number; role: Role } | null;
  }
}

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

export const authPlugin = fp(async (app, options: { env: Env }) => {
  app.decorateRequest('currentUser', null);
  app.decorateRequest('farm', null);

  app.addHook('onRequest', async (request) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    request.currentUser = await withoutFarmScope((db) =>
      userFromSessionToken(db, unsigned.value!, options.env.SESSION_DAYS),
    );
  });

  /** Exige une session valide. */
  app.decorate('requireUser', async (request: FastifyRequest) => {
    if (!request.currentUser) throw unauthorized();
  });

  /**
   * Exige une session et un rôle suffisant sur la ferme de l'URL.
   * Une ferme dont on n'est pas membre est signalée « introuvable » : on ne révèle pas
   * l'existence des fermes des autres.
   */
  app.decorate('requireFarm', (minimumRole: Role = 'employee') => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.currentUser) throw unauthorized();
      const { farmId } = FarmParams.parse(request.params);
      const membership = await withoutFarmScope((db) =>
        db.farmMembership.findUnique({
          where: { farmId_userId: { farmId, userId: request.currentUser!.id } },
        }),
      );
      if (!membership) throw notFound('Ferme introuvable');
      const role = membership.role as Role;
      if (!roleAtLeast(role, minimumRole)) {
        throw forbidden(`Cette action demande le rôle « ${minimumRole} »`);
      }
      request.farm = { id: farmId, role };
    };
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (request: FastifyRequest) => Promise<void>;
    requireFarm: (
      minimumRole?: Role,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
