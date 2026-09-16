// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rotation des cultures. Reprend `rotation_conflicting_plantings?` de
// `lib/brinjel_web/live/locations_live.ex` :
//
//   même famille botanique
//   ET les deux séries ne se chevauchent pas au champ (sinon c'est un conflit de place)
//   ET |date de mise en place 1 − date de mise en place 2| / 365 < intervalle de la famille
//
// Deux points vérifiés sur la source, contre-intuitifs au premier abord :
//   * `families.interval` est bien exprimé en ANNÉES ;
//   * l'écart se mesure de date de mise en place à date de mise en place, pas de la fin
//     d'une culture au début de la suivante.

import { addDays, daysBetween, rangesOverlap } from './dates.js';
import type { DateRange, IsoDate } from './types.js';
import type { Occupation } from './beds.js';

/** Diviseur employé par Brinjel pour convertir l'écart en années. */
export const DAYS_PER_YEAR = 365;

export interface RotationConflict {
  locationId: number;
  familyId: number;
  /** Série déjà présente qui provoque le conflit. */
  previousPlantingId: number;
  /** Date de mise en place de cette série. */
  previousFieldDate: IsoDate;
  /** Écart entre les deux mises en place, en années. */
  intervalYears: number;
  /** Première date de mise en place qui respecterait le délai. */
  availableFrom: IsoDate;
}

/**
 * Vérifie qu'une série de la famille `familyId`, mise en place le `fieldDate` et
 * occupant la planche pendant `range`, respecte le délai de retour.
 * Les occupations passées comme futures sont examinées : placer une crucifère juste
 * avant une autre pose le même problème.
 */
export function checkRotation(
  locationId: number,
  familyId: number,
  fieldDate: IsoDate,
  range: DateRange,
  intervalYears: number,
  occupations: readonly Occupation[],
  ignorePlantingIds: readonly number[] = [],
): RotationConflict | null {
  if (intervalYears <= 0) return null;
  const ignored = new Set(ignorePlantingIds);

  let worst: RotationConflict | null = null;
  for (const occupation of occupations) {
    if (occupation.locationId !== locationId) continue;
    if (occupation.familyId !== familyId) continue;
    if (ignored.has(occupation.plantingId)) continue;
    if (!occupation.fieldDate) continue;
    // Deux séries qui se chevauchent au champ relèvent du conflit de place, pas de la
    // rotation : Brinjel les écarte explicitement.
    if (rangesOverlap(occupation.range, range)) continue;

    const gapYears = Math.abs(daysBetween(occupation.fieldDate, fieldDate)) / DAYS_PER_YEAR;
    if (gapYears >= intervalYears) continue;

    const conflict: RotationConflict = {
      locationId,
      familyId,
      previousPlantingId: occupation.plantingId,
      previousFieldDate: occupation.fieldDate,
      intervalYears: gapYears,
      availableFrom: addDays(occupation.fieldDate, Math.ceil(intervalYears * DAYS_PER_YEAR)),
    };
    if (!worst || conflict.intervalYears < worst.intervalYears) worst = conflict;
  }
  return worst;
}

/** Historique d'une planche, de la culture la plus récente à la plus ancienne. */
export function bedHistory(locationId: number, occupations: readonly Occupation[]): Occupation[] {
  return occupations
    .filter((occupation) => occupation.locationId === locationId)
    .sort((a, b) => b.range.begin.localeCompare(a.range.begin));
}
