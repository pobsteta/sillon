// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Arithmétique de dates civiles. Tout est manipulé en `YYYY-MM-DD` et calculé en UTC :
// une date de semis ne doit jamais glisser d'un jour selon le fuseau du navigateur.

import type { DateRange, IsoDate } from './types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  return toIsoDate(parseIsoDate(value)) === value;
}

/** Convertit `YYYY-MM-DD` en `Date` UTC à minuit. Lève si la chaîne est invalide. */
export function parseIsoDate(value: IsoDate): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new TypeError(`Date ISO invalide : ${value}`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(date).getTime() + days * MS_PER_DAY));
}

/** Nombre de jours de `from` à `to` (négatif si `to` précède `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Deux intervalles inclusifs se chevauchent-ils ? */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.begin <= b.end && b.begin <= a.end;
}

/** Nombre de jours communs à deux intervalles inclusifs (0 s'ils sont disjoints). */
export function overlapDays(a: DateRange, b: DateRange): number {
  if (!rangesOverlap(a, b)) return 0;
  return daysBetween(maxDate(a.begin, b.begin), minDate(a.end, b.end)) + 1;
}

export interface IsoWeek {
  year: number;
  week: number;
}

/** Semaine ISO 8601 (la semaine 1 est celle qui contient le premier jeudi de janvier). */
export function isoWeekOf(date: IsoDate): IsoWeek {
  const d = parseIsoDate(date);
  // Décale au jeudi de la semaine courante : son année est l'année ISO.
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return { year: isoYear, week };
}

/** Lundi de la semaine ISO demandée. */
export function isoWeekStart(year: number, week: number): IsoDate {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4.getTime() - day * MS_PER_DAY + (week - 1) * 7 * MS_PER_DAY);
  return toIsoDate(monday);
}

/** Lundi → dimanche de la semaine contenant `date`. */
export function weekRange(date: IsoDate): DateRange {
  const { year, week } = isoWeekOf(date);
  const begin = isoWeekStart(year, week);
  return { begin, end: addDays(begin, 6) };
}

export function formatIsoWeek(date: IsoDate): string {
  const { week } = isoWeekOf(date);
  return `S${String(week).padStart(2, '0')}`;
}

/**
 * Saisie souple des dates, comme dans Brinjel : « 2026-03-15 », « 15/03/2026 »,
 * « 15/03 » (année de référence) ou « S12 » / « S12 2027 » (lundi de la semaine ISO).
 * Renvoie `null` si rien n'est reconnu, à charge de l'appelant d'afficher l'erreur.
 */
export function parseDateInput(input: string, referenceYear: number): IsoDate | null {
  const raw = input.trim();
  if (raw === '') return null;

  if (ISO_DATE.test(raw)) return isIsoDate(raw) ? raw : null;

  const week = /^[SsWw]\s*(\d{1,2})(?:\s+(\d{4}))?$/.exec(raw);
  if (week) {
    const weekNumber = Number(week[1]);
    if (weekNumber < 1 || weekNumber > 53) return null;
    return isoWeekStart(week[2] ? Number(week[2]) : referenceYear, weekNumber);
  }

  const slashed = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(raw);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    let year = referenceYear;
    if (slashed[3]) year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
    const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`;
    return isIsoDate(candidate) ? candidate : null;
  }

  return null;
}
