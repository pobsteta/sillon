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
  // 30 m de planche (30 000 mm), 2,5 kg au mètre (2500 millièmes d'unité).
  it('rapporte le rendement au mètre à la longueur de planche', () => {
    // 2500 millièmes × 30 m = 75 000 millièmes, soit 75 unités.
    expect(expectedYield({ length: 30_000, yieldPerBedMeter: 2_500 })).toBe(75_000);
    expect(expectedYield({ length: 30_000, yieldPerBedMeter: null })).toBe(0);
  });

  it('calcule le produit escompté en centimes', () => {
    // 75 unités × 3,20 € = 240 €, soit 24 000 centimes.
    expect(expectedRevenue({ length: 30_000, yieldPerBedMeter: 2_500, pricePerUnit: 320 })).toBe(
      24_000,
    );
  });

  it('ramène le réalisé au mètre pour le comparer au prévu', () => {
    // 60 unités récoltées sur 30 m : 2 unités au mètre, en millièmes.
    expect(actualYieldPerBedMeter(60_000, 30_000)).toBe(2_000);
    expect(actualYieldPerBedMeter(60_000, 0)).toBe(0);
  });

  it('compare prévu et réalisé', () => {
    expect(compareYield(75_000, 60_000)).toEqual({
      expected: 75_000,
      actual: 60_000,
      difference: -15_000,
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
        { plannedLaborTime: 5400, effectiveLaborTime: 7200 },
        { plannedLaborTime: null, effectiveLaborTime: 1800 },
        {},
      ]),
    ).toEqual({ planned: 5400, effective: 9000 });
  });

  it('formate les secondes en minutes et en heures', () => {
    expect(formatLaborTime(30)).toBe('30 s');
    expect(formatLaborTime(2700)).toBe('45 min');
    expect(formatLaborTime(7200)).toBe('2 h');
    expect(formatLaborTime(12_000)).toBe('3 h 20');
  });
});
