// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (unités d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Unités de stockage, reprises telles quelles de Brinjel (`lib/brinjel/ecto_types/`).
// Elles sont plus fines que l'affichage : une planche se saisit en mètres mais se stocke
// au millimètre, un espacement se saisit en centimètres mais se stocke au dixième de
// millimètre. C'est ce qui permet de reprendre des données Brinjel ou Qrop sans arrondi.
//
// Règle : la base et les calculs ne manipulent QUE des entiers dans ces unités ;
// la conversion n'a lieu qu'aux bords, à la saisie et à l'affichage.

/** Longueurs de planche (`BedLength`) : millimètres entiers. */
export const MM_PER_METER = 1000;
/** Espacements (`Distance`) : dixièmes de millimètre entiers. */
export const TENTHS_MM_PER_CM = 100;
/** Rendements et quantités récoltées (`Yield`) : millièmes d'unité. */
export const THOUSANDTHS_PER_UNIT = 1000;
/** Densité de semences (`SeedsPerGram`) : stockée en graines par kilogramme. */
export const SEEDS_PER_GRAM_FACTOR = 1000;
/** Temps de travail : secondes. */
export const SECONDS_PER_MINUTE = 60;

// ─────────────────────────── Longueurs ───────────────────────────

export function metersToMillimeters(meters: number): number {
  return Math.round(meters * MM_PER_METER);
}

export function millimetersToMeters(millimeters: number): number {
  return millimeters / MM_PER_METER;
}

/** Espacement saisi en centimètres → dixièmes de millimètre. */
export function centimetersToTenthsOfMillimeter(centimeters: number): number {
  return Math.round(centimeters * TENTHS_MM_PER_CM);
}

export function tenthsOfMillimeterToCentimeters(tenths: number): number {
  return tenths / TENTHS_MM_PER_CM;
}

// ─────────────────────────── Rendements ───────────────────────────

export function unitsToThousandths(units: number): number {
  return Math.round(units * THOUSANDTHS_PER_UNIT);
}

export function thousandthsToUnits(thousandths: number): number {
  return thousandths / THOUSANDTHS_PER_UNIT;
}

// ─────────────────────────── Semences ───────────────────────────

export function seedsPerGramToStorage(seedsPerGram: number): number {
  return Math.round(seedsPerGram * SEEDS_PER_GRAM_FACTOR);
}

export function storageToSeedsPerGram(seedsPerKilogram: number): number {
  return seedsPerKilogram / SEEDS_PER_GRAM_FACTOR;
}

// ─────────────────────────── Temps de travail ───────────────────────────

export function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * SECONDS_PER_MINUTE);
}

export function secondsToMinutes(seconds: number): number {
  return seconds / SECONDS_PER_MINUTE;
}

/**
 * Saisie souple d'une mesure décimale : « 12,5 » comme « 12.5 ».
 * Renvoie `null` si la chaîne n'est pas un nombre positif, à charge de l'appelant
 * d'afficher l'erreur.
 */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
