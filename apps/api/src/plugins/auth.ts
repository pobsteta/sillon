// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Authentification par cookie de session et contrôle d'accès par ferme.

import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { can, type Action, type Resource } from '@sillon/core';
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
   * Résout l'appartenance à la ferme de l'URL et pose `request.farm`.
   * Une ferme dont on n'est pas membre est signalée « introuvable » : on ne révèle pas
   * l'existence des fermes des autres.
   */
  const resoudreFerme = async (request: FastifyRequest): Promise<Role> => {
    if (!request.currentUser) throw unauthorized();
    const { farmId } = FarmParams.parse(request.params);
    const membership = await withoutFarmScope((db) =>
      db.farmMembership.findUnique({
        where: { farmId_userId: { farmId, userId: request.currentUser!.id } },
      }),
    );
    if (!membership) throw notFound('Ferme introuvable');
    const role = membership.role as Role;
    request.farm = { id: farmId, role };
    return role;
  };

  /**
   * Exige un rôle d'administration sur la ferme. À réserver aux routes où la hiérarchie
   * `owner > manager` est bien ce que décrit Brinjel — réglages, équipe, plan de culture.
   * Pour tout ce qui touche au terrain, c'est `requirePermission` qui fait foi : le
   * saisonnier et le consultant ne se rangent pas sur une échelle.
   */
  app.decorate('requireFarm', (minimumRole: Role = 'employee') => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const role = await resoudreFerme(request);
      if (!roleAtLeast(role, minimumRole)) {
        throw forbidden(`Cette action demande le rôle « ${minimumRole} »`);
      }
    };
  });

  /**
   * Exige seulement d'être membre de la ferme, quel que soit le rôle. Pour les routes
   * dont tout le monde a besoin : lire la ferme elle-même.
   */
  app.decorate('requireMember', async (request: FastifyRequest, _reply: FastifyReply) => {
    await resoudreFerme(request);
  });

  /** Exige une permission de la matrice `Brinjel.Admin.Role`. */
  app.decorate('requirePermission', (resource: Resource, action: Action) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const role = await resoudreFerme(request);
      if (!can(role, resource, action)) {
        throw forbidden(`Le rôle « ${role} » ne peut pas ${action} sur ${resource}`);
      }
    };
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (request: FastifyRequest) => Promise<void>;
    requireFarm: (
      minimumRole?: Role,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireMember: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      resource: Resource,
      action: Action,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
