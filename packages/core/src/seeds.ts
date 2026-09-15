// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calcul des quantités de semences, de plants et de plaques de pépinière.
//
// Hypothèses de portage (à confirmer face à `lib/brinjel/planting.ex`, cf. §6 du modèle
// de données) — elles sont isolées ici pour être faciles à corriger :
//   * le nombre de plants par rang est `floor(longueur / espacement)` : on ne compte pas
//     un plant supplémentaire en bout de planche ;
//   * la perte en pépinière augmente le nombre d'alvéoles semées, la marge de sécurité
//     augmente la quantité de semences ;
//   * tous les arrondis se font vers le haut : on ne sème jamais un demi-trou.

import { PlantingType, type PlantingSpec } from './types.js';
import { usesGreenhouse, usesSeeds } from './planting.js';

export interface SeedRequirement {
  /** Nombre de plants en place visés sur la planche. */
  plantCount: number;
  /** Alvéoles (pépinière) ou poquets (semis direct) à semer, pertes comprises. */
  holesToSow: number;
  /** Plaques de pépinière à préparer ; `null` si la série n'en utilise pas. */
  trays: number | null;
  /** Alvéoles inutilisées sur la dernière plaque ; `null` sans plaque. */
  spareCells: number | null;
  /** Graines à prévoir, marge de sécurité comprise. */
  seedCount: number;
  /** Masse de semences en milligrammes (entier), `null` si `seedsPerGram` est inconnu. */
  seedMassMg: number | null;
  /** Plants à commander pour une série en plant acheté ; `null` sinon. */
  plantsToBuy: number | null;
}

/** Nombre de plants tenant sur la planche, d'après la longueur, les rangs et l'espacement. */
export function plantCount(spec: Pick<PlantingSpec, 'length' | 'rows' | 'spacingPlants'>): number {
  const { length, rows, spacingPlants } = spec;
  if (length <= 0 || rows <= 0 || spacingPlants <= 0) return 0;
  return Math.floor(length / spacingPlants) * rows;
}

function applyPercentage(value: number, percentage: number): number {
  return Math.ceil(value * (1 + percentage / 100));
}

/**
 * Applique une perte attendue : pour obtenir `value` plants malgré `loss` % de pertes,
 * il faut en semer `value / (1 - loss)`.
 */
function compensateLoss(value: number, lossPercentage: number): number {
  const loss = Math.min(Math.max(lossPercentage, 0), 99);
  return Math.ceil(value / (1 - loss / 100));
}

/** Quantités à prévoir pour une série : semences, alvéoles, plaques, plants à acheter. */
export function seedRequirement(spec: PlantingSpec): SeedRequirement {
  const plants = plantCount(spec);
  const extra = spec.seedsExtraPercentage ?? 0;

  if (spec.plantingType === PlantingType.transplantBought) {
    return {
      plantCount: plants,
      holesToSow: 0,
      trays: null,
      spareCells: null,
      seedCount: 0,
      seedMassMg: null,
      plantsToBuy: plants,
    };
  }

  const greenhouse = usesGreenhouse(spec.plantingType);
  const holesToSow = greenhouse
    ? compensateLoss(plants, spec.estimatedGreenhouseLoss ?? 0)
    : plants;
  const seedsPerHole = greenhouse
    ? (spec.seedsPerHoleSeedling ?? 1)
    : (spec.seedsPerHoleDirect ?? 1);
  const seedCount = usesSeeds(spec.plantingType)
    ? applyPercentage(holesToSow * Math.max(seedsPerHole, 0), extra)
    : 0;

  const containerSize = greenhouse ? (spec.containerSize ?? null) : null;
  const trays = containerSize && containerSize > 0 ? Math.ceil(holesToSow / containerSize) : null;
  const spareCells = trays !== null && containerSize ? trays * containerSize - holesToSow : null;

  return {
    plantCount: plants,
    holesToSow,
    trays,
    spareCells,
    seedCount,
    seedMassMg:
      spec.seedsPerGram && spec.seedsPerGram > 0
        ? Math.ceil((seedCount * 1000) / spec.seedsPerGram)
        : null,
    plantsToBuy: null,
  };
}

/** Formate une masse de semences (mg) pour l'affichage : « 1,25 g », « 340 mg ». */
export function formatSeedMass(massMg: number, locale = 'fr'): string {
  if (massMg < 1000) return `${massMg} mg`;
  return `${(massMg / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} g`;
}
