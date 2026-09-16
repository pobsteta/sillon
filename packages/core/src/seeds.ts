// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (formules d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Quantités de semences, de plants et de plaques de pépinière.
//
// Les formules suivent `Brinjel.CropPlan.Planting` (fiche d'une série) et
// `Brinjel.CropPlan.OrderList` (liste de commande), qui diffèrent sur un point :
// la marge de sécurité `seeds_extra_percentage` n'entre QUE dans la commande, et
// seulement pour le semis direct. La fiche montre l'estimation nue.
//
// Deux pièges, vérifiés sur la source :
//   * le nombre de poquets n'est pas arrondi — c'est un flottant qui se propage ;
//   * la perte en pépinière divise les graines par alvéole et le nombre de plants
//     (`/ (1 − perte)`), elle n'augmente pas le nombre de poquets.

import { PlantingType, type PlantingSpec } from './types.js';
import { SEEDS_PER_GRAM_FACTOR } from './units.js';

export interface SeedRequirement {
  /** Poquets ou alvéoles à semer, valeur non arrondie comme dans Brinjel. */
  holes: number;
  /** Plants attendus en place, pertes de pépinière comprises. */
  seedlings: number;
  /** Plaques de pépinière à préparer, à deux décimales ; `null` sans plaque choisie. */
  containers: number | null;
  /** Graines à semer, hors marge de sécurité. */
  seedsNumber: number;
  /** Masse correspondante en grammes ; `null` si la densité est inconnue. */
  seedsWeightGrams: number | null;
}

function greenhouseLossRatio(spec: PlantingSpec): number {
  const loss = spec.estimatedGreenhouseLoss ?? 0;
  // Une perte de 100 % rendrait la division impossible : Brinjel ne la borne pas,
  // le formulaire la limite à 99 %.
  return Math.min(Math.max(loss, 0), 99) / 100;
}

/**
 * Poquets tenant sur la planche : `longueur × 10 / espacement × rangs`.
 * Le facteur 10 convertit les millimètres de la longueur en dixièmes de millimètre,
 * unité de l'espacement (commentaire d'origine dans `order_list.ex`).
 */
export function holeCount(spec: Pick<PlantingSpec, 'length' | 'rows' | 'spacingPlants'>): number {
  const { length, rows, spacingPlants } = spec;
  if (length <= 0 || rows <= 0 || spacingPlants <= 0) return 0;
  return ((length * 10) / spacingPlants) * rows;
}

/** Quantités affichées sur la fiche d'une série, sans marge de sécurité. */
export function seedRequirement(spec: PlantingSpec): SeedRequirement {
  const holes = holeCount(spec);
  const loss = greenhouseLossRatio(spec);

  let seedlings = 0;
  if (spec.plantingType === PlantingType.transplantRaised) {
    seedlings = holes === 0 ? 0 : Math.round(holes / (1 - loss));
  } else if (spec.plantingType === PlantingType.transplantBought) {
    seedlings = Math.round(holes);
  }

  let seedsNumber = 0;
  if (spec.plantingType === PlantingType.directSeeded) {
    seedsNumber = holes * (spec.seedsPerHoleDirect ?? 0);
  } else if (
    spec.plantingType === PlantingType.transplantRaised ||
    spec.plantingType === PlantingType.seedling
  ) {
    seedsNumber = Math.round((holes * (spec.seedsPerHoleSeedling ?? 0)) / (1 - loss));
  }

  const containers =
    spec.containerSize && spec.containerSize > 0 && holes > 0
      ? Math.round((holes / spec.containerSize / (1 - loss)) * 100) / 100
      : null;

  // `seedsPerGram` est stocké en graines par kilogramme.
  const seedsPerGram = spec.seedsPerGram ? spec.seedsPerGram / SEEDS_PER_GRAM_FACTOR : 0;

  return {
    holes,
    seedlings,
    containers,
    seedsNumber,
    seedsWeightGrams: seedsPerGram > 0 ? seedsNumber / seedsPerGram : null,
  };
}

/**
 * Graines par poquet retenues pour une COMMANDE (`OrderList.seeds_per_hole`).
 * C'est ici, et seulement ici, que la marge de sécurité s'applique — au semis direct.
 */
export function orderSeedsPerHole(spec: PlantingSpec): number {
  if (spec.plantingType === PlantingType.directSeeded) {
    const perHole = spec.seedsPerHoleDirect ?? 0;
    if (spec.seedsExtraPercentage === null || spec.seedsExtraPercentage === undefined) {
      return perHole;
    }
    return perHole * (1 + spec.seedsExtraPercentage / 100);
  }

  const perHole = spec.seedsPerHoleSeedling ?? 0;
  if (spec.estimatedGreenhouseLoss === null || spec.estimatedGreenhouseLoss === undefined) {
    return perHole;
  }
  return perHole / (1 - greenhouseLossRatio(spec));
}

export interface OrderQuantity {
  seedsNumber: number;
  /** Masse en grammes ; `null` si la densité est inconnue. */
  seedsQuantityGrams: number | null;
}

/**
 * Quantités d'une ligne de commande, pour la longueur retenue — celle de la série,
 * ou la longueur déjà placée sur l'assolement selon le filtre choisi.
 */
export function orderQuantity(spec: PlantingSpec, length: number = spec.length): OrderQuantity {
  const holes = holeCount({ ...spec, length });
  const seedsNumber = holes * orderSeedsPerHole(spec);
  const seedsPerGram = spec.seedsPerGram ? spec.seedsPerGram / SEEDS_PER_GRAM_FACTOR : 0;
  return {
    seedsNumber,
    seedsQuantityGrams: seedsPerGram > 0 ? seedsNumber / seedsPerGram : null,
  };
}

/** Formate une masse de semences en grammes : « 1,25 g », « 340 mg ». */
export function formatSeedWeight(grams: number, locale = 'fr'): string {
  if (grams < 1) {
    return `${Math.round(grams * 1000).toLocaleString(locale)} mg`;
  }
  return `${grams.toLocaleString(locale, { maximumFractionDigits: 2 })} g`;
}
