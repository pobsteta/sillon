// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { bedHistory, checkRotation } from './rotation.js';
import type { Occupation } from './beds.js';

const history: Occupation[] = [
  {
    plantingId: 10,
    locationId: 1,
    length: 2000,
    range: { begin: '2025-03-01', end: '2025-08-31' },
    familyId: 5, // solanacées
  },
  {
    plantingId: 11,
    locationId: 1,
    length: 2000,
    range: { begin: '2024-04-01', end: '2024-09-30' },
    familyId: 7,
  },
];

describe('délai de retour d’une famille', () => {
  it('signale un retour trop rapide et donne la date de disponibilité', () => {
    const conflict = checkRotation(1, 5, { begin: '2026-04-01', end: '2026-09-30' }, 3, history);
    expect(conflict).not.toBeNull();
    expect(conflict?.previousPlantingId).toBe(10);
    expect(conflict?.availableFrom).toBe('2028-08-30');
    expect(conflict?.missingDays).toBeGreaterThan(0);
  });

  it('accepte le retour une fois le délai écoulé', () => {
    expect(checkRotation(1, 5, { begin: '2029-04-01', end: '2029-09-30' }, 3, history)).toBeNull();
  });

  it('regarde aussi vers l’avenir : une famille placée juste après pose le même problème', () => {
    const future: Occupation[] = [
      {
        plantingId: 20,
        locationId: 1,
        length: 1000,
        range: { begin: '2027-03-01', end: '2027-07-31' },
        familyId: 5,
      },
    ];
    expect(
      checkRotation(1, 5, { begin: '2026-04-01', end: '2026-09-30' }, 3, future),
    ).not.toBeNull();
  });

  it('ignore les autres familles, les autres planches et la série replacée', () => {
    expect(checkRotation(1, 9, { begin: '2026-04-01', end: '2026-09-30' }, 3, history)).toBeNull();
    expect(checkRotation(2, 5, { begin: '2026-04-01', end: '2026-09-30' }, 3, history)).toBeNull();
    expect(
      checkRotation(1, 5, { begin: '2026-04-01', end: '2026-09-30' }, 3, history, [10]),
    ).toBeNull();
  });

  it('ne contrôle rien si la famille n’a pas de délai de retour', () => {
    expect(checkRotation(1, 5, { begin: '2026-04-01', end: '2026-09-30' }, 0, history)).toBeNull();
  });

  it('présente l’historique de la planche du plus récent au plus ancien', () => {
    expect(bedHistory(1, history).map((o) => o.plantingId)).toEqual([10, 11]);
  });
});
