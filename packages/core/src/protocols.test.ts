// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  defaultTasksForPlanting,
  fieldTaskType,
  generateTasksFromTemplate,
  nurserySowingTaskType,
  referenceDate,
  rescheduleGeneratedTask,
  type PlantingSchedule,
  type TemplateStep,
} from './protocols.js';
import { PlantingType, TaskDefaultType, TemplateDateType } from './types.js';

const schedule: PlantingSchedule = {
  plantingType: PlantingType.transplantRaised,
  dates: {
    sowing: { planned: '2026-03-01' },
    planting: { planned: '2026-04-05' },
  },
  harvestPeriods: [{ begin: '2026-06-04', end: '2026-07-19' }],
};

const steps: TemplateStep[] = [
  {
    id: 1,
    typeId: 10,
    daysInField: 0,
    linkDays: -7,
    templateDateType: TemplateDateType.fieldSowingPlanting,
    description: 'Préparation du sol',
  },
  {
    id: 2,
    typeId: 11,
    methodId: 20,
    implementId: 30,
    daysInField: 1,
    plannedLaborTime: 5400, // 1 h 30, en secondes
    linkDays: 20,
    templateDateType: TemplateDateType.fieldSowingPlanting,
    description: 'Désherbage',
  },
  {
    id: 3,
    typeId: 12,
    daysInField: 0,
    linkDays: -3,
    templateDateType: TemplateDateType.firstHarvest,
    description: 'Irrigation avant récolte',
  },
];

describe('dates de référence', () => {
  it('résout les quatre types de référence de Brinjel', () => {
    expect(referenceDate(schedule, TemplateDateType.fieldSowingPlanting)).toBe('2026-04-05');
    expect(referenceDate(schedule, TemplateDateType.greenhouseSowing)).toBe('2026-03-01');
    expect(referenceDate(schedule, TemplateDateType.firstHarvest)).toBe('2026-06-04');
    expect(referenceDate(schedule, TemplateDateType.lastHarvest)).toBe('2026-07-19');
  });

  it('n’a pas de semis en pépinière pour un semis direct', () => {
    const direct = { ...schedule, plantingType: PlantingType.directSeeded };
    expect(referenceDate(direct, TemplateDateType.greenhouseSowing)).toBeNull();
    expect(referenceDate(direct, TemplateDateType.fieldSowingPlanting)).toBe('2026-03-01');
  });

  it('n’a pas de récolte quand la série n’a pas de fenêtre', () => {
    expect(
      referenceDate({ ...schedule, harvestPeriods: [] }, TemplateDateType.firstHarvest),
    ).toBeNull();
  });
});

describe('itinéraires techniques', () => {
  it('place chaque étape par rapport à sa date de référence, dans l’ordre', () => {
    const tasks = generateTasksFromTemplate(steps, schedule);
    expect(tasks.map((t) => t.plannedDate)).toEqual(['2026-03-29', '2026-04-25', '2026-06-01']);
    expect(tasks[1]?.plannedLaborTime).toBe(5400);
    expect(tasks[1]?.defaultType).toBe(TaskDefaultType.custom);
    expect(tasks[1]?.link).toEqual({
      templateTaskId: 2,
      linkDays: 20,
      templateDateType: TemplateDateType.fieldSowingPlanting,
    });
  });

  it('ignore les étapes dont la date de référence manque sur la série', () => {
    const tasks = generateTasksFromTemplate(steps, { ...schedule, harvestPeriods: [] });
    expect(tasks).toHaveLength(2);
  });

  it('recale une tâche engendrée quand la série est décalée', () => {
    const link = { linkDays: 20, templateDateType: TemplateDateType.fieldSowingPlanting };
    expect(
      rescheduleGeneratedTask(link, {
        ...schedule,
        dates: { planting: { planned: '2026-04-12' } },
      }),
    ).toBe('2026-05-02');
    expect(rescheduleGeneratedTask(link, { ...schedule, dates: {} })).toBeNull();
  });

  it('suit la date réalisée dès qu’elle est saisie', () => {
    const tasks = generateTasksFromTemplate([steps[1]!], {
      ...schedule,
      dates: { planting: { planned: '2026-04-05', effective: '2026-04-10' } },
    });
    expect(tasks[0]?.plannedDate).toBe('2026-04-30');
  });
});

describe('tâches déduites du plan de culture', () => {
  it('distingue semis en pépinière, semis direct et plantation', () => {
    expect(nurserySowingTaskType(PlantingType.transplantRaised)).toBe(
      TaskDefaultType.greenhouseSow,
    );
    expect(nurserySowingTaskType(PlantingType.directSeeded)).toBeNull();
    expect(fieldTaskType(PlantingType.directSeeded)).toBe(TaskDefaultType.directSow);
    expect(fieldTaskType(PlantingType.transplantBought)).toBe(TaskDefaultType.transplant);
    expect(fieldTaskType(PlantingType.seedling)).toBeNull();
  });

  it('engendre le semis en pépinière puis la plantation pour une série repiquée', () => {
    const tasks = defaultTasksForPlanting(schedule, { greenhouseSow: 1, transplant: 2 });
    expect(tasks.map((t) => [t.defaultType, t.plannedDate])).toEqual([
      [TaskDefaultType.greenhouseSow, '2026-03-01'],
      [TaskDefaultType.transplant, '2026-04-05'],
    ]);
  });

  it('engendre un seul semis direct pour une série semée en place', () => {
    const tasks = defaultTasksForPlanting({
      ...schedule,
      plantingType: PlantingType.directSeeded,
      dates: { sowing: { planned: '2026-04-05' } },
    });
    expect(tasks.map((t) => t.defaultType)).toEqual([TaskDefaultType.directSow]);
  });

  it('n’engendre qu’une plantation pour un plant acheté', () => {
    const tasks = defaultTasksForPlanting({
      ...schedule,
      plantingType: PlantingType.transplantBought,
    });
    expect(tasks.map((t) => t.defaultType)).toEqual([TaskDefaultType.transplant]);
  });

  it('n’engendre qu’un semis en pépinière pour une production de plants', () => {
    const tasks = defaultTasksForPlanting({
      ...schedule,
      plantingType: PlantingType.seedling,
    });
    expect(tasks.map((t) => t.defaultType)).toEqual([TaskDefaultType.greenhouseSow]);
  });
});
