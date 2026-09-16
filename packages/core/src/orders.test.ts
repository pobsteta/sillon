// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildOrderLines, orderPeriod, type OrderablePlanting } from './orders.js';
import { toCsv } from './csv.js';
import { PlantingType } from './types.js';

// 10 m de planche, 2 rangs, 50 cm sur le rang → 40 poquets.
const base = {
  length: 10_000,
  rows: 2,
  spacingPlants: 5_000,
  seedsPerGram: 300_000,
  seedsPerHoleSeedling: 1,
  seedsPerHoleDirect: 2,
  seedsExtraPercentage: 0,
  estimatedGreenhouseLoss: 0,
  containerSize: 60,
};

const plantings: OrderablePlanting[] = [
  {
    ...base,
    id: 1,
    plantingType: PlantingType.transplantRaised,
    cropId: 1,
    cropName: 'Tomate',
    varietyId: 1,
    varietyName: 'Marmande',
    providerId: 1,
    providerName: 'Germinance',
    dates: { sowing: { planned: '2026-02-10' }, planting: { planned: '2026-03-20' } },
    assignedLength: 10_000,
  },
  {
    ...base,
    id: 2,
    plantingType: PlantingType.transplantRaised,
    cropId: 1,
    cropName: 'Tomate',
    varietyId: 1,
    varietyName: 'Marmande',
    providerId: 1,
    providerName: 'Germinance',
    dates: { sowing: { planned: '2026-03-10' }, planting: { planned: '2026-04-20' } },
    assignedLength: 0,
  },
  {
    ...base,
    id: 3,
    plantingType: PlantingType.directSeeded,
    cropId: 2,
    cropName: 'Carotte',
    varietyId: 2,
    varietyName: 'Nantaise',
    providerId: 2,
    providerName: 'Agrosemens',
    dates: { sowing: { planned: '2026-08-01' } },
    assignedLength: 10_000,
  },
];

describe('liste de commande', () => {
  it('regroupe par variété et fournisseur et cumule les quantités', () => {
    const lines = buildOrderLines(plantings);
    expect(lines).toHaveLength(2);
    const tomate = lines.find((l) => l.cropName === 'Tomate');
    expect(tomate?.plantingCount).toBe(2);
    expect(tomate?.seedsNumber).toBe(80); // 2 × 40 alvéoles, 1 graine chacune
    expect(tomate?.firstNeededOn).toBe('2026-02-10');
  });

  it('retient la longueur posée sur l’assolement quand on le demande', () => {
    // La seconde série de tomate n'est pas placée : sa longueur retenue est nulle.
    const lines = buildOrderLines(plantings, { assignedPlantingsOnly: true });
    expect(lines.find((l) => l.cropName === 'Tomate')?.plantingCount).toBe(1);
  });

  it('restreint à une période et à un fournisseur', () => {
    expect(buildOrderLines(plantings, { range: orderPeriod(2026, 'h1') })).toHaveLength(1);
    expect(buildOrderLines(plantings, { providerIds: [2] })).toHaveLength(1);
  });

  it('découpe l’année en semestres et trimestres', () => {
    expect(orderPeriod(2026, 'q3')).toEqual({ begin: '2026-07-01', end: '2026-09-30' });
  });
});

describe('export CSV', () => {
  it('échappe les séparateurs et les guillemets, et ajoute le BOM', () => {
    const csv = toCsv(
      [{ name: 'Tomate; ancienne', note: 'dit «"la" bonne»' }],
      [
        { header: 'Espèce', value: (r) => r.name },
        { header: 'Note', value: (r) => r.note },
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Tomate; ancienne"');
    expect(csv).toContain('"dit «""la"" bonne»"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
