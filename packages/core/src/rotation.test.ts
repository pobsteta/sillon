// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { bedHistory, checkRotation } from './rotation.js';
import type { Occupation } from './beds.js';

// Solanacées plantées le 1er avril 2025, récoltées jusqu'à fin août.
const history: Occupation[] = [
  {
    plantingId: 10,
    locationId: 1,
    length: 20_000,
    range: { begin: '2025-04-01', end: '2025-08-31' },
    familyId: 5,
    fieldDate: '2025-04-01',
  },
  {
    plantingId: 11,
    locationId: 1,
    length: 20_000,
    range: { begin: '2024-04-01', end: '2024-09-30' },
    familyId: 7,
    fieldDate: '2024-04-01',
  },
];

describe('délai de retour d’une famille', () => {
  it('compare les dates de mise en place, pas la fin de l’une au début de l’autre', () => {
    // Un an d'écart exactement, pour une famille à 4 ans de délai.
    const conflict = checkRotation(
      1,
      5,
      '2026-04-01',
      { begin: '2026-04-01', end: '2026-09-30' },
      4,
      history,
    );
    expect(conflict).not.toBeNull();
    expect(conflict?.previousPlantingId).toBe(10);
    expect(conflict?.intervalYears).toBeCloseTo(1, 2);
    expect(conflict?.availableFrom).toBe('2029-03-31'); // 2025-04-01 + 4 × 365 jours
  });

  it('accepte le retour une fois le délai écoulé', () => {
    expect(
      checkRotation(1, 5, '2029-04-01', { begin: '2029-04-01', end: '2029-09-30' }, 4, history),
    ).toBeNull();
  });

  it('laisse passer deux séries qui se chevauchent : c’est un conflit de place, pas de rotation', () => {
    // Même famille, même planche, mais les périodes se recouvrent.
    expect(
      checkRotation(1, 5, '2025-06-01', { begin: '2025-06-01', end: '2025-10-31' }, 4, history),
    ).toBeNull();
  });

  it('regarde aussi vers l’avenir : une famille placée juste après pose le même problème', () => {
    const future: Occupation[] = [
      {
        plantingId: 20,
        locationId: 1,
        length: 10_000,
        range: { begin: '2027-03-01', end: '2027-07-31' },
        familyId: 5,
        fieldDate: '2027-03-01',
      },
    ];
    expect(
      checkRotation(1, 5, '2026-04-01', { begin: '2026-04-01', end: '2026-09-30' }, 4, future),
    ).not.toBeNull();
  });

  it('retient le conflit le plus serré quand plusieurs se présentent', () => {
    const dense: Occupation[] = [
      {
        ...history[0]!,
        plantingId: 30,
        fieldDate: '2023-04-01',
        range: { begin: '2023-04-01', end: '2023-08-31' },
      },
      { ...history[0]!, plantingId: 31, fieldDate: '2025-04-01' },
    ];
    const conflict = checkRotation(
      1,
      5,
      '2026-04-01',
      { begin: '2026-04-01', end: '2026-09-30' },
      4,
      dense,
    );
    expect(conflict?.previousPlantingId).toBe(31);
  });

  it('ignore les autres familles, les autres planches et la série replacée', () => {
    const range = { begin: '2026-04-01', end: '2026-09-30' };
    expect(checkRotation(1, 9, '2026-04-01', range, 4, history)).toBeNull();
    expect(checkRotation(2, 5, '2026-04-01', range, 4, history)).toBeNull();
    expect(checkRotation(1, 5, '2026-04-01', range, 4, history, [10])).toBeNull();
  });

  it('ne contrôle rien si la famille n’a pas de délai de retour', () => {
    expect(
      checkRotation(1, 5, '2026-04-01', { begin: '2026-04-01', end: '2026-09-30' }, 0, history),
    ).toBeNull();
  });

  it('présente l’historique de la planche du plus récent au plus ancien', () => {
    expect(bedHistory(1, history).map((o) => o.plantingId)).toEqual([10, 11]);
  });
});
