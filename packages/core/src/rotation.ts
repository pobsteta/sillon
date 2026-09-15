// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rotation des cultures : une même famille botanique ne doit pas revenir sur une planche
// avant le délai propre à la famille (`families.interval`).
//
// Hypothèse de portage : `families.interval` est exprimé en ANNÉES (valeur usuelle en
// maraîchage : 3 à 5 ans pour les solanacées ou les crucifères). Le champ est marqué
// « à confirmer » dans le modèle de données ; seule cette constante est à changer si
// l'unité réelle est le mois.

import { addDays, daysBetween } from './dates.js';
import type { DateRange, IsoDate } from './types.js';
import type { Occupation } from './beds.js';

export const DAYS_PER_ROTATION_INTERVAL = 365;

export interface RotationConflict {
  locationId: number;
  familyId: number;
  /** Série déjà présente qui provoque le conflit. */
  previousPlantingId: number;
  /** Dernier jour où cette famille a occupé la planche. */
  lastSeenOn: IsoDate;
  /** Premier jour où la famille pourrait revenir. */
  availableFrom: IsoDate;
  /** Nombre de jours manquants pour respecter le délai. */
  missingDays: number;
}

/**
 * Vérifie qu'une série de la famille `familyId`, occupant la planche pendant `range`,
 * respecte le délai de retour. Les occupations passées ET futures sont examinées :
 * planter une crucifère juste avant une autre pose le même problème.
 */
export function checkRotation(
  locationId: number,
  familyId: number,
  range: DateRange,
  intervalYears: number,
  occupations: readonly Occupation[],
  ignorePlantingIds: readonly number[] = [],
): RotationConflict | null {
  if (intervalYears <= 0) return null;
  const requiredDays = intervalYears * DAYS_PER_ROTATION_INTERVAL;
  const ignored = new Set(ignorePlantingIds);

  let worst: RotationConflict | null = null;
  for (const occupation of occupations) {
    if (occupation.locationId !== locationId) continue;
    if (occupation.familyId !== familyId) continue;
    if (ignored.has(occupation.plantingId)) continue;

    // Écart entre les deux cultures, dans l'ordre chronologique.
    const gap =
      occupation.range.end < range.begin
        ? daysBetween(occupation.range.end, range.begin)
        : range.end < occupation.range.begin
          ? daysBetween(range.end, occupation.range.begin)
          : 0;
    if (gap >= requiredDays) continue;

    const conflict: RotationConflict = {
      locationId,
      familyId,
      previousPlantingId: occupation.plantingId,
      lastSeenOn: occupation.range.end,
      availableFrom: addDays(occupation.range.end, requiredDays),
      missingDays: requiredDays - gap,
    };
    if (!worst || conflict.missingDays > worst.missingDays) worst = conflict;
  }
  return worst;
}

/** Historique d'une planche, de la culture la plus récente à la plus ancienne. */
export function bedHistory(locationId: number, occupations: readonly Occupation[]): Occupation[] {
  return occupations
    .filter((o) => o.locationId === locationId)
    .sort((a, b) => b.range.begin.localeCompare(a.range.begin));
}
