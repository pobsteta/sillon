// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Recalage des tâches engendrées quand les dates d'une série bougent.
//
// Ce code vivait dans la route `reschedule-tasks`, qui ne traite qu'une série. Il est
// remonté ici parce que le traitement par lot en a besoin aussi : décaler tout un
// printemps d'une semaine et laisser la feuille de tâches aux anciennes dates, c'est
// afficher deux vérités contradictoires à la même personne.

import { rescheduleGeneratedTask, type PlantingSchedule, type PlantingType } from '@sillon/core';
import { datesFromRows, harvestPeriodsFromRows, toDbDate } from './planting-io.js';
import type { Tx } from './db.js';

/** Série telle qu'on la lit en base pour en déduire son calendrier. */
export interface SerieDatee {
  id: number;
  plantingType: string;
  dates: { type: string; planned: Date; effective: Date | null }[];
  harvestPeriods: { begin: Date; end: Date }[];
}

export function scheduleOf(planting: Omit<SerieDatee, 'id'>): PlantingSchedule {
  return {
    plantingType: planting.plantingType as PlantingType,
    dates: datesFromRows(planting.dates),
    harvestPeriods: harvestPeriodsFromRows(planting.harvestPeriods),
  };
}

/**
 * Remet les tâches engendrées d'une série en face de ses dates, et rend le nombre de
 * tâches déplacées.
 *
 * Seules les tâches **non faites** bougent. Le travail réalisé est un fait : il s'est passé
 * le jour où il s'est passé, et repousser le plan ne le déplace pas dans le passé.
 *
 * Une tâche née d'un itinéraire technique suit son étape, décalage compris ; une tâche née
 * du plan de culture suit le semis ou la mise en place, selon sa nature. Une tâche ajoutée
 * à la main ne bouge pas : personne ne lui a donné de règle à suivre.
 */
export async function recalerTaches(db: Tx, planting: SerieDatee): Promise<number> {
  const schedule = scheduleOf(planting);

  const liens = await db.plantingTask.findMany({
    where: { plantingId: planting.id, task: { done: false } },
    include: { task: { include: { templateLink: true } } },
  });

  let recalees = 0;
  for (const lien of liens) {
    const templateLink = lien.task.templateLink;
    const plannedDate = templateLink
      ? rescheduleGeneratedTask(
          {
            linkDays: templateLink.linkDays,
            templateDateType: templateLink.templateDateType as never,
          },
          schedule,
        )
      : lien.task.defaultType === 'greenhouse_sow' || lien.task.defaultType === 'direct_sow'
        ? (schedule.dates.sowing?.planned ?? null)
        : lien.task.defaultType === 'transplant'
          ? (schedule.dates.planting?.planned ?? null)
          : null;
    if (!plannedDate) continue;

    await db.task.update({
      where: { id: lien.taskId },
      data: { plannedDate: toDbDate(plannedDate), effectiveDate: toDbDate(plannedDate) },
    });
    recalees += 1;
  }
  return recalees;
}

/** Même chose pour plusieurs séries. Rend le total des tâches déplacées. */
export async function recalerPlusieursSeries(
  db: Tx,
  plantings: readonly SerieDatee[],
): Promise<number> {
  let total = 0;
  for (const planting of plantings) total += await recalerTaches(db, planting);
  return total;
}
