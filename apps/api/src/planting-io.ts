// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Conversion entre la forme relationnelle d'une série — les tables satellites
// `planting_dates`, `planting_durations` et `harvest_periods` — et la forme manipulée
// par l'interface et par @sillon/core : un objet `dates`, un objet `durations` et une
// liste de fenêtres de récolte.

import { z } from 'zod';
import {
  deriveDates,
  parseIsoDate,
  toIsoDate,
  type HarvestPeriod,
  type IsoDate,
  type PlantingDates,
  type PlantingDurations,
  type PlantingType,
} from '@sillon/core';

export const isoDate = z.iso.date();

export const dateTypes = ['sowing', 'planting', 'potting'] as const;
export const durationTypes = ['days_to_transplant', 'days_to_maturity', 'harvest_window'] as const;

export const DatesInput = z.record(
  z.enum(dateTypes),
  z.object({ planned: isoDate, effective: isoDate.nullish() }),
);

export const DurationsInput = z.record(z.enum(durationTypes), z.number().int().min(0).max(1000));

export const HarvestPeriodsInput = z.array(z.object({ begin: isoDate, end: isoDate })).max(20);

type DateRow = { type: string; planned: Date; effective: Date | null };
type DurationRow = { type: string; duration: number };
type PeriodRow = { begin: Date; end: Date };

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

export function harvestPeriodsFromRows(rows: readonly PeriodRow[]): HarvestPeriod[] {
  return rows
    .map((row) => ({ begin: toIsoDate(row.begin), end: toIsoDate(row.end) }))
    .sort((a, b) => a.begin.localeCompare(b.begin));
}

export function toDbDate(value: IsoDate): Date {
  return parseIsoDate(value);
}

export interface ResolvedSchedule {
  dates: PlantingDates;
  harvestPeriods: HarvestPeriod[] | null;
}

/**
 * Construit dates et fenêtres de récolte à enregistrer : soit les valeurs fournies
 * telles quelles, soit celles déduites d'une date de semis et des durées — la saisie
 * « je sème le 20/02, 45 jours de pépinière, récolte 60 jours après la plantation
 * pendant 90 jours ».
 */
export function resolveSchedule(input: {
  plantingType: PlantingType;
  dates?: PlantingDates | undefined;
  sowingDate?: IsoDate | undefined;
  durations?: PlantingDurations | undefined;
  harvestPeriods?: HarvestPeriod[] | undefined;
}): ResolvedSchedule {
  if (input.dates && Object.keys(input.dates).length > 0) {
    return { dates: input.dates, harvestPeriods: input.harvestPeriods ?? null };
  }
  if (!input.sowingDate) {
    return { dates: {}, harvestPeriods: input.harvestPeriods ?? null };
  }

  const derived = deriveDates(input.sowingDate, input.plantingType, input.durations ?? {});
  const dates: PlantingDates = {};
  for (const [type, planned] of Object.entries(derived.dates)) {
    dates[type as keyof PlantingDates] = { planned: planned as IsoDate, effective: null };
  }
  return {
    dates,
    harvestPeriods:
      input.harvestPeriods ?? (derived.harvestPeriod ? [derived.harvestPeriod] : null),
  };
}
