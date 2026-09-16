// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les attentes sont recopiées de `lib/brinjel/admin/role.ex`, pas de notre implémentation.

import { describe, expect, it } from 'vitest';
import { can, rolesWith, scopeOf, type Action, type Resource } from './roles.js';
import { FarmRole } from './types.js';

describe('matrice des permissions', () => {
  it('le saisonnier tient le terrain : récoltes, tâches, notes', () => {
    expect(can(FarmRole.seasonal, 'harvests', 'create')).toBe(true);
    expect(can(FarmRole.seasonal, 'harvests', 'update')).toBe(true);
    expect(can(FarmRole.seasonal, 'tasks', 'update')).toBe(true);
    expect(can(FarmRole.seasonal, 'tasks', 'delete')).toBe(true);
    expect(can(FarmRole.seasonal, 'notes', 'delete')).toBe(true);
    expect(can(FarmRole.seasonal, 'crop_plan', 'read')).toBe(true);
    expect(can(FarmRole.seasonal, 'locations', 'read')).toBe(true);
  });

  it('le saisonnier ne voit pas les commandes, le consultant si', () => {
    // C'est l'inversion qu'une hiérarchie linéaire ne sait pas exprimer.
    expect(can(FarmRole.seasonal, 'orders', 'read')).toBe(false);
    expect(can(FarmRole.consultant, 'orders', 'read')).toBe(true);
  });

  it('le consultant ne saisit rien', () => {
    for (const resource of ['harvests', 'tasks', 'notes', 'crop_plan'] as Resource[]) {
      for (const action of ['create', 'update', 'delete'] as Action[]) {
        expect(can(FarmRole.consultant, resource, action)).toBe(false);
      }
    }
    expect(can(FarmRole.consultant, 'charts', 'read')).toBe(true);
    expect(can(FarmRole.consultant, 'task_templates', 'read')).toBe(true);
  });

  it("l'employé ne se distingue du saisonnier que par les commandes", () => {
    const resources: Resource[] = ['crop_plan', 'harvests', 'locations', 'notes', 'tasks'];
    const actions: Action[] = ['create', 'read', 'update', 'delete'];
    for (const resource of resources) {
      for (const action of actions) {
        expect(can(FarmRole.employee, resource, action)).toBe(
          can(FarmRole.seasonal, resource, action),
        );
      }
    }
    expect(can(FarmRole.employee, 'orders', 'read')).toBe(true);
    expect(can(FarmRole.seasonal, 'orders', 'read')).toBe(false);
  });

  it("l'employé ne supprime pas une récolte, le chef de culture oui", () => {
    expect(can(FarmRole.employee, 'harvests', 'delete')).toBe(false);
    expect(can(FarmRole.manager, 'harvests', 'delete')).toBe(true);
  });

  it('le plan de culture ne se modifie qu’à partir du chef de culture', () => {
    expect(rolesWith('crop_plan', 'update')).toEqual([FarmRole.owner, FarmRole.manager]);
    expect(rolesWith('crop_plan', 'read')).toHaveLength(5);
  });

  it('seul le propriétaire touche à la zone dangereuse et à l’abonnement', () => {
    expect(rolesWith('danger_zone', 'delete')).toEqual([FarmRole.owner]);
    expect(rolesWith('subscription', 'update')).toEqual([FarmRole.owner]);
  });

  it('les rôles de terrain ne voient que leurs propres saisies', () => {
    expect(scopeOf(FarmRole.employee)).toBe('own');
    expect(scopeOf(FarmRole.seasonal)).toBe('own');
    expect(scopeOf(FarmRole.consultant)).toBe('all');
    expect(scopeOf(FarmRole.manager)).toBe('all');
    expect(scopeOf(FarmRole.owner)).toBe('all');
  });

  it('aucun rôle n’a de permission sur un domaine absent de sa fiche', () => {
    expect(can(FarmRole.seasonal, 'team', 'read')).toBe(false);
    expect(can(FarmRole.employee, 'settings', 'update')).toBe(false);
    expect(can(FarmRole.consultant, 'notes', 'read')).toBe(false);
  });
});
