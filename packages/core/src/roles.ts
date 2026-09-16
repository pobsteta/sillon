// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (matrice d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Permissions par rôle, reprises telles quelles de `lib/brinjel/admin/role.ex`.
//
// Ce n'est PAS une hiérarchie. Une première version de Sillon rangeait les cinq rôles
// sur une échelle (consultant < saisonnier < employé < chef de culture < propriétaire) ;
// la matrice d'origine ne s'y réduit pas :
//
//   * le saisonnier saisit récoltes, tâches et notes, mais ne voit PAS les commandes ;
//   * le consultant ne saisit rien, mais voit les commandes, les itinéraires et les
//     statistiques.
//
// Aucun des deux n'est « au-dessus » de l'autre : ils ne se comparent pas.

import { FarmRole } from './types.js';

/** Domaines de permission, nommés comme dans Brinjel. */
export type Resource =
  | 'crop_plan'
  | 'danger_zone'
  | 'farm'
  | 'harvests'
  | 'locations'
  | 'notes'
  | 'orders'
  | 'tasks'
  | 'task_templates'
  | 'team'
  | 'settings'
  | 'subscription'
  | 'charts';

export type Action = 'create' | 'read' | 'update' | 'delete';

/** Portée des données visibles : toute la ferme, ou ses propres saisies. */
export type Scope = 'all' | 'own';

const C = 'create' as const;
const R = 'read' as const;
const U = 'update' as const;
const D = 'delete' as const;

type RolePermissions = {
  permissions: Partial<Record<Resource, readonly Action[]>>;
  scope: Scope;
};

export const ROLE_PERMISSIONS: Record<FarmRole, RolePermissions> = {
  [FarmRole.owner]: {
    permissions: {
      crop_plan: [C, R, U, D],
      danger_zone: [R, U, D],
      farm: [R, U, D],
      harvests: [C, R, U, D],
      locations: [C, R, U, D],
      notes: [C, R, U, D],
      orders: [R],
      tasks: [C, R, U, D],
      task_templates: [C, R, U, D],
      team: [C, R, U, D],
      settings: [C, R, U, D],
      subscription: [C, R, U, D],
      charts: [R],
    },
    scope: 'all',
  },
  [FarmRole.manager]: {
    permissions: {
      crop_plan: [C, R, U, D],
      harvests: [C, R, U, D],
      locations: [C, R, U, D],
      notes: [C, R, U, D],
      orders: [R],
      tasks: [C, R, U, D],
      task_templates: [C, R, U, D],
      team: [C, R, U, D],
      settings: [C, R, U, D],
      charts: [R],
    },
    scope: 'all',
  },
  [FarmRole.employee]: {
    permissions: {
      crop_plan: [R],
      harvests: [C, R, U],
      locations: [R],
      notes: [C, R, U, D],
      orders: [R],
      tasks: [R, U, D],
    },
    scope: 'own',
  },
  [FarmRole.seasonal]: {
    // Identique à l'employé, sauf les commandes : le saisonnier ne les voit pas.
    permissions: {
      crop_plan: [R],
      harvests: [C, R, U],
      locations: [R],
      notes: [C, R, U, D],
      tasks: [R, U, D],
    },
    scope: 'own',
  },
  [FarmRole.consultant]: {
    // Lecture seule, mais large : il conseille, il ne saisit pas.
    permissions: {
      crop_plan: [R],
      harvests: [R],
      locations: [R],
      orders: [R],
      tasks: [R],
      task_templates: [R],
      charts: [R],
    },
    scope: 'all',
  },
};

/** Le rôle autorise-t-il cette action sur ce domaine ? */
export function can(role: FarmRole, resource: Resource, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.permissions[resource]?.includes(action) ?? false;
}

/** Portée du rôle : `own` ne voit que ses propres saisies. */
export function scopeOf(role: FarmRole): Scope {
  return ROLE_PERMISSIONS[role]?.scope ?? 'own';
}

/** Rôles autorisés pour une permission donnée — pratique pour les messages et les tests. */
export function rolesWith(resource: Resource, action: Action): FarmRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as FarmRole[]).filter((role) =>
    can(role, resource, action),
  );
}
