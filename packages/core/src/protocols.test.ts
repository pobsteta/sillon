// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  defaultTasksForPlanting,
  generateTasksFromTemplate,
  rescheduleGeneratedTask,
  type TemplateStep,
} from './protocols.js';
import { PlantingDateType, PlantingType, TaskDefaultType } from './types.js';

const dates = {
  greenhouse_sowing: { planned: '2026-03-01' },
  sowing_planting: { planned: '2026-04-05' },
  harvest_begin: { planned: '2026-06-04' },
  harvest_end: { planned: '2026-07-19' },
};

const steps: TemplateStep[] = [
  {
    id: 1,
    typeId: 10,
    daysInField: 0,
    linkDays: -7,
    templateDateType: PlantingDateType.sowingPlanting,
    description: 'Préparation du sol',
  },
  {
    id: 2,
    typeId: 11,
    methodId: 20,
    implementId: 30,
    daysInField: 1,
    plannedLaborTime: 90,
    linkDays: 20,
    templateDateType: PlantingDateType.sowingPlanting,
    description: 'Désherbage',
  },
  {
    id: 3,
    typeId: 12,
    daysInField: 0,
    linkDays: -3,
    templateDateType: PlantingDateType.harvestBegin,
    description: 'Irrigation avant récolte',
  },
];

describe('itinéraires techniques', () => {
  it('place chaque étape par rapport à sa date de référence, dans l’ordre', () => {
    const tasks = generateTasksFromTemplate(steps, dates);
    expect(tasks.map((t) => t.plannedDate)).toEqual(['2026-03-29', '2026-04-25', '2026-06-01']);
    expect(tasks[1]?.plannedLaborTime).toBe(90);
    expect(tasks[1]?.link).toEqual({
      templateTaskId: 2,
      linkDays: 20,
      templateDateType: PlantingDateType.sowingPlanting,
    });
  });

  it('ignore les étapes dont la date de référence manque sur la série', () => {
    const tasks = generateTasksFromTemplate(steps, {
      sowing_planting: { planned: '2026-04-05' },
    });
    expect(tasks).toHaveLength(2);
  });

  it('recale une tâche générée quand la série est décalée', () => {
    const link = { linkDays: 20, templateDateType: PlantingDateType.sowingPlanting };
    expect(rescheduleGeneratedTask(link, { sowing_planting: { planned: '2026-04-12' } })).toBe(
      '2026-05-02',
    );
    expect(rescheduleGeneratedTask(link, {})).toBeNull();
  });

  it('suit la date réalisée dès qu’elle est saisie', () => {
    const tasks = generateTasksFromTemplate([steps[1]!], {
      sowing_planting: { planned: '2026-04-05', effective: '2026-04-10' },
    });
    expect(tasks[0]?.plannedDate).toBe('2026-04-30');
  });
});

describe('tâches déduites du plan de culture', () => {
  it('génère semis en pépinière puis plantation pour une série repiquée', () => {
    const tasks = defaultTasksForPlanting(PlantingType.transplantRaised, dates, {
      sowing: 1,
      planting: 2,
    });
    expect(tasks.map((t) => [t.defaultType, t.plannedDate])).toEqual([
      [TaskDefaultType.sowing, '2026-03-01'],
      [TaskDefaultType.planting, '2026-04-05'],
    ]);
  });

  it('génère un seul semis pour une série en semis direct', () => {
    const tasks = defaultTasksForPlanting(PlantingType.directSeed, dates);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.plannedDate).toBe('2026-04-05');
  });

  it('ne génère qu’une plantation pour un plant acheté', () => {
    const tasks = defaultTasksForPlanting(PlantingType.transplantBought, dates);
    expect(tasks.map((t) => t.defaultType)).toEqual([TaskDefaultType.planting]);
  });
});
