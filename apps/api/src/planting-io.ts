// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Conversion entre la forme relationnelle des séries (tables satellites `planting_dates`
// et `planting_durations`) et la forme manipulée par l'interface et par @sillon/core :
// un objet `dates` et un objet `durations` indexés par type.

import { z } from 'zod';
import {
  PlantingType,
  anchorDateType,
  deriveDates,
  parseIsoDate,
  toIsoDate,
  type IsoDate,
  type PlantingDates,
  type PlantingDurations,
} from '@sillon/core';

export const isoDate = z.iso.date();

export const dateTypes = [
  'greenhouse_sowing',
  'sowing_planting',
  'harvest_begin',
  'harvest_end',
] as const;
export const durationTypes = ['greenhouse', 'to_harvest', 'harvest'] as const;

export const DatesInput = z.record(
  z.enum(dateTypes),
  z.object({ planned: isoDate, effective: isoDate.nullish() }),
);

export const DurationsInput = z.record(z.enum(durationTypes), z.number().int().min(0).max(1000));

type DateRow = { type: string; planned: Date; effective: Date | null };
type DurationRow = { type: string; duration: number };

export function datesFromRows(rows: readonly DateRow[]): PlantingDates {
  const dates: PlantingDates = {};
  for (const row of rows) {
    dates[row.type as keyof PlantingDates] = {
      planned: toIsoDate(row.planned),
      effective: row.effective ? toIsoDate(row.effective) : null,
    };
  }
  return dates;
}

export function durationsFromRows(rows: readonly DurationRow[]): PlantingDurations {
  const durations: PlantingDurations = {};
  for (const row of rows) durations[row.type as keyof PlantingDurations] = row.duration;
  return durations;
}

export function toDbDate(value: IsoDate): Date {
  return parseIsoDate(value);
}

/**
 * Construit le jeu de dates à enregistrer : soit les dates fournies telles quelles,
 * soit celles déduites d'une date d'ancre et des durées (saisie « je sème le 15/03,
 * 35 jours de pépinière, récolte pendant 6 semaines »).
 */
export function resolveDates(input: {
  plantingType: PlantingType;
  dates?: PlantingDates | undefined;
  anchorDate?: IsoDate | undefined;
  durations?: PlantingDurations | undefined;
}): PlantingDates {
  if (input.dates && Object.keys(input.dates).length > 0) return input.dates;
  if (!input.anchorDate) return {};
  const derived = deriveDates(input.anchorDate, input.plantingType, input.durations ?? {});
  const dates: PlantingDates = {};
  for (const [type, planned] of Object.entries(derived)) {
    dates[type as keyof PlantingDates] = { planned, effective: null };
  }
  return dates;
}

/** Type de date servant d'ancre à la série (semis pépinière, sinon mise en place). */
export { anchorDateType };
