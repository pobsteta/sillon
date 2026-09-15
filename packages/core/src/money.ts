// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les montants circulent en centimes (entiers) de bout en bout : aucun flottant
// ne doit approcher la base ni les totaux.

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

/** Longueur en centimètres → mètres, pour l'affichage uniquement. */
export function formatLength(cm: number, locale = 'fr'): string {
  return `${(cm / 100).toLocaleString(locale, { maximumFractionDigits: 2 })} m`;
}

/** « 12,5 » (mètres) → 1250 cm. Renvoie `null` si la saisie est illisible. */
export function parseLengthMeters(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
