// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Chaîne des dates d'une série, reprise de `Brinjel.CropPlan.Planting`.
//
// Le modèle stocke trois dates — semis, rempotage, plantation — et trois durées ;
// les dates de récolte ne sont pas stockées comme dates de série mais déduites des
// durées, et conservées dans les périodes de récolte (`harvest_periods`) :
//
//   plantation  = semis + jours de pépinière
//   1re récolte = mise en place + jours jusqu'à maturité
//   dernière    = 1re récolte + fenêtre de récolte
//
// La « mise en place » (`planned_field_date`) est la date de plantation pour une série
// repiquée, la date de semis pour un semis direct ; une série de production de plants
// n'en a pas, puisqu'elle n'occupe jamais de planche.

import { addDays, daysBetween } from './dates.js';
import {
  PlantingDateType,
  PlantingDurationType,
  PlantingType,
  type DateRange,
  type HarvestPeriod,
  type IsoDate,
  type PlantingDates,
  type PlantingDurations,
} from './types.js';

/** La série passe-t-elle par la pépinière avant d'être repiquée ? */
export function usesNursery(plantingType: PlantingType): boolean {
  return plantingType === PlantingType.transplantRaised;
}

/** La série consomme-t-elle des semences ? Le plant acheté, non. */
export function usesSeeds(plantingType: PlantingType): boolean {
  return plantingType !== PlantingType.transplantBought;
}

/** La série occupe-t-elle une planche au champ ? La production de plants, non. */
export function occupiesField(plantingType: PlantingType): boolean {
  return plantingType !== PlantingType.seedling;
}

/**
 * Type de date qui marque la mise en place au champ : la plantation pour une série
 * repiquée ou achetée, le semis pour un semis direct.
 */
export function fieldDateType(plantingType: PlantingType): PlantingDateType | null {
  if (plantingType === PlantingType.directSeeded) return PlantingDateType.sowing;
  if (plantingType === PlantingType.seedling) return null;
  return PlantingDateType.planting;
}

function dateValue(dates: PlantingDates, type: PlantingDateType): IsoDate | undefined {
  const entry = dates[type];
  return entry ? (entry.effective ?? entry.planned) : undefined;
}

/** Date de mise en place au champ, ou `null` pour une production de plants. */
export function fieldDate(dates: PlantingDates, plantingType: PlantingType): IsoDate | null {
  const type = fieldDateType(plantingType);
  return type ? (dateValue(dates, type) ?? null) : null;
}

export interface DerivedDates {
  dates: Partial<Record<PlantingDateType, IsoDate>>;
  harvestPeriod: HarvestPeriod | null;
}

/**
 * Déroule les dates d'une série à partir de sa date de semis et de ses durées.
 * Une série repiquée reçoit sa date de plantation ; toutes reçoivent leur période de
 * récolte dès que la durée jusqu'à maturité est connue.
 */
export function deriveDates(
  sowing: IsoDate,
  plantingType: PlantingType,
  durations: PlantingDurations,
): DerivedDates {
  const daysToTransplant = durations[PlantingDurationType.daysToTransplant] ?? 0;
  const daysToMaturity = durations[PlantingDurationType.daysToMaturity];
  const harvestWindow = durations[PlantingDurationType.harvestWindow] ?? 0;

  const dates: Partial<Record<PlantingDateType, IsoDate>> = {
    [PlantingDateType.sowing]: sowing,
  };
  if (plantingType !== PlantingType.directSeeded && plantingType !== PlantingType.seedling) {
    dates[PlantingDateType.planting] = addDays(sowing, daysToTransplant);
  }

  const inField = dates[fieldDateType(plantingType) ?? PlantingDateType.sowing];
  if (daysToMaturity === undefined || !inField || plantingType === PlantingType.seedling) {
    return { dates, harvestPeriod: null };
  }

  const begin = addDays(inField, daysToMaturity);
  return { dates, harvestPeriod: { begin, end: addDays(begin, harvestWindow) } };
}

/**
 * Opération inverse : retrouve les durées à partir des dates et de la première période
 * de récolte, comme le fait l'import CSV de Brinjel.
 */
export function deriveDurations(
  dates: PlantingDates,
  plantingType: PlantingType,
  harvestPeriod?: HarvestPeriod | null,
): PlantingDurations {
  const sowing = dateValue(dates, PlantingDateType.sowing);
  const planting = dateValue(dates, PlantingDateType.planting);
  const inField = fieldDate(dates, plantingType);

  const durations: PlantingDurations = {};
  if (sowing && planting) {
    durations[PlantingDurationType.daysToTransplant] = daysBetween(sowing, planting);
  }
  if (inField && harvestPeriod) {
    durations[PlantingDurationType.daysToMaturity] = daysBetween(inField, harvestPeriod.begin);
    durations[PlantingDurationType.harvestWindow] = daysBetween(
      harvestPeriod.begin,
      harvestPeriod.end,
    );
  }
  return durations;
}

/**
 * Décale toutes les dates prévues d'une série d'un même nombre de jours
 * (traitement par lot « avancer/retarder la série »). Les dates réalisées ne bougent
 * pas : ce qui a eu lieu a eu lieu.
 */
export function shiftPlantingDates(dates: PlantingDates, days: number): PlantingDates {
  const shifted: PlantingDates = {};
  for (const [type, value] of Object.entries(dates) as [
    PlantingDateType,
    PlantingDates[PlantingDateType],
  ][]) {
    if (!value) continue;
    shifted[type] = { planned: addDays(value.planned, days), effective: value.effective ?? null };
  }
  return shifted;
}

export function shiftHarvestPeriods(
  periods: readonly HarvestPeriod[],
  days: number,
): HarvestPeriod[] {
  return periods.map((period) => ({
    begin: addDays(period.begin, days),
    end: addDays(period.end, days),
  }));
}

/**
 * Période d'occupation d'une planche : de la mise en place au dernier jour de récolte
 * (`planned_field_dates`). Le temps passé en pépinière n'occupe pas la planche, et une
 * production de plants n'en occupe aucune.
 */
export function occupationRange(
  dates: PlantingDates,
  plantingType: PlantingType,
  harvestPeriods: readonly HarvestPeriod[] = [],
): DateRange | null {
  if (!occupiesField(plantingType)) return null;
  const begin = fieldDate(dates, plantingType);
  if (!begin) return null;

  const lastDay = harvestPeriods.reduce<IsoDate | null>(
    (latest, period) => (latest === null || period.end > latest ? period.end : latest),
    null,
  );
  const end = lastDay && lastDay >= begin ? lastDay : begin;
  return { begin, end };
}

/** Une série est « en cours » à une date donnée si celle-ci tombe dans son occupation. */
export function isActiveOn(
  dates: PlantingDates,
  plantingType: PlantingType,
  harvestPeriods: readonly HarvestPeriod[],
  date: IsoDate,
): boolean {
  const range = occupationRange(dates, plantingType, harvestPeriods);
  return range !== null && range.begin <= date && date <= range.end;
}
