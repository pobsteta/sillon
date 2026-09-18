// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Commandes de semences et de plants, d'après `Brinjel.CropPlan.OrderList` :
// les séries de la période sont regroupées par espèce puis par variété, et les
// quantités s'y calculent avec la marge de sécurité — contrairement à la fiche d'une
// série. Le filtre « séries placées uniquement » remplace la longueur de la série par
// la longueur réellement posée sur l'assolement.

import { fieldDate, usesSeeds } from './planting.js';
import { orderQuantity } from './seeds.js';
import { PlantingType } from './types.js';
import type { DateRange, IsoDate, PlantingDates, PlantingSpec } from './types.js';

/** Une série vue par le module de commande. */
export interface OrderablePlanting extends PlantingSpec {
  id: number;
  cropId: number;
  cropName: string;
  varietyId: number | null;
  varietyName: string | null;
  providerId: number | null;
  providerName: string | null;
  /** Site du fournisseur, quand la ferme l'a renseigné : la feuille de commande y mène. */
  providerUrl?: string | null;
  dates: PlantingDates;
  /** Longueur déjà posée sur l'assolement, en millimètres. */
  assignedLength: number;
}

export interface OrderLine {
  key: string;
  cropId: number;
  cropName: string;
  varietyId: number | null;
  varietyName: string | null;
  providerId: number | null;
  providerName: string | null;
  /** Site du fournisseur, quand la ferme l'a renseigné : la feuille de commande y mène. */
  providerUrl?: string | null;
  /** Nombre de séries concernées. */
  plantingCount: number;
  /** Graines à commander, marge de sécurité comprise. */
  seedsNumber: number;
  /** Masse correspondante en grammes ; `null` si aucune série ne donne sa densité. */
  seedsQuantityGrams: number | null;
  /** Plants à acheter, pour les séries en plant acheté. */
  transplantsToBuy: number;
  /** Date de la première utilisation, pour trier la commande. */
  firstNeededOn: IsoDate | null;
}

export interface OrderOptions {
  /** Ne retenir que la longueur placée sur l'assolement. */
  assignedPlantingsOnly?: boolean;
  /** Restreindre à une période, d'après la date de semis. */
  range?: DateRange | null;
  providerIds?: readonly number[] | null;
  cropIds?: readonly number[] | null;
}

function sowingDate(planting: OrderablePlanting): IsoDate | null {
  const sowing = planting.dates.sowing;
  if (sowing) return sowing.effective ?? sowing.planned;
  return fieldDate(planting.dates, planting.plantingType);
}

/** Construit la liste de commande à partir des séries du plan de culture. */
export function buildOrderLines(
  plantings: readonly OrderablePlanting[],
  options: OrderOptions = {},
): OrderLine[] {
  const lines = new Map<string, OrderLine>();

  for (const planting of plantings) {
    if (options.providerIds?.length && !options.providerIds.includes(planting.providerId ?? -1)) {
      continue;
    }
    if (options.cropIds?.length && !options.cropIds.includes(planting.cropId)) continue;

    const sowing = sowingDate(planting);
    if (options.range) {
      if (!sowing) continue;
      if (sowing < options.range.begin || sowing > options.range.end) continue;
    }

    const length = options.assignedPlantingsOnly ? planting.assignedLength : planting.length;
    if (length <= 0) continue;

    const quantity = usesSeeds(planting.plantingType)
      ? orderQuantity(planting, length)
      : { seedsNumber: 0, seedsQuantityGrams: null };
    const transplants =
      planting.plantingType === PlantingType.transplantBought
        ? Math.round(((length * 10) / (planting.spacingPlants || 1)) * planting.rows)
        : 0;
    if (quantity.seedsNumber === 0 && transplants === 0) continue;

    const key = `${planting.cropId}:${planting.varietyId ?? 0}:${planting.providerId ?? 0}`;
    const existing = lines.get(key);
    if (existing) {
      existing.plantingCount += 1;
      existing.seedsNumber += quantity.seedsNumber;
      if (quantity.seedsQuantityGrams !== null) {
        existing.seedsQuantityGrams =
          (existing.seedsQuantityGrams ?? 0) + quantity.seedsQuantityGrams;
      }
      existing.transplantsToBuy += transplants;
      if (sowing && (!existing.firstNeededOn || sowing < existing.firstNeededOn)) {
        existing.firstNeededOn = sowing;
      }
    } else {
      lines.set(key, {
        key,
        cropId: planting.cropId,
        cropName: planting.cropName,
        varietyId: planting.varietyId,
        varietyName: planting.varietyName,
        providerId: planting.providerId,
        providerName: planting.providerName,
        providerUrl: planting.providerUrl ?? null,
        plantingCount: 1,
        seedsNumber: quantity.seedsNumber,
        seedsQuantityGrams: quantity.seedsQuantityGrams,
        transplantsToBuy: transplants,
        firstNeededOn: sowing,
      });
    }
  }

  return [...lines.values()].sort(
    (a, b) =>
      (a.providerName ?? '').localeCompare(b.providerName ?? '') ||
      a.cropName.localeCompare(b.cropName) ||
      (a.varietyName ?? '').localeCompare(b.varietyName ?? ''),
  );
}

/** Découpe une année en périodes de commande (année, semestre, trimestre). */
export function orderPeriod(
  year: number,
  period: 'year' | 'h1' | 'h2' | 'q1' | 'q2' | 'q3' | 'q4',
): DateRange {
  const ranges: Record<typeof period, [string, string]> = {
    year: ['01-01', '12-31'],
    h1: ['01-01', '06-30'],
    h2: ['07-01', '12-31'],
    q1: ['01-01', '03-31'],
    q2: ['04-01', '06-30'],
    q3: ['07-01', '09-30'],
    q4: ['10-01', '12-31'],
  };
  const [begin, end] = ranges[period];
  return { begin: `${year}-${begin}`, end: `${year}-${end}` };
}
