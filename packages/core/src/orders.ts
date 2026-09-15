// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Commandes de semences et de plants (§3.4 du brief) : agrégation des besoins de toutes
// les séries d'une période, regroupés par variété et par fournisseur.

import { anchorDateType } from './planting.js';
import { seedRequirement } from './seeds.js';
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
  dates: PlantingDates;
  /** La série est-elle posée sur l'assolement ? (filtre « séries placées uniquement ») */
  placed: boolean;
}

export interface OrderLine {
  key: string;
  cropId: number;
  cropName: string;
  varietyId: number | null;
  varietyName: string | null;
  providerId: number | null;
  providerName: string | null;
  /** Nombre de séries concernées. */
  plantingCount: number;
  /** Graines à commander, marge comprise. */
  seedCount: number;
  /** Masse correspondante en milligrammes, `null` si aucune série ne renseigne `seedsPerGram`. */
  seedMassMg: number | null;
  /** Plants à acheter pour les séries en plant acheté. */
  plantsToBuy: number;
  /** Date de la première utilisation (semis ou plantation), pour trier la commande. */
  firstNeededOn: IsoDate | null;
}

export interface OrderOptions {
  /** Ne retenir que les séries placées sur l'assolement. */
  placedOnly?: boolean;
  /** Restreindre à une période, d'après la date d'ancre de la série. */
  range?: DateRange | null;
  providerIds?: readonly number[] | null;
  cropIds?: readonly number[] | null;
}

function anchorOf(planting: OrderablePlanting): IsoDate | null {
  const date = planting.dates[anchorDateType(planting.plantingType)];
  return date ? (date.effective ?? date.planned) : null;
}

/** Construit la liste de commande à partir des séries du plan de culture. */
export function buildOrderLines(
  plantings: readonly OrderablePlanting[],
  options: OrderOptions = {},
): OrderLine[] {
  const lines = new Map<string, OrderLine>();

  for (const planting of plantings) {
    if (options.placedOnly && !planting.placed) continue;
    if (options.providerIds?.length && !options.providerIds.includes(planting.providerId ?? -1)) {
      continue;
    }
    if (options.cropIds?.length && !options.cropIds.includes(planting.cropId)) continue;

    const anchor = anchorOf(planting);
    if (options.range) {
      if (!anchor) continue;
      if (anchor < options.range.begin || anchor > options.range.end) continue;
    }

    const requirement = seedRequirement(planting);
    if (requirement.seedCount === 0 && (requirement.plantsToBuy ?? 0) === 0) continue;

    const key = `${planting.cropId}:${planting.varietyId ?? 0}:${planting.providerId ?? 0}`;
    const existing = lines.get(key);
    if (existing) {
      existing.plantingCount += 1;
      existing.seedCount += requirement.seedCount;
      if (requirement.seedMassMg !== null) {
        existing.seedMassMg = (existing.seedMassMg ?? 0) + requirement.seedMassMg;
      }
      existing.plantsToBuy += requirement.plantsToBuy ?? 0;
      if (anchor && (!existing.firstNeededOn || anchor < existing.firstNeededOn)) {
        existing.firstNeededOn = anchor;
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
        plantingCount: 1,
        seedCount: requirement.seedCount,
        seedMassMg: requirement.seedMassMg,
        plantsToBuy: requirement.plantsToBuy ?? 0,
        firstNeededOn: anchor,
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
