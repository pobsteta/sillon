// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  availableLength,
  distributeOverBeds,
  findAvailableBeds,
  moveAssignment,
  occupancyRate,
  peakOccupiedLength,
  placeWholeOnBed,
  type Bed,
  type Occupation,
} from './beds.js';

const planche1: Bed = { id: 1, name: 'A1', bedLength: 5000, greenhouse: false };
const planche2: Bed = { id: 2, name: 'A2', bedLength: 3000, greenhouse: false };
const serre: Bed = { id: 3, name: 'S1', bedLength: 2000, greenhouse: true };

const occupations: Occupation[] = [
  {
    plantingId: 10,
    locationId: 1,
    length: 2000,
    range: { begin: '2026-03-01', end: '2026-06-30' },
    familyId: 1,
  },
  {
    plantingId: 11,
    locationId: 1,
    length: 1500,
    range: { begin: '2026-05-01', end: '2026-09-30' },
    familyId: 2,
  },
];

describe('occupation des planches', () => {
  it('retient le pic d’occupation simultanée, pas la somme des séries', () => {
    expect(peakOccupiedLength(occupations, { begin: '2026-03-01', end: '2026-12-31' })).toBe(3500);
    expect(peakOccupiedLength(occupations, { begin: '2026-03-01', end: '2026-04-30' })).toBe(2000);
    expect(peakOccupiedLength(occupations, { begin: '2026-07-01', end: '2026-09-30' })).toBe(1500);
  });

  it('ignore les séries hors période et celles qu’on replace', () => {
    expect(peakOccupiedLength(occupations, { begin: '2026-10-01', end: '2026-11-30' })).toBe(0);
    expect(peakOccupiedLength(occupations, { begin: '2026-05-01', end: '2026-06-30' }, [10])).toBe(
      1500,
    );
  });

  it('calcule la place restante', () => {
    expect(availableLength(planche1, occupations, { begin: '2026-05-01', end: '2026-06-30' })).toBe(
      1500,
    );
    expect(availableLength(planche1, occupations, { begin: '2026-11-01', end: '2026-12-01' })).toBe(
      5000,
    );
  });
});

describe('recherche d’emplacements', () => {
  const byBed = new Map<number, Occupation[]>([[1, occupations]]);

  it('classe les planches par place disponible et signale celles qui conviennent', () => {
    const result = findAvailableBeds(
      [planche1, planche2, serre],
      byBed,
      2000,
      { begin: '2026-05-01', end: '2026-06-30' },
      { greenhouse: false },
    );
    expect(result.map((r) => [r.bed.name, r.availableLength, r.fits])).toEqual([
      ['A2', 3000, true],
      ['A1', 1500, false],
    ]);
  });

  it('filtre le sous-abri', () => {
    const result = findAvailableBeds(
      [planche1, serre],
      byBed,
      100,
      {
        begin: '2026-05-01',
        end: '2026-06-30',
      },
      { greenhouse: true },
    );
    expect(result.map((r) => r.bed.id)).toEqual([3]);
  });

  it('répartit une série sur plusieurs planches et signale le reliquat', () => {
    const candidates = findAvailableBeds([planche1, planche2], byBed, 4000, {
      begin: '2026-05-01',
      end: '2026-06-30',
    });
    expect(distributeOverBeds(4000, candidates)).toEqual({
      assignments: [
        { locationId: 2, length: 3000 },
        { locationId: 1, length: 1000 },
      ],
      remaining: 0,
    });
    expect(distributeOverBeds(6000, candidates).remaining).toBe(1500);
  });
});

describe('taux d’occupation', () => {
  it('rapporte les centimètres-jours occupés à la capacité de la planche', () => {
    const rate = occupancyRate(
      planche2,
      [
        {
          plantingId: 1,
          locationId: 2,
          length: 1500,
          range: { begin: '2026-01-01', end: '2026-12-31' },
        },
      ],
      { begin: '2026-01-01', end: '2026-12-31' },
    );
    expect(rate).toBe(50);
  });
});

describe('placement d’une série entière sur une planche', () => {
  const planche = (id: number, bedLength: number): Bed => ({
    id,
    name: `Planche ${id}`,
    bedLength,
    bedWidth: 800,
    greenhouse: false,
  });

  it('place la longueur demandée quand la planche suffit', () => {
    expect(placeWholeOnBed(planche(1, 30_000), 12_000)).toEqual({
      assignments: [{ locationId: 1, length: 12_000 }],
      remaining: 0,
    });
  });

  it('rabote à la planche et annonce ce qui dépasse', () => {
    // 40 m sur une planche de 30 : on en place 30 et on dit qu'il en reste 10, plutôt que
    // de faire disparaître le surplus.
    expect(placeWholeOnBed(planche(1, 30_000), 40_000)).toEqual({
      assignments: [{ locationId: 1, length: 30_000 }],
      remaining: 10_000,
    });
  });

  it('ne place rien sur une planche de longueur nulle', () => {
    expect(placeWholeOnBed(planche(1, 0), 12_000)).toEqual({ assignments: [], remaining: 12_000 });
  });
});

describe('déplacement d’un tronçon entre planches', () => {
  const planche = (id: number, bedLength: number): Bed => ({
    id,
    name: `Planche ${id}`,
    bedLength,
    bedWidth: 800,
    greenhouse: false,
  });

  it('déplace le tronçon saisi et laisse les autres en place', () => {
    const avant = [
      { locationId: 1, length: 10_000 },
      { locationId: 2, length: 5_000 },
    ];

    const { assignments, remaining } = moveAssignment(avant, 1, planche(3, 30_000));

    expect(remaining).toBe(0);
    expect(assignments).toEqual([
      { locationId: 2, length: 5_000 },
      { locationId: 3, length: 10_000 },
    ]);
  });

  it('fusionne avec le tronçon déjà posé sur la planche d’arrivée', () => {
    // Sans fusion, l'assolement montrerait deux barres accolées pour une seule culture.
    const avant = [
      { locationId: 1, length: 10_000 },
      { locationId: 2, length: 5_000 },
    ];

    const { assignments } = moveAssignment(avant, 1, planche(2, 30_000));

    expect(assignments).toEqual([{ locationId: 2, length: 15_000 }]);
  });

  it('rabote à la planche d’arrivée et signale le dépassement', () => {
    const avant = [{ locationId: 1, length: 40_000 }];

    expect(moveAssignment(avant, 1, planche(2, 30_000))).toEqual({
      assignments: [{ locationId: 2, length: 30_000 }],
      remaining: 10_000,
    });
  });

  it('ne change rien si l’on repose le tronçon sur sa propre planche', () => {
    const avant = [{ locationId: 1, length: 10_000 }];

    expect(moveAssignment(avant, 1, planche(1, 30_000))).toEqual({
      assignments: avant,
      remaining: 0,
    });
  });

  it('ne change rien si le tronçon saisi n’existe pas', () => {
    const avant = [{ locationId: 1, length: 10_000 }];

    expect(moveAssignment(avant, 9, planche(2, 30_000))).toEqual({
      assignments: avant,
      remaining: 0,
    });
  });
});
