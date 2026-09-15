// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyRequest } from 'fastify';
import { unauthorized } from './errors.js';
import { withFarm } from './tenant.js';
import type { Tx } from './db.js';
import type { Role } from './auth.js';

export interface FarmContext {
  farmId: number;
  role: Role;
  userId: number;
}

/** Contexte ferme posé par le hook `requireFarm`. */
export function farmContext(request: FastifyRequest): FarmContext {
  if (!request.farm || !request.currentUser) throw unauthorized();
  return { farmId: request.farm.id, role: request.farm.role, userId: request.currentUser.id };
}

/** Exécute le corps du gestionnaire dans la transaction isolée de la ferme. */
export function inFarm<T>(
  request: FastifyRequest,
  fn: (db: Tx, context: FarmContext) => Promise<T>,
): Promise<T> {
  const context = farmContext(request);
  return withFarm(context.farmId, (db) => fn(db, context));
}
