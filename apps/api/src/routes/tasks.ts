// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tâches (§3.2 du brief) : feuille de la semaine, génération depuis le plan de culture,
// itinéraires techniques et recalage automatique quand les dates d'une série changent.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  defaultTasksForPlanting,
  generateTasksFromTemplate,
  taskStatus,
  toIsoDate,
  today,
  weekRange,
  type GeneratedTask,
  type TemplateStep,
} from '@sillon/core';
import { inFarm } from '../scope.js';
import { recalerTaches, scheduleOf } from '../task-scheduling.js';
import { notFound } from '../errors.js';
import { assertReferences } from '../references.js';
import type { Tx } from '../db.js';
import { isoDate, toDbDate } from '../planting-io.js';
import { defaultTaskTypeIds } from '../farm-setup.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const IdParams = FarmParams.extend({ id: z.coerce.number().int().positive() });

const taskInclude = {
  type: true,
  method: true,
  implement: true,
  plantings: { include: { planting: { include: { crop: true, variety: true } } } },
  locations: { include: { location: true } },
  templateLink: true,
} as const;

/** Contexte temporel d'une série, tel que l'attendent les fonctions d'itinéraire. */
/** Insère une tâche générée et, le cas échéant, le lien vers l'étape d'itinéraire. */
async function insertGeneratedTask(
  db: Tx,
  farmId: number,
  plantingId: number,
  task: GeneratedTask,
): Promise<number> {
  const created = await db.task.create({
    data: {
      farmId,
      typeId: task.typeId,
      methodId: task.methodId,
      implementId: task.implementId,
      defaultType: task.defaultType,
      plannedDate: toDbDate(task.plannedDate),
      effectiveDate: toDbDate(task.plannedDate),
      done: false,
      daysInField: task.daysInField,
      plannedLaborTime: task.plannedLaborTime,
      description: task.description,
      plantings: { create: { plantingId } },
    },
  });
  if (task.link) {
    await db.templateTaskLink.create({
      data: {
        taskId: created.id,
        templateTaskId: task.link.templateTaskId,
        linkDays: task.link.linkDays,
        templateDateType: task.link.templateDateType as any,
      },
    });
  }
  return created.id;
}

