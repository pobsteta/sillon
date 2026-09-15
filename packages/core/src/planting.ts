// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Chaîne des dates d'une série. Brinjel stocke à la fois les dates (`planting_dates`)
// et les durées (`planting_durations`) ; l'une se déduit de l'autre, et l'utilisateur
// peut saisir indifféremment « je sème le 15/03 et récolte 60 jours après » ou
// « je sème le 15/03 et je récolte du 15/05 au 30/06 ».

import { addDays, daysBetween } from './dates.js';
import {
  PlantingDateType,
  PlantingDurationType,
  PlantingType,
  type IsoDate,
  type PlantingDates,
  type PlantingDurations,
} from './types.js';

/** La série passe-t-elle par la pépinière ? Seul ce cas porte une date de semis pépinière. */
export function usesGreenhouse(plantingType: PlantingType): boolean {
  return plantingType === PlantingType.transplantRaised;
}

/** La série consomme-t-elle des semences (par opposition au plant acheté) ? */
export function usesSeeds(plantingType: PlantingType): boolean {
  return plantingType !== PlantingType.transplantBought;
}

/**
 * Date qui sert d'ancre à la série : le semis en pépinière si elle y passe,
 * sinon la mise en place (semis direct ou plantation).
 */
export function anchorDateType(plantingType: PlantingType): PlantingDateType {
  return usesGreenhouse(plantingType)
    ? PlantingDateType.greenhouseSowing
    : PlantingDateType.sowingPlanting;
}

/**
 * Déroule les dates d'une série à partir de son ancre et de ses durées.
 * `greenhouse` n'est utilisée que pour les plants produits en pépinière.
 */
export function deriveDates(
  anchor: IsoDate,
  plantingType: PlantingType,
  durations: PlantingDurations,
):
  Record<PlantingDateType, IsoDate> | Omit<Record<PlantingDateType, IsoDate>, 'greenhouse_sowing'> {
  const greenhouse = durations[PlantingDurationType.greenhouse] ?? 0;
  const toHarvest = durations[PlantingDurationType.toHarvest] ?? 0;
  const harvest = durations[PlantingDurationType.harvest] ?? 0;

  const sowingPlanting = usesGreenhouse(plantingType) ? addDays(anchor, greenhouse) : anchor;
  const harvestBegin = addDays(sowingPlanting, toHarvest);
  const harvestEnd = addDays(harvestBegin, harvest);

  const dates = {
    [PlantingDateType.sowingPlanting]: sowingPlanting,
    [PlantingDateType.harvestBegin]: harvestBegin,
    [PlantingDateType.harvestEnd]: harvestEnd,
  };
  return usesGreenhouse(plantingType)
    ? { [PlantingDateType.greenhouseSowing]: anchor, ...dates }
    : dates;
}

/** Opération inverse : retrouve les durées à partir des dates saisies. */
export function deriveDurations(dates: PlantingDates): PlantingDurations {
  const value = (type: PlantingDateType): IsoDate | undefined => dates[type]?.planned;
  const greenhouseSowing = value(PlantingDateType.greenhouseSowing);
  const sowingPlanting = value(PlantingDateType.sowingPlanting);
  const harvestBegin = value(PlantingDateType.harvestBegin);
  const harvestEnd = value(PlantingDateType.harvestEnd);

  const durations: PlantingDurations = {};
  if (greenhouseSowing && sowingPlanting) {
    durations[PlantingDurationType.greenhouse] = daysBetween(greenhouseSowing, sowingPlanting);
  }
  if (sowingPlanting && harvestBegin) {
    durations[PlantingDurationType.toHarvest] = daysBetween(sowingPlanting, harvestBegin);
  }
  if (harvestBegin && harvestEnd) {
    durations[PlantingDurationType.harvest] = daysBetween(harvestBegin, harvestEnd);
  }
  return durations;
}

/**
 * Décale toutes les dates prévues d'une série d'un même nombre de jours
 * (traitement par lot « avancer/retarder la série »). Les dates réalisées ne bougent pas :
 * ce qui a eu lieu a eu lieu.
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

/**
 * Période d'occupation d'une planche par la série : de la mise en place à la fin de récolte.
 * C'est cette fenêtre qui sert au calcul des places disponibles et des rotations.
 * Le temps passé en pépinière n'occupe pas la planche.
 */
export function occupationRange(dates: PlantingDates): { begin: IsoDate; end: IsoDate } | null {
  const begin = dates[PlantingDateType.sowingPlanting];
  const end = dates[PlantingDateType.harvestEnd] ?? dates[PlantingDateType.harvestBegin];
  if (!begin || !end) return null;
  const from = begin.effective ?? begin.planned;
  const to = end.effective ?? end.planned;
  return to >= from ? { begin: from, end: to } : { begin: from, end: from };
}

/** Une série est « en cours » à une date donnée si celle-ci tombe dans sa période d'occupation. */
export function isActiveOn(dates: PlantingDates, date: IsoDate): boolean {
  const range = occupationRange(dates);
  return range !== null && range.begin <= date && date <= range.end;
}
