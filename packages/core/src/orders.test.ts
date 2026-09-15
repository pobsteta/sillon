// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildOrderLines, orderPeriod, type OrderablePlanting } from './orders.js';
import { toCsv } from './csv.js';
import { PlantingType } from './types.js';

const base = {
  length: 1000,
  rows: 2,
  spacingPlants: 50,
  seedsPerGram: 300,
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
    dates: { greenhouse_sowing: { planned: '2026-02-10' } },
    placed: true,
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
    dates: { greenhouse_sowing: { planned: '2026-03-10' } },
    placed: false,
  },
  {
    ...base,
    id: 3,
    plantingType: PlantingType.directSeed,
    cropId: 2,
    cropName: 'Carotte',
    varietyId: 2,
    varietyName: 'Nantaise',
    providerId: 2,
    providerName: 'Agrosemens',
    dates: { sowing_planting: { planned: '2026-08-01' } },
    placed: true,
  },
];

describe('liste de commande', () => {
  it('regroupe par variété et fournisseur et cumule les quantités', () => {
    const lines = buildOrderLines(plantings);
    expect(lines).toHaveLength(2);
    const tomate = lines.find((l) => l.cropName === 'Tomate');
    expect(tomate?.plantingCount).toBe(2);
    expect(tomate?.seedCount).toBe(80); // 2 × 40 plants, 1 graine par alvéole
    expect(tomate?.firstNeededOn).toBe('2026-02-10');
  });

  it('applique le filtre « séries placées uniquement »', () => {
    const lines = buildOrderLines(plantings, { placedOnly: true });
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
