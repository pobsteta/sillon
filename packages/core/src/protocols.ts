// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Itinéraires techniques : une suite d'étapes positionnées par rapport aux dates de la
// série (« buttage 20 jours après la plantation »). Chaque tâche générée garde le lien
// vers son étape, ce qui permet de la recaler quand les dates de la série bougent.

import { addDays } from './dates.js';
import { anchorDateType } from './planting.js';
import {
  PlantingDateType,
  PlantingType,
  TaskDefaultType,
  type IsoDate,
  type PlantingDates,
} from './types.js';

/** Une étape d'itinéraire technique (`template_tasks`). */
export interface TemplateStep {
  id: number;
  typeId: number;
  methodId?: number | null;
  implementId?: number | null;
  daysInField: number;
  plannedLaborTime?: number | null;
  description?: string | null;
  /** Décalage en jours par rapport à la date de référence (négatif = avant). */
  linkDays: number;
  /** Date de la série servant de référence. */
  templateDateType: PlantingDateType;
}

/** Tâche prête à être insérée, avec la trace de l'étape qui l'a produite. */
export interface GeneratedTask {
  defaultType: TaskDefaultType;
  typeId: number | null;
  methodId: number | null;
  implementId: number | null;
  plannedDate: IsoDate;
  daysInField: number;
  plannedLaborTime: number | null;
  description: string | null;
  link: { templateTaskId: number; linkDays: number; templateDateType: PlantingDateType } | null;
}

/** Date prévue d'une étape : date de référence de la série + décalage. */
export function resolveStepDate(
  dates: PlantingDates,
  templateDateType: PlantingDateType,
  linkDays: number,
): IsoDate | null {
  const reference = dates[templateDateType];
  if (!reference) return null;
  return addDays(reference.effective ?? reference.planned, linkDays);
}

/**
 * Applique un itinéraire technique à une série.
 * Les étapes dont la date de référence n'existe pas sur la série (par exemple un semis
 * en pépinière pour une série en semis direct) sont ignorées silencieusement.
 */
export function generateTasksFromTemplate(
  steps: readonly TemplateStep[],
  dates: PlantingDates,
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  for (const step of steps) {
    const plannedDate = resolveStepDate(dates, step.templateDateType, step.linkDays);
    if (!plannedDate) continue;
    tasks.push({
      defaultType: TaskDefaultType.other,
      typeId: step.typeId,
      methodId: step.methodId ?? null,
      implementId: step.implementId ?? null,
      plannedDate,
      daysInField: step.daysInField,
      plannedLaborTime: step.plannedLaborTime ?? null,
      description: step.description ?? null,
      link: {
        templateTaskId: step.id,
        linkDays: step.linkDays,
        templateDateType: step.templateDateType,
      },
    });
  }
  return tasks.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

/**
 * Tâches de semis et de plantation déduites directement du plan de culture (§3.2 du brief),
 * sans itinéraire technique : une tâche de semis (pépinière ou direct) et, pour les séries
 * repiquées, une tâche de plantation.
 */
export function defaultTasksForPlanting(
  plantingType: PlantingType,
  dates: PlantingDates,
  typeIds: { sowing?: number | null; planting?: number | null } = {},
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const sowingDate = dates[anchorDateType(plantingType)];
  const transplanted = plantingType !== PlantingType.directSeed;

  if (sowingDate && plantingType !== PlantingType.transplantBought) {
    tasks.push({
      defaultType: TaskDefaultType.sowing,
      typeId: typeIds.sowing ?? null,
      methodId: null,
      implementId: null,
      plannedDate: sowingDate.effective ?? sowingDate.planned,
      daysInField: 0,
      plannedLaborTime: null,
      description: null,
      link: null,
    });
  }

  const plantingDate = dates[PlantingDateType.sowingPlanting];
  if (transplanted && plantingDate) {
    tasks.push({
      defaultType: TaskDefaultType.planting,
      typeId: typeIds.planting ?? null,
      methodId: null,
      implementId: null,
      plannedDate: plantingDate.effective ?? plantingDate.planned,
      daysInField: 0,
      plannedLaborTime: null,
      description: null,
      link: null,
    });
  }

  // Une série en semis direct n'a pas de plantation ; une série repiquée en a bien deux.
  return tasks;
}

/**
 * Recale une tâche générée après un changement de dates de la série.
 * Renvoie `null` si la date de référence a disparu : la tâche est alors laissée telle quelle
 * à l'appelant, qui décide de la supprimer ou de la détacher.
 */
export function rescheduleGeneratedTask(
  link: { linkDays: number; templateDateType: PlantingDateType },
  dates: PlantingDates,
): IsoDate | null {
  return resolveStepDate(dates, link.templateDateType, link.linkDays);
}
