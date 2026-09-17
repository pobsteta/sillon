// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assolement : occupation des planches dans le temps et recherche des emplacements
// disponibles. Une série peut être répartie sur plusieurs planches
// (`location_assignments.length`), une planche peut porter plusieurs séries tant que
// les longueurs cumulées tiennent sur la période considérée.

import { overlapDays, rangesOverlap } from './dates.js';
import type { DateRange, IsoDate } from './types.js';

/** Une planche (feuille de l'arbre `locations`). */
export interface Bed {
  id: number;
  name: string;
  /** Longueur utile, en millimètres. */
  bedLength: number;
  bedWidth?: number | null;
  greenhouse: boolean;
}

/** Une série posée sur une planche, avec la période pendant laquelle elle l'occupe. */
export interface Occupation {
  plantingId: number;
  locationId: number;
  /** Longueur occupée sur cette planche, en millimètres. */
  length: number;
  range: DateRange;
  /** Famille botanique de la série, pour le contrôle des rotations. */
  familyId?: number | null;
  /** Date de mise en place au champ : c'est elle que compare le délai de retour. */
  fieldDate?: IsoDate | null;
}

/**
 * Longueur maximale occupée simultanément sur une planche pendant `range`.
 * On balaie les bornes des occupations qui chevauchent la période : le maximum d'une
 * somme d'intervalles est atteint sur l'une de leurs bornes de début.
 */
export function peakOccupiedLength(
  occupations: readonly Occupation[],
  range: DateRange,
  ignorePlantingIds: readonly number[] = [],
): number {
  const ignored = new Set(ignorePlantingIds);
  const relevant = occupations.filter(
    (o) => !ignored.has(o.plantingId) && rangesOverlap(o.range, range),
  );
  if (relevant.length === 0) return 0;

  const boundaries = new Set<IsoDate>([range.begin]);
  for (const o of relevant) if (o.range.begin >= range.begin) boundaries.add(o.range.begin);

  let peak = 0;
  for (const date of boundaries) {
    let total = 0;
    for (const o of relevant) if (o.range.begin <= date && date <= o.range.end) total += o.length;
    if (total > peak) peak = total;
  }
  return peak;
}

/** Longueur encore libre sur une planche pendant toute la période demandée. */
export function availableLength(
  bed: Bed,
  occupations: readonly Occupation[],
  range: DateRange,
  ignorePlantingIds: readonly number[] = [],
): number {
  return Math.max(0, bed.bedLength - peakOccupiedLength(occupations, range, ignorePlantingIds));
}

export interface BedAvailability {
  bed: Bed;
  availableLength: number;
  fits: boolean;
}

/**
 * Filtre « emplacements disponibles » du brief (§3.3) : les planches où la série tient,
 * de la plus disponible à la moins disponible.
 */
export function findAvailableBeds(
  beds: readonly Bed[],
  occupationsByBed: ReadonlyMap<number, readonly Occupation[]>,
  requiredLength: number,
  range: DateRange,
  options: { greenhouse?: boolean | null; ignorePlantingIds?: readonly number[] } = {},
): BedAvailability[] {
  const ignore = options.ignorePlantingIds ?? [];
  return beds
    .filter((bed) => options.greenhouse == null || bed.greenhouse === options.greenhouse)
    .map((bed) => {
      const free = availableLength(bed, occupationsByBed.get(bed.id) ?? [], range, ignore);
      return { bed, availableLength: free, fits: free >= requiredLength };
    })
    .sort((a, b) => b.availableLength - a.availableLength || a.bed.name.localeCompare(b.bed.name));
}

/**
 * Répartit une longueur de série sur les planches proposées, dans l'ordre donné,
 * sans dépasser la place libre de chacune. Le reste non placé est renvoyé.
 */
export function distributeOverBeds(
  requiredLength: number,
  candidates: readonly BedAvailability[],
): { assignments: { locationId: number; length: number }[]; remaining: number } {
  const assignments: { locationId: number; length: number }[] = [];
  let remaining = requiredLength;
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, candidate.availableLength);
    if (take <= 0) continue;
    assignments.push({ locationId: candidate.bed.id, length: take });
    remaining -= take;
  }
  return { assignments, remaining };
}

/** Taux d'occupation d'une planche sur une période, en pourcentage (arrondi). */
export function occupancyRate(
  bed: Bed,
  occupations: readonly Occupation[],
  range: DateRange,
): number {
  if (bed.bedLength <= 0) return 0;
  const totalDays = overlapDays(range, range);
  if (totalDays <= 0) return 0;
  let cmDays = 0;
  for (const occupation of occupations) {
    cmDays += occupation.length * overlapDays(occupation.range, range);
  }
  return Math.round((cmDays / (bed.bedLength * totalDays)) * 100);
}

/** Une série occupe une longueur donnée sur une planche donnée. */
export interface BedAssignment {
  locationId: number;
  length: number;
}

/**
 * Placement d'une série entière sur une seule planche : le geste de l'assolement, qu'on
 * l'ait fait glisser au bureau ou désignée au doigt. La longueur est bornée par la planche
 * — déposer une série de 40 m sur une planche de 30 m en place 30, et le reste attend une
 * autre planche plutôt que d'être perdu de vue.
 *
 * Le placement **remplace** ce que la série occupait ailleurs : c'est ce que dit le geste,
 * et c'est déjà ce que fait le bouton « Placer » de la fiche de série.
 */
export function placeWholeOnBed(
  target: Bed,
  requiredLength: number,
): { assignments: BedAssignment[]; remaining: number } {
  const length = Math.max(0, Math.min(requiredLength, target.bedLength));
  return {
    assignments: length > 0 ? [{ locationId: target.id, length }] : [],
    remaining: Math.max(0, requiredLength - length),
  };
}

/**
 * Déplacement d'un tronçon d'une planche à une autre, une série pouvant être répartie sur
 * plusieurs. Seul le tronçon saisi bouge ; les autres restent où ils sont.
 *
 * Deux cas méritent d'être nommés :
 *   * la planche d'arrivée porte déjà un tronçon de la même série — les deux fusionnent,
 *     sans quoi on obtiendrait deux barres accolées pour une seule culture ;
 *   * la planche d'arrivée est plus courte que le tronçon — la longueur est rabotée, et
 *     ce qui dépasse est signalé au lieu d'être placé en douce.
 */
export function moveAssignment(
  current: readonly BedAssignment[],
  sourceLocationId: number,
  target: Bed,
): { assignments: BedAssignment[]; remaining: number } {
  const deplace = current.find((assignment) => assignment.locationId === sourceLocationId);
  if (!deplace || sourceLocationId === target.id) {
    return { assignments: [...current], remaining: 0 };
  }

  const autres = current.filter((assignment) => assignment.locationId !== sourceLocationId);
  const dejaSurCible = autres.find((assignment) => assignment.locationId === target.id);
  const voulu = (dejaSurCible?.length ?? 0) + deplace.length;
  const tenu = Math.max(0, Math.min(voulu, target.bedLength));

  const assignments = autres.filter((assignment) => assignment.locationId !== target.id);
  if (tenu > 0) assignments.push({ locationId: target.id, length: tenu });

  return { assignments, remaining: voulu - tenu };
}
