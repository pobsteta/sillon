// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les valeurs attendues sont calculées à la main depuis les formules de Brinjel
// (`Planting.estimated_*` et `OrderList.seeds_*`), avec les unités de stockage :
// longueur en millimètres, espacement en dixièmes de millimètre, densité en graines
// par kilogramme.

import { describe, expect, it } from 'vitest';
import {
  formatSeedWeight,
  holeCount,
  orderQuantity,
  orderSeedsPerHole,
  seedRequirement,
} from './seeds.js';
import { PlantingType, type PlantingSpec } from './types.js';

// 30 m de planche, 2 rangs, 50 cm sur le rang → 30000 mm et 5000 dixièmes de mm.
const tomate: PlantingSpec = {
  plantingType: PlantingType.transplantRaised,
  length: 30_000,
  rows: 2,
  spacingPlants: 5_000,
  seedsPerGram: 300_000, // 300 graines par gramme
  seedsPerHoleSeedling: 1,
  seedsExtraPercentage: 10,
  estimatedGreenhouseLoss: 10,
  containerSize: 60,
};

// 20 m, 5 rangs, 4 cm sur le rang.
const carotte: PlantingSpec = {
  plantingType: PlantingType.directSeeded,
  length: 20_000,
  rows: 5,
  spacingPlants: 400,
  seedsPerGram: 800_000,
  seedsPerHoleDirect: 3,
  seedsExtraPercentage: 20,
};

describe('nombre de poquets', () => {
  it('multiplie les rangs par la longueur divisée par l’espacement, sans arrondir', () => {
    // 30000 × 10 / 5000 × 2 = 120
    expect(holeCount(tomate)).toBe(120);
    // 20000 × 10 / 400 × 5 = 2500
    expect(holeCount(carotte)).toBe(2500);
  });

  it('laisse la valeur fractionnaire telle quelle', () => {
    // Une planche de 10 m avec 30 cm d'espacement ne tombe pas juste : 33,33 poquets.
    expect(holeCount({ length: 10_000, rows: 1, spacingPlants: 3_000 })).toBeCloseTo(33.333, 3);
  });

  it('renvoie 0 sur une série incomplète plutôt que NaN ou l’infini', () => {
    expect(holeCount({ length: 0, rows: 2, spacingPlants: 5_000 })).toBe(0);
    expect(holeCount({ length: 30_000, rows: 2, spacingPlants: 0 })).toBe(0);
  });
});

describe('fiche d’une série', () => {
  it('compense la perte de pépinière sur les plants et les graines, pas sur les poquets', () => {
    const requirement = seedRequirement(tomate);
    expect(requirement.holes).toBe(120);
    expect(requirement.seedlings).toBe(133); // 120 / 0,9
    expect(requirement.seedsNumber).toBe(133); // 120 × 1 graine / 0,9
    // 120 / 60 alvéoles / 0,9 = 2,22 plaques, à deux décimales
    expect(requirement.containers).toBe(2.22);
    expect(requirement.seedsWeightGrams).toBeCloseTo(133 / 300, 5);
  });

  it('n’applique pas la marge de sécurité sur la fiche, seulement à la commande', () => {
    // 2500 poquets × 3 graines, sans les 20 % de marge.
    expect(seedRequirement(carotte).seedsNumber).toBe(7500);
    expect(seedRequirement(carotte).containers).toBeNull();
    expect(seedRequirement(carotte).seedlings).toBe(0);
  });

  it('compte des plants à repiquer, et aucune graine, pour un plant acheté', () => {
    const requirement = seedRequirement({ ...tomate, plantingType: PlantingType.transplantBought });
    expect(requirement.seedlings).toBe(120);
    expect(requirement.seedsNumber).toBe(0);
  });

  it('traite une production de plants comme une pépinière sans mise en place', () => {
    const requirement = seedRequirement({ ...tomate, plantingType: PlantingType.seedling });
    expect(requirement.seedsNumber).toBe(133);
    expect(requirement.seedlings).toBe(0);
  });

  it('reste défini quand la densité de semences est inconnue', () => {
    const requirement = seedRequirement({ ...carotte, seedsPerGram: null });
    expect(requirement.seedsWeightGrams).toBeNull();
  });
});

describe('quantités de commande', () => {
  it('ajoute la marge de sécurité au semis direct', () => {
    expect(orderSeedsPerHole(carotte)).toBeCloseTo(3.6, 5); // 3 × 1,2
    const quantity = orderQuantity(carotte);
    expect(quantity.seedsNumber).toBe(9000); // 2500 × 3,6
    expect(quantity.seedsQuantityGrams).toBeCloseTo(9000 / 800, 5);
  });

  it('ignore la marge pour une série repiquée et applique la perte', () => {
    expect(orderSeedsPerHole(tomate)).toBeCloseTo(1 / 0.9, 5);
    expect(orderQuantity(tomate).seedsNumber).toBeCloseTo(120 / 0.9, 5);
  });

  it('s’en tient aux graines par poquet quand ni marge ni perte ne sont renseignées', () => {
    expect(orderSeedsPerHole({ ...carotte, seedsExtraPercentage: null })).toBe(3);
    expect(orderSeedsPerHole({ ...tomate, estimatedGreenhouseLoss: null })).toBe(1);
  });

  it('retient la longueur passée en argument, celle posée sur l’assolement', () => {
    // La moitié de la planche seulement est placée.
    expect(orderQuantity(carotte, 10_000).seedsNumber).toBe(4500);
  });
});

describe('affichage des masses', () => {
  it('bascule du milligramme au gramme', () => {
    expect(formatSeedWeight(0.34)).toBe('340 mg');
    expect(formatSeedWeight(1.25)).toBe('1,25 g');
  });
});
