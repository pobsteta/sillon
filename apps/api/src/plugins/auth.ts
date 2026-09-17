// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Authentification par cookie de session et contrôle d'accès par ferme.

import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  can,
  ecritureHttp,
  farmAccess,
  today,
  toIsoDate,
  type Action,
  type FarmAccess,
  type Resource,
} from '@sillon/core';
import {
  SESSION_COOKIE,
  roleAtLeast,
  userFromSessionToken,
  type Role,
  type SessionUser,
} from '../auth.js';
import { forbidden, notFound, readOnly, unauthorized } from '../errors.js';
import { withoutFarmScope } from '../tenant.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser | null;
    /** Ferme résolue depuis `:farmId`, avec le rôle de l'utilisateur et l'état d'accès. */
    farm: { id: number; role: Role; access: FarmAccess } | null;
  }
}

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

/** Ce qu'on dit à qui ne peut plus écrire. Sobre, et sans jargon de facturation. */
function messageLectureSeule(reason: FarmAccess['reason'], until: string | null): string {
  if (reason === 'suspendue') return 'Cette ferme est suspendue : lecture seule.';
  const fin = until ? ` (échéance : ${until})` : '';
  return reason === 'abonnement_expire'
    ? `L’abonnement de cette ferme a pris fin${fin} : lecture seule. Vos données restent lisibles et exportables.`
    : `La période d’essai de cette ferme est terminée${fin} : lecture seule. Vos données restent lisibles et exportables.`;
}

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
    const { membership, ferme } = await withoutFarmScope(async (db) => ({
      membership: await db.farmMembership.findUnique({
        where: { farmId_userId: { farmId, userId: request.currentUser!.id } },
      }),
      ferme: await db.farm.findUnique({
        where: { id: farmId },
        select: { locked: true, trialExpiryDate: true, paidUntil: true },
      }),
    }));
    if (!membership || !ferme) throw notFound('Ferme introuvable');

    const acces = farmAccess({
      policy: options.env.ACCESS_POLICY,
      locked: ferme.locked,
      trialExpiryDate: toIsoDate(ferme.trialExpiryDate),
      paidUntil: ferme.paidUntil ? toIsoDate(ferme.paidUntil) : null,
      on: today(),
    });

    const role = membership.role as Role;
    request.farm = { id: farmId, role, access: acces };

    // Le verrou tient ici, et nulle part ailleurs : toute route liée à une ferme passe par
    // cette fonction. Le qualifier route par route donnerait une liste qu'on oublierait de
    // compléter à la prochaine route ajoutée — et un trou qui ne se verrait pas.
    if (!acces.canWrite && ecritureHttp(request.method)) {
      throw readOnly(messageLectureSeule(acces.reason, acces.until), {
        reason: acces.reason,
        until: acces.until,
      });
    }
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
