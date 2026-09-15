// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Mise en forme localisée. La base stocke des entiers ; l'affichage seul convertit.

import {
  formatIsoWeek,
  formatLaborTime,
  formatLength,
  formatSeedMass,
  type IsoDate,
} from '@sillon/core';

export { formatIsoWeek, formatLaborTime, formatLength, formatSeedMass };

export function formatDate(date: IsoDate | null | undefined, locale: string): string {
  if (!date) return '—';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(date: IsoDate | null | undefined, locale: string): string {
  if (!date) return '—';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatMoney(cents: number | null | undefined, locale: string): string {
  if (cents === null || cents === undefined) return '—';
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}

export function formatNumber(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(locale);
}

/** Couleur de texte lisible sur un fond donné (contraste WCAG AA). */
export function readableTextColor(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#1f1d19';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  return luminance > 0.45 ? '#1f1d19' : '#ffffff';
}