/** Les étapes d'un itinéraire citent un type, une méthode et un outil de la ferme. */
async function assertStepReferences(
  db: Tx,
  steps: readonly { typeId: number; methodId?: number | null; implementId?: number | null }[],
): Promise<void> {
  await assertReferences(db, {
    taskType: steps.map((step) => step.typeId),
    taskMethod: steps.map((step) => step.methodId),
    taskImplement: steps.map((step) => step.implementId),
  });
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['tâches'];

  typed.get(
    '/api/farms/:farmId/tasks',
    {
      onRequest: app.requirePermission('tasks', 'read'),
      schema: {
        tags,
        summary: 'Lister les tâches',
        params: FarmParams,
        querystring: z.object({
          from: isoDate.optional(),
          to: isoDate.optional(),
          /** Semaine contenant cette date (remplace from/to). */
          week: isoDate.optional(),
          done: z.stringbool().optional(),
          typeId: z.coerce.number().int().positive().optional(),
          plantingId: z.coerce.number().int().positive().optional(),
          locationId: z.coerce.number().int().positive().optional(),
          familyId: z.coerce.number().int().positive().optional(),
          /** Inclure les tâches non faites antérieures à la période (en retard). */
          includeLate: z.stringbool().default(false),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const query = request.query;
        const range = query.week
          ? weekRange(query.week)
          : query.from && query.to
            ? { begin: query.from, end: query.to }
            : null;

        const farm = await db.farm.findUniqueOrThrow({ where: { id: farmId } });
        const rows = await db.task.findMany({
          where: {
            farmId,
            ...(query.done === undefined ? {} : { done: query.done }),
            ...(query.typeId ? { typeId: query.typeId } : {}),
            ...(query.plantingId ? { plantings: { some: { plantingId: query.plantingId } } } : {}),
            ...(query.locationId ? { locations: { some: { locationId: query.locationId } } } : {}),
            ...(query.familyId
              ? { plantings: { some: { planting: { crop: { familyId: query.familyId } } } } }
              : {}),
            ...(range
              ? {
                  OR: [
                    {
                      plannedDate: { gte: toDbDate(range.begin), lte: toDbDate(range.end) },
                    },
                    // Les tâches en retard remontent avec la semaine courante.
                    ...(query.includeLate
                      ? [{ done: false, plannedDate: { lt: toDbDate(range.begin) } }]
                      : []),
                  ],
                }
              : {}),
          },
          include: taskInclude,
          orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
        });

        const reference = today();
        return rows.map((row) => ({
          ...row,
          plannedDate: toIsoDate(row.plannedDate),
          effectiveDate: toIsoDate(row.effectiveDate),
          status: taskStatus(
            { plannedDate: toIsoDate(row.plannedDate), done: row.done },
            reference,
            { value: farm.taskOverdueWindowValue, unit: farm.taskOverdueWindowUnit },
          ),
        }));
      }),
  );

  typed.post(
    '/api/farms/:farmId/tasks',
    {
      onRequest: app.requirePermission('tasks', 'create'),
      schema: {
        tags,
        summary: 'Créer une tâche',
        params: FarmParams,
        body: z.object({
          typeId: z.number().int().positive().nullish(),
          methodId: z.number().int().positive().nullish(),
          implementId: z.number().int().positive().nullish(),
          plannedDate: isoDate,
          daysInField: z.number().int().min(0).max(3650).default(0),
          plannedLaborTime: z.number().int().min(0).max(100_000).nullish(),
          description: z.string().trim().max(2000).nullish(),
          plantingIds: z.array(z.number().int().positive()).default([]),
          locationIds: z.array(z.number().int().positive()).default([]),
        }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const { plantingIds, locationIds, plannedDate, ...fields } = request.body;
        await assertReferences(db, {
          taskType: fields.typeId,
          taskMethod: fields.methodId,
          taskImplement: fields.implementId,
          planting: plantingIds,
          location: locationIds,
        });
        const task = await db.task.create({
          data: {
            ...fields,
            farmId,
            defaultType: 'custom',
            plannedDate: toDbDate(plannedDate),
            effectiveDate: toDbDate(plannedDate),
            done: false,
            plantings: { create: plantingIds.map((plantingId) => ({ plantingId })) },
            locations: { create: locationIds.map((locationId) => ({ locationId })) },
          },
          include: taskInclude,
        });
        return task;
      });
      return reply.status(201).send(created);
    },
  );

  typed.patch(
    '/api/farms/:farmId/tasks/:id',
    {
      onRequest: app.requirePermission('tasks', 'update'),
      schema: {
        tags,
        summary: 'Modifier une tâche',
        params: IdParams,
        body: z.object({
          typeId: z.number().int().positive().nullish(),
          methodId: z.number().int().positive().nullish(),
          implementId: z.number().int().positive().nullish(),
          plannedDate: isoDate.optional(),
          effectiveDate: isoDate.optional(),
          done: z.boolean().optional(),
          daysInField: z.number().int().min(0).max(3650).optional(),
          plannedLaborTime: z.number().int().min(0).max(100_000).nullish(),
          effectiveLaborTime: z.number().int().min(0).max(100_000).nullish(),
          description: z.string().trim().max(2000).nullish(),
          plantingIds: z.array(z.number().int().positive()).optional(),
          locationIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.task.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Tâche introuvable');

        const { plantingIds, locationIds, plannedDate, effectiveDate, ...fields } = request.body;
        await assertReferences(db, {
          taskType: fields.typeId,
          taskMethod: fields.methodId,
          taskImplement: fields.implementId,
          planting: plantingIds,
          location: locationIds,
        });
        await db.task.update({
          where: { id },
          data: {
            ...fields,
            ...(plannedDate ? { plannedDate: toDbDate(plannedDate) } : {}),
            ...(effectiveDate ? { effectiveDate: toDbDate(effectiveDate) } : {}),
          },
        });
        if (plantingIds) {
          await db.plantingTask.deleteMany({ where: { taskId: id } });
          if (plantingIds.length > 0) {
            await db.plantingTask.createMany({
              data: plantingIds.map((plantingId) => ({ taskId: id, plantingId })),
            });
          }
        }
        if (locationIds) {
          await db.locationTask.deleteMany({ where: { taskId: id } });
          if (locationIds.length > 0) {
            await db.locationTask.createMany({
              data: locationIds.map((locationId) => ({ taskId: id, locationId })),
            });
          }
        }
        return db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
      }),
  );

  typed.post(
    '/api/farms/:farmId/tasks/complete',
    {
      onRequest: app.requirePermission('tasks', 'update'),
      schema: {
        tags,
        summary: 'Valider des tâches (§7.3 : deux touches au champ)',
        params: FarmParams,
        body: z.object({
          ids: z.array(z.number().int().positive()).min(1).max(500),
          done: z.boolean().default(true),
          effectiveDate: isoDate.optional(),
          effectiveLaborTime: z.number().int().min(0).max(100_000).nullish(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { ids, done, effectiveDate, effectiveLaborTime } = request.body;
        const result = await db.task.updateMany({
          where: { id: { in: ids }, farmId },
          data: {
            done,
            ...(done ? { effectiveDate: toDbDate(effectiveDate ?? today()) } : {}),
            ...(effectiveLaborTime === undefined ? {} : { effectiveLaborTime }),
          },
        });
        return { updated: result.count };
      }),
  );

  typed.delete(
    '/api/farms/:farmId/tasks/:id',
    {
      onRequest: app.requirePermission('tasks', 'delete'),
      schema: { tags, summary: 'Supprimer une tâche', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.task.findFirst({ where: { id: request.params.id, farmId } });
        if (!existing) throw notFound('Tâche introuvable');
        return db.task.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );

  // ─────────────── Génération depuis le plan de culture ───────────────

  typed.post(
    '/api/farms/:farmId/plantings/:id/generate-tasks',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Générer les tâches de semis et de plantation d’une série',
        params: IdParams,
        body: z.object({ replace: z.boolean().default(true) }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const planting = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: { dates: true, harvestPeriods: true },
        });
        if (!planting) throw notFound('Série introuvable');

        if (request.body.replace) {
          // On ne supprime que les tâches engendrées non faites : le travail déjà réalisé reste.
          await db.task.deleteMany({
            where: {
              farmId,
              done: false,
              defaultType: { in: ['direct_sow', 'greenhouse_sow', 'transplant'] },
              plantings: { some: { plantingId: planting.id } },
            },
          });
        }

        const typeIds = await defaultTaskTypeIds(db, farmId);
        const tasks = defaultTasksForPlanting(scheduleOf(planting), typeIds);
        const ids: number[] = [];
        for (const task of tasks)
          ids.push(await insertGeneratedTask(db, farmId, planting.id, task));
        return db.task.findMany({ where: { id: { in: ids } }, include: taskInclude });
      });
      return reply.status(201).send(created);
    },
  );

  typed.post(
    '/api/farms/:farmId/plantings/:id/apply-template',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Appliquer un itinéraire technique à une série',
        params: IdParams,
        body: z.object({ taskTemplateId: z.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const planting = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: { dates: true, harvestPeriods: true },
        });
        if (!planting) throw notFound('Série introuvable');

        const template = await db.taskTemplate.findFirst({
          where: { id: request.body.taskTemplateId, farmId },
          include: { tasks: true },
        });
        if (!template) throw notFound('Itinéraire technique introuvable');

        const steps: TemplateStep[] = template.tasks.map((step) => ({
          id: step.id,
          typeId: step.typeId,
          methodId: step.methodId,
          implementId: step.implementId,
          daysInField: step.daysInField,
          plannedLaborTime: step.plannedLaborTime,
          description: step.description,
          linkDays: step.linkDays,
          templateDateType: step.templateDateType as TemplateStep['templateDateType'],
        }));

        const tasks = generateTasksFromTemplate(steps, scheduleOf(planting));
        const ids: number[] = [];
        for (const task of tasks)
          ids.push(await insertGeneratedTask(db, farmId, planting.id, task));
        return db.task.findMany({ where: { id: { in: ids } }, include: taskInclude });
      });
      return reply.status(201).send(created);
    },
  );

  typed.post(
    '/api/farms/:farmId/plantings/:id/reschedule-tasks',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Recaler les tâches générées après un changement de dates',
        params: IdParams,
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const planting = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: { dates: true, harvestPeriods: true },
        });
        if (!planting) throw notFound('Série introuvable');

        return { rescheduled: await recalerTaches(db, planting) };
      }),
  );

  // ─────────────────── Itinéraires techniques ───────────────────

  const templateDateType = z.enum([
    'field_sowing_planting',
    'greenhouse_sowing',
    'first_harvest',
    'last_harvest',
  ]);

  typed.get(
    '/api/farms/:farmId/task-templates',
    {
      onRequest: app.requirePermission('task_templates', 'read'),
      schema: { tags, summary: 'Lister les itinéraires techniques', params: FarmParams },
    },
    async (request) =>
      inFarm(request, (db, { farmId }) =>
        db.taskTemplate.findMany({
          where: { farmId },
          include: {
            tasks: {
              include: { type: true, method: true, implement: true },
              orderBy: { linkDays: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        }),
      ),
  );

  typed.post(
    '/api/farms/:farmId/task-templates',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Créer un itinéraire technique',
        params: FarmParams,
        body: z.object({
          name: z.string().trim().min(1).max(120),
          steps: z
            .array(
              z.object({
                typeId: z.number().int().positive(),
                methodId: z.number().int().positive().nullish(),
                implementId: z.number().int().positive().nullish(),
                daysInField: z.number().int().min(0).max(3650).default(0),
                plannedLaborTime: z.number().int().min(0).max(100_000).nullish(),
                description: z.string().trim().max(2000).nullish(),
                linkDays: z.number().int().min(-3650).max(3650),
                templateDateType: templateDateType,
              }),
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        await assertStepReferences(db, request.body.steps);
        return db.taskTemplate.create({
          data: {
            farmId,
            name: request.body.name,
            tasks: { create: request.body.steps },
          },
          include: { tasks: true },
        });
      });
      return reply.status(201).send(created);
    },
  );

  typed.patch(
    '/api/farms/:farmId/task-templates/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Modifier un itinéraire technique',
        params: IdParams,
        body: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          steps: z
            .array(
              z.object({
                typeId: z.number().int().positive(),
                methodId: z.number().int().positive().nullish(),
                implementId: z.number().int().positive().nullish(),
                daysInField: z.number().int().min(0).max(3650).default(0),
                plannedLaborTime: z.number().int().min(0).max(100_000).nullish(),
                description: z.string().trim().max(2000).nullish(),
                linkDays: z.number().int().min(-3650).max(3650),
                templateDateType: templateDateType,
              }),
            )
            .optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.taskTemplate.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Itinéraire technique introuvable');
        if (request.body.name) {
          await db.taskTemplate.update({ where: { id }, data: { name: request.body.name } });
        }
        if (request.body.steps) {
          await assertStepReferences(db, request.body.steps);
          // Les étapes sont remplacées en bloc ; les tâches déjà générées gardent leur lien
          // par `template_task_links`, qui conserve le décalage d'origine.
          await db.templateTask.deleteMany({ where: { taskTemplateId: id } });
          await db.templateTask.createMany({
            data: request.body.steps.map((step) => ({ ...step, taskTemplateId: id })),
          });
        }
        return db.taskTemplate.findUniqueOrThrow({ where: { id }, include: { tasks: true } });
      }),
  );

  typed.delete(
    '/api/farms/:farmId/task-templates/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Supprimer un itinéraire', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.taskTemplate.findFirst({
          where: { id: request.params.id, farmId },
        });
        if (!existing) throw notFound('Itinéraire technique introuvable');
        return db.taskTemplate.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );
}
