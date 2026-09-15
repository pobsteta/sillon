// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatSeedMass, plantCount, seedRequirement } from './seeds.js';
import { PlantingType, type PlantingSpec } from './types.js';

const tomate: PlantingSpec = {
  plantingType: PlantingType.transplantRaised,
  length: 3000, // 30 m
  rows: 2,
  spacingPlants: 50,
  seedsPerGram: 300,
  seedsPerHoleSeedling: 1,
  seedsExtraPercentage: 10,
  estimatedGreenhouseLoss: 10,
  containerSize: 60,
};

const carotte: PlantingSpec = {
  plantingType: PlantingType.directSeed,
  length: 2000,
  rows: 5,
  spacingPlants: 4,
  seedsPerGram: 800,
  seedsPerHoleDirect: 3,
  seedsExtraPercentage: 20,
};

describe('nombre de plants', () => {
  it('multiplie les rangs par les plants tenant sur la longueur', () => {
    expect(plantCount(tomate)).toBe(120);
    expect(plantCount(carotte)).toBe(2500);
  });

  it('renvoie 0 sur une série incomplète plutôt que NaN ou l’infini', () => {
    expect(plantCount({ length: 0, rows: 2, spacingPlants: 50 })).toBe(0);
    expect(plantCount({ length: 3000, rows: 2, spacingPlants: 0 })).toBe(0);
  });
});

describe('besoins en semences', () => {
  it('compense la perte en pépinière puis ajoute la marge de sécurité', () => {
    const requirement = seedRequirement(tomate);
    expect(requirement.plantCount).toBe(120);
    expect(requirement.holesToSow).toBe(134); // 120 / 0,9 arrondi au trou supérieur
    expect(requirement.seedCount).toBe(148); // 134 × 1 graine × 1,1
    expect(requirement.trays).toBe(3);
    expect(requirement.spareCells).toBe(46);
    expect(requirement.seedMassMg).toBe(494);
    expect(requirement.plantsToBuy).toBeNull();
  });

  it('sème plusieurs graines par poquet en semis direct, sans plaque ni perte pépinière', () => {
    const requirement = seedRequirement(carotte);
    expect(requirement.holesToSow).toBe(2500);
    expect(requirement.seedCount).toBe(9000);
    expect(requirement.trays).toBeNull();
    expect(requirement.seedMassMg).toBe(11250);
  });

  it('ne compte aucune semence pour un plant acheté, mais des plants à commander', () => {
    const requirement = seedRequirement({ ...tomate, plantingType: PlantingType.transplantBought });
    expect(requirement.seedCount).toBe(0);
    expect(requirement.plantsToBuy).toBe(120);
    expect(requirement.trays).toBeNull();
  });

  it('reste défini quand les paramètres de semis ne sont pas renseignés', () => {
    const requirement = seedRequirement({
      plantingType: PlantingType.directSeed,
      length: 1000,
      rows: 1,
      spacingPlants: 25,
    });
    expect(requirement.seedCount).toBe(40); // 1 graine par poquet, aucune marge
    expect(requirement.seedMassMg).toBeNull();
  });
});

describe('affichage des masses', () => {
  it('bascule du milligramme au gramme', () => {
    expect(formatSeedMass(340)).toBe('340 mg');
    expect(formatSeedMass(1250)).toBe('1,25 g');
  });
});
