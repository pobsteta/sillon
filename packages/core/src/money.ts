// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les montants circulent en centimes (entiers) de bout en bout, comme le type `Money`
// de Brinjel : aucun flottant ne doit approcher la base ni les totaux.
// Les longueurs suivent la même règle, en millimètres (voir `units.ts`).

import {
  MM_PER_METER,
  centimetersToTenthsOfMillimeter,
  metersToMillimeters,
  parseDecimal,
  tenthsOfMillimeterToCentimeters,
} from './units.js';

/** « 12,34 » ou « 12.34 » → 1234 centimes. Renvoie `null` si la saisie est illisible. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ''] = normalized.split('.');
  const sign = normalized.startsWith('-') ? -1 : 1;
  const cents = Number(decimals.padEnd(2, '0'));
  return sign * (Math.abs(Number(whole)) * 100 + cents);
}

export function formatAmount(cents: number, locale = 'fr', currency = 'EUR'): string {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency });
}

/** Longueur en millimètres → mètres, pour l'affichage uniquement. */
export function formatLength(millimeters: number, locale = 'fr'): string {
  return `${(millimeters / MM_PER_METER).toLocaleString(locale, { maximumFractionDigits: 3 })} m`;
}

/** « 12,5 » (mètres) → 12500 mm. Renvoie `null` si la saisie est illisible. */
export function parseLengthMeters(input: string): number | null {
  const meters = parseDecimal(input);
  return meters === null ? null : metersToMillimeters(meters);
}

/** Espacement en dixièmes de millimètre → centimètres, pour l'affichage. */
export function formatSpacing(tenthsOfMillimeter: number, locale = 'fr'): string {
  return `${tenthsOfMillimeterToCentimeters(tenthsOfMillimeter).toLocaleString(locale, {
    maximumFractionDigits: 2,
  })} cm`;
}

/** « 4,5 » (centimètres) → 450 dixièmes de millimètre. */
export function parseSpacingCentimeters(input: string): number | null {
  const centimeters = parseDecimal(input);
  return centimeters === null ? null : centimetersToTenthsOfMillimeter(centimeters);
}
