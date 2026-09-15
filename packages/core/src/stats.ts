// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rendements, chiffre d'affaires escompté, temps de travail, état des tâches.
// Toutes les grandeurs restent entières : quantités dans l'unité de la série,
// montants en centimes, temps en minutes.

import { addDays, daysBetween } from './dates.js';
import { OverdueUnit, type IsoDate, type PlantingSpec } from './types.js';

const CM_PER_METER = 100;

/** Rendement escompté d'une série : rendement au mètre × longueur de planche. */
export function expectedYield(spec: Pick<PlantingSpec, 'length' | 'yieldPerBedMeter'>): number {
  if (!spec.yieldPerBedMeter || spec.length <= 0) return 0;
  return Math.round((spec.yieldPerBedMeter * spec.length) / CM_PER_METER);
}

/** Produit escompté d'une série, en centimes. */
export function expectedRevenue(
  spec: Pick<PlantingSpec, 'length' | 'yieldPerBedMeter' | 'pricePerUnit'>,
): number {
  if (!spec.pricePerUnit) return 0;
  return expectedYield(spec) * spec.pricePerUnit;
}

/** Rendement réalisé ramené au mètre de planche, comparable à `yieldPerBedMeter`. */
export function actualYieldPerBedMeter(totalQuantity: number, lengthCm: number): number {
  if (lengthCm <= 0) return 0;
  return Math.round((totalQuantity * CM_PER_METER) / lengthCm);
}

export interface YieldComparison {
  expected: number;
  actual: number;
  /** Écart réalisé − prévu, dans l'unité de la série. */
  difference: number;
  /** Écart en pourcentage du prévu ; `null` si rien n'était prévu. */
  differencePercentage: number | null;
}

export function compareYield(expected: number, actual: number): YieldComparison {
  return {
    expected,
    actual,
    difference: actual - expected,
    differencePercentage: expected > 0 ? Math.round(((actual - expected) / expected) * 100) : null,
  };
}

export const TaskStatus = {
  done: 'done',
  late: 'late',
  today: 'today',
  upcoming: 'upcoming',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Fenêtre au-delà de laquelle une tâche en retard n'est plus remontée (réglage ferme). */
export function overdueWindowDays(value: number, unit: OverdueUnit): number {
  switch (unit) {
    case OverdueUnit.day:
      return value;
    case OverdueUnit.week:
      return value * 7;
    case OverdueUnit.month:
      return value * 30;
    case OverdueUnit.year:
      return value * 365;
  }
}

/**
 * État d'une tâche du point de vue de la feuille de route hebdomadaire.
 * Une tâche non faite dont la date dépasse la fenêtre de retard de la ferme est
 * considérée comme abandonnée : elle n'est plus signalée en retard.
 */
export function taskStatus(
  task: { plannedDate: IsoDate; done: boolean },
  referenceDate: IsoDate,
  window: { value: number; unit: OverdueUnit } = { value: 1, unit: OverdueUnit.year },
): TaskStatus {
  if (task.done) return TaskStatus.done;
  if (task.plannedDate === referenceDate) return TaskStatus.today;
  if (task.plannedDate > referenceDate) return TaskStatus.upcoming;
  const limit = addDays(referenceDate, -overdueWindowDays(window.value, window.unit));
  return task.plannedDate >= limit ? TaskStatus.late : TaskStatus.upcoming;
}

/** Temps de travail agrégé, en minutes. */
export function totalLaborTime(
  entries: readonly { plannedLaborTime?: number | null; effectiveLaborTime?: number | null }[],
): { planned: number; effective: number } {
  let planned = 0;
  let effective = 0;
  for (const entry of entries) {
    planned += entry.plannedLaborTime ?? 0;
    effective += entry.effectiveLaborTime ?? 0;
  }
  return { planned, effective };
}

/** Formate des minutes en « 3 h 20 » / « 45 min ». */
export function formatLaborTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** Durée d'occupation d'une planche, en jours, bornes comprises. */
export function occupationDays(begin: IsoDate, end: IsoDate): number {
  return daysBetween(begin, end) + 1;
}
