// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  TaskStatus,
  actualYieldPerBedMeter,
  compareYield,
  expectedRevenue,
  expectedYield,
  formatLaborTime,
  overdueWindowDays,
  taskStatus,
  totalLaborTime,
} from './stats.js';
import { OverdueUnit } from './types.js';

describe('rendements', () => {
  it('rapporte le rendement au mètre à la longueur de planche', () => {
    expect(expectedYield({ length: 3000, yieldPerBedMeter: 250 })).toBe(7500);
    expect(expectedYield({ length: 3000, yieldPerBedMeter: null })).toBe(0);
  });

  it('calcule le produit escompté en centimes', () => {
    expect(expectedRevenue({ length: 3000, yieldPerBedMeter: 250, pricePerUnit: 320 })).toBe(
      2_400_000,
    );
  });

  it('ramène le réalisé au mètre pour le comparer au prévu', () => {
    expect(actualYieldPerBedMeter(6000, 3000)).toBe(200);
    expect(actualYieldPerBedMeter(6000, 0)).toBe(0);
  });

  it('compare prévu et réalisé', () => {
    expect(compareYield(7500, 6000)).toEqual({
      expected: 7500,
      actual: 6000,
      difference: -1500,
      differencePercentage: -20,
    });
    expect(compareYield(0, 500).differencePercentage).toBeNull();
  });
});

describe('état des tâches', () => {
  const window = { value: 1, unit: OverdueUnit.month };

  it('distingue faite, du jour, à venir et en retard', () => {
    expect(taskStatus({ plannedDate: '2026-03-10', done: true }, '2026-03-15')).toBe(
      TaskStatus.done,
    );
    expect(taskStatus({ plannedDate: '2026-03-15', done: false }, '2026-03-15')).toBe(
      TaskStatus.today,
    );
    expect(taskStatus({ plannedDate: '2026-03-20', done: false }, '2026-03-15')).toBe(
      TaskStatus.upcoming,
    );
    expect(taskStatus({ plannedDate: '2026-03-10', done: false }, '2026-03-15', window)).toBe(
      TaskStatus.late,
    );
  });

  it('cesse de signaler les tâches oubliées au-delà de la fenêtre de la ferme', () => {
    expect(taskStatus({ plannedDate: '2026-01-05', done: false }, '2026-03-15', window)).toBe(
      TaskStatus.upcoming,
    );
  });

  it('convertit la fenêtre de retard en jours', () => {
    expect(overdueWindowDays(1, OverdueUnit.year)).toBe(365);
    expect(overdueWindowDays(2, OverdueUnit.week)).toBe(14);
  });
});

describe('temps de travail', () => {
  it('additionne prévu et réalisé en ignorant les valeurs absentes', () => {
    expect(
      totalLaborTime([
        { plannedLaborTime: 90, effectiveLaborTime: 120 },
        { plannedLaborTime: null, effectiveLaborTime: 30 },
        {},
      ]),
    ).toEqual({ planned: 90, effective: 150 });
  });

  it('formate les minutes en heures', () => {
    expect(formatLaborTime(45)).toBe('45 min');
    expect(formatLaborTime(120)).toBe('2 h');
    expect(formatLaborTime(200)).toBe('3 h 20');
  });
});
