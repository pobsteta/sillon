// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatIsoWeek,
  isoWeekOf,
  isoWeekStart,
  overlapDays,
  parseDateInput,
  rangesOverlap,
  weekRange,
} from './dates.js';

describe('arithmétique de dates', () => {
  it('ajoute des jours en franchissant les mois et les années bissextiles', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2024-02-27', 3)).toBe('2024-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-03-15', '2026-05-14')).toBe(60);
    expect(daysBetween('2026-05-14', '2026-03-15')).toBe(-60);
  });

  it('ne glisse pas d’un jour quel que soit le fuseau', () => {
    // Un `new Date('2026-03-15')` local suivi d'un toISOString() décale à l'ouest de Greenwich.
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15');
  });
});

describe('semaines ISO', () => {
  it('numérote la semaine du premier jeudi comme semaine 1', () => {
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2026-12-31')).toEqual({ year: 2026, week: 53 });
  });

  it('retrouve le lundi d’une semaine', () => {
    expect(isoWeekStart(2026, 12)).toBe('2026-03-16');
    expect(weekRange('2026-03-18')).toEqual({ begin: '2026-03-16', end: '2026-03-22' });
  });

  it('formate la semaine sur deux chiffres', () => {
    expect(formatIsoWeek('2026-03-18')).toBe('S12');
  });
});

describe('saisie souple des dates', () => {
  it('accepte l’ISO, le jour/mois et le numéro de semaine', () => {
    expect(parseDateInput('2026-03-15', 2026)).toBe('2026-03-15');
    expect(parseDateInput('15/03', 2026)).toBe('2026-03-15');
    expect(parseDateInput('15/03/2027', 2026)).toBe('2027-03-15');
    expect(parseDateInput('15/03/27', 2026)).toBe('2027-03-15');
    expect(parseDateInput('S12', 2026)).toBe('2026-03-16');
    expect(parseDateInput('s12 2027', 2026)).toBe('2027-03-22');
  });

  it('refuse les dates impossibles et les saisies vides', () => {
    expect(parseDateInput('31/02', 2026)).toBeNull();
    expect(parseDateInput('2026-02-30', 2026)).toBeNull();
    expect(parseDateInput('S54', 2026)).toBeNull();
    expect(parseDateInput('   ', 2026)).toBeNull();
  });
});

describe('intervalles', () => {
  const mars = { begin: '2026-03-01', end: '2026-03-31' };

  it('détecte les chevauchements bornes comprises', () => {
    expect(rangesOverlap(mars, { begin: '2026-03-31', end: '2026-04-10' })).toBe(true);
    expect(rangesOverlap(mars, { begin: '2026-04-01', end: '2026-04-10' })).toBe(false);
  });

  it('compte les jours communs', () => {
    expect(overlapDays(mars, { begin: '2026-03-25', end: '2026-04-05' })).toBe(7);
    expect(overlapDays(mars, { begin: '2026-04-01', end: '2026-04-05' })).toBe(0);
  });
});
