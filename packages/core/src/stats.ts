// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (formules d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rendements, produit escompté, temps de travail, état des tâches.
//
// Rendement et produit suivent `Planting.estimated_yield/1` et `estimated_revenue/1`,
// qui multiplient simplement le rendement au mètre par la longueur. Ces valeurs sont
// lues en unités d'affichage chez Brinjel (mètres, unités) ; ici tout reste entier,
// la conversion est donc explicite.

import { addDays, daysBetween } from './dates.js';
import { OverdueUnit, type IsoDate, type PlantingSpec } from './types.js';
import { MM_PER_METER, SECONDS_PER_MINUTE } from './units.js';

/**
 * Rendement escompté, en millièmes d'unité : rendement au mètre × longueur en mètres.
 * `yieldPerBedMeter` est déjà en millièmes, `length` en millimètres.
 */
export function expectedYield(spec: Pick<PlantingSpec, 'length' | 'yieldPerBedMeter'>): number {
  if (!spec.yieldPerBedMeter || spec.length <= 0) return 0;
  return Math.round((spec.yieldPerBedMeter * spec.length) / MM_PER_METER);
}

/** Produit escompté, en centimes : rendement escompté × prix unitaire. */
export function expectedRevenue(
  spec: Pick<PlantingSpec, 'length' | 'yieldPerBedMeter' | 'pricePerUnit'>,
): number {
  if (!spec.pricePerUnit) return 0;
  // Le rendement est en millièmes d'unité : on revient à l'unité avant de multiplier
  // par un prix exprimé en centimes par unité.
  return Math.round((expectedYield(spec) * spec.pricePerUnit) / 1000);
}

/** Rendement réalisé ramené au mètre de planche, comparable à `yieldPerBedMeter`. */
export function actualYieldPerBedMeter(totalQuantity: number, lengthMm: number): number {
  if (lengthMm <= 0) return 0;
  return Math.round((totalQuantity * MM_PER_METER) / lengthMm);
}

export interface YieldComparison {
  expected: number;
  actual: number;
  /** Écart réalisé − prévu, en millièmes d'unité. */
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

/** Temps de travail agrégé, en secondes. */
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

/** Formate un temps de travail exprimé en secondes : « 3 h 20 », « 45 min », « 30 s ». */
export function formatLaborTime(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} s`;
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** Durée d'occupation d'une planche, en jours, bornes comprises. */
export function occupationDays(begin: IsoDate, end: IsoDate): number {
  return daysBetween(begin, end) + 1;
}
