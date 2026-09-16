// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Itinéraires techniques : une suite d'étapes positionnées par rapport à une date de la
// série (« buttage 20 jours après la plantation »). Chaque tâche engendrée garde le lien
// vers son étape, ce qui permet de la recaler quand les dates de la série bougent.
//
// Les quatre dates de référence sont celles de `TemplateTask.@template_date_types` ;
// deux d'entre elles — première et dernière récolte — se lisent dans les périodes de
// récolte et non dans les dates de la série.

import { addDays } from './dates.js';
import { fieldDate, usesNursery } from './planting.js';
import {
  PlantingDateType,
  PlantingType,
  TaskDefaultType,
  TemplateDateType,
  type HarvestPeriod,
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
  /** Temps prévu, en secondes. */
  plannedLaborTime?: number | null;
  description?: string | null;
  /** Décalage en jours par rapport à la date de référence (négatif = avant). */
  linkDays: number;
  templateDateType: TemplateDateType;
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
  link: { templateTaskId: number; linkDays: number; templateDateType: TemplateDateType } | null;
}

/** Contexte temporel d'une série : ses dates et ses fenêtres de récolte. */
export interface PlantingSchedule {
  plantingType: PlantingType;
  dates: PlantingDates;
  harvestPeriods: readonly HarvestPeriod[];
}

function sortedPeriods(periods: readonly HarvestPeriod[]): HarvestPeriod[] {
  return [...periods].sort((a, b) => a.begin.localeCompare(b.begin));
}

/** Date désignée par un type de référence d'itinéraire, si la série la possède. */
export function referenceDate(schedule: PlantingSchedule, type: TemplateDateType): IsoDate | null {
  switch (type) {
    case TemplateDateType.fieldSowingPlanting:
      return fieldDate(schedule.dates, schedule.plantingType);
    case TemplateDateType.greenhouseSowing: {
      if (!usesNursery(schedule.plantingType) && schedule.plantingType !== PlantingType.seedling) {
        return null;
      }
      const sowing = schedule.dates[PlantingDateType.sowing];
      return sowing ? (sowing.effective ?? sowing.planned) : null;
    }
    case TemplateDateType.firstHarvest: {
      const [first] = sortedPeriods(schedule.harvestPeriods);
      return first ? first.begin : null;
    }
    case TemplateDateType.lastHarvest: {
      const periods = sortedPeriods(schedule.harvestPeriods);
      const last = periods[periods.length - 1];
      return last ? last.end : null;
    }
  }
}

/** Date prévue d'une étape : date de référence de la série + décalage. */
export function resolveStepDate(
  schedule: PlantingSchedule,
  templateDateType: TemplateDateType,
  linkDays: number,
): IsoDate | null {
  const reference = referenceDate(schedule, templateDateType);
  return reference === null ? null : addDays(reference, linkDays);
}

/**
 * Applique un itinéraire technique à une série.
 * Les étapes dont la date de référence n'existe pas sur la série — un semis en pépinière
 * pour une série en semis direct, une récolte pour une série sans durée de maturité —
 * sont ignorées silencieusement.
 */
export function generateTasksFromTemplate(
  steps: readonly TemplateStep[],
  schedule: PlantingSchedule,
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  for (const step of steps) {
    const plannedDate = resolveStepDate(schedule, step.templateDateType, step.linkDays);
    if (!plannedDate) continue;
    tasks.push({
      defaultType: TaskDefaultType.custom,
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

/** Nature de la tâche de mise en place au champ (`field_task_type`). */
export function fieldTaskType(plantingType: PlantingType): TaskDefaultType | null {
  switch (plantingType) {
    case PlantingType.directSeeded:
      return TaskDefaultType.directSow;
    case PlantingType.transplantRaised:
    case PlantingType.transplantBought:
      return TaskDefaultType.transplant;
    case PlantingType.seedling:
      return null;
  }
}

/** Nature de la tâche de semis en pépinière (`nursery_sowing_task_type`). */
export function nurserySowingTaskType(plantingType: PlantingType): TaskDefaultType | null {
  switch (plantingType) {
    case PlantingType.transplantRaised:
    case PlantingType.seedling:
      return TaskDefaultType.greenhouseSow;
    case PlantingType.directSeeded:
    case PlantingType.transplantBought:
      return null;
  }
}

/**
 * Tâches déduites du plan de culture, sans itinéraire technique : le semis en pépinière
 * puis la mise en place au champ, chacun selon le mode d'implantation. Un plant acheté
 * n'a pas de semis ; une production de plants n'a pas de mise en place.
 */
export function defaultTasksForPlanting(
  schedule: PlantingSchedule,
  typeIds: {
    greenhouseSow?: number | null;
    directSow?: number | null;
    transplant?: number | null;
  } = {},
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const base = {
    methodId: null,
    implementId: null,
    daysInField: 0,
    plannedLaborTime: null,
    description: null,
    link: null,
  };

  const nurseryType = nurserySowingTaskType(schedule.plantingType);
  const sowing = schedule.dates[PlantingDateType.sowing];
  if (nurseryType && sowing) {
    tasks.push({
      ...base,
      defaultType: nurseryType,
      typeId: typeIds.greenhouseSow ?? null,
      plannedDate: sowing.effective ?? sowing.planned,
    });
  }

  const inFieldType = fieldTaskType(schedule.plantingType);
  const inFieldDate = fieldDate(schedule.dates, schedule.plantingType);
  if (inFieldType && inFieldDate) {
    tasks.push({
      ...base,
      defaultType: inFieldType,
      typeId:
        inFieldType === TaskDefaultType.directSow
          ? (typeIds.directSow ?? null)
          : (typeIds.transplant ?? null),
      plannedDate: inFieldDate,
    });
  }

  return tasks;
}

/**
 * Recale une tâche engendrée après un changement de dates de la série.
 * Renvoie `null` si la date de référence a disparu : la tâche est alors laissée telle
 * quelle à l'appelant, qui décide de la supprimer ou de la détacher.
 */
export function rescheduleGeneratedTask(
  link: { linkDays: number; templateDateType: TemplateDateType },
  schedule: PlantingSchedule,
): IsoDate | null {
  return resolveStepDate(schedule, link.templateDateType, link.linkDays);
}
