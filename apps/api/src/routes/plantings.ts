// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Plan de culture : les séries (§3.1 du brief). CRUD, duplication, filtres, tri,
// traitement par lot et données du diagramme de Gantt.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  expectedRevenue,
  expectedYield,
  fieldDate,
  occupationRange,
  seedRequirement,
  shiftHarvestPeriods,
  shiftPlantingDates,
  type HarvestPeriod,
  type PlantingType as PlantingTypeValue,
} from '@sillon/core';
import { inFarm } from '../scope.js';
import { notFound } from '../errors.js';
import { assertReferences } from '../references.js';
import type { Tx } from '../db.js';
import {
  DatesInput,
  DurationsInput,
  HarvestPeriodsInput,
  datesFromRows,
  durationsFromRows,
  harvestPeriodsFromRows,
  isoDate,
  resolveSchedule,
  toDbDate,
} from '../planting-io.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const IdParams = FarmParams.extend({ id: z.coerce.number().int().positive() });

const plantingType = z.enum([
  'direct_seeded',
  'transplant_bought',
  'transplant_raised',
  'seedling',
]);

/** Champs communs à la création, à la modification et au traitement par lot. */
const plantingFields = {
  cropId: z.number().int().positive(),
  varietyId: z.number().int().positive().nullish(),
  unitId: z.number().int().positive().nullish(),
  containerId: z.number().int().positive().nullish(),
  plantingType,
  inGreenhouse: z.boolean().nullish(),
  length: z.number().int().min(0).max(10_000_000).nullish(),
  rows: z.number().int().min(0).max(1000).nullish(),
  spacingPlants: z.number().int().min(0).max(100_000).nullish(),
  yieldPerBedMeter: z.number().int().min(0).nullish(),
  pricePerUnit: z.number().int().min(0).nullish(),
  seedsPerGram: z.number().int().min(0).nullish(),
  seedsPerHoleSeedling: z.number().int().min(0).max(100).nullish(),
  seedsPerHoleDirect: z.number().int().min(0).max(100).nullish(),
  seedsExtraPercentage: z.number().int().min(0).max(1000).nullish(),
  estimatedGreenhouseLoss: z.number().int().min(0).max(99).nullish(),
  finished: z.boolean().optional(),
  finishReason: z
    .enum(['harvesting_finished', 'crop_failure', 'crop_never_seeded', 'crop_never_planted'])
    .nullish(),
};

const CreateBody = z.object({
  ...plantingFields,
  dates: DatesInput.optional(),
  /** Date de semis : de là se déduisent plantation et fenêtre de récolte. */
  sowingDate: isoDate.optional(),
  durations: DurationsInput.optional(),
  harvestPeriods: HarvestPeriodsInput.optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
});

const UpdateBody = z.object({
  ...Object.fromEntries(
    Object.entries(plantingFields).map(([key, schema]) => [key, (schema as z.ZodType).optional()]),
  ),
  dates: DatesInput.optional(),
  sowingDate: isoDate.optional(),
  durations: DurationsInput.optional(),
  harvestPeriods: HarvestPeriodsInput.optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
}) as z.ZodType<Record<string, unknown>>;

const ListQuery = z.object({
  cropId: z.coerce.number().int().positive().optional(),
  familyId: z.coerce.number().int().positive().optional(),
  varietyId: z.coerce.number().int().positive().optional(),
  plantingType: plantingType.optional(),
  inGreenhouse: z.stringbool().optional(),
  finished: z.stringbool().optional(),
  placed: z.stringbool().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().min(1).optional(),
  /** Saison : ne garder que les séries actives pendant l'année civile donnée. */
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  sort: z.enum(['date', 'crop', 'length', 'inserted']).default('date'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const plantingInclude = {
  crop: { include: { family: true } },
  variety: true,
  unit: true,
  container: true,
  dates: true,
  durations: true,
  harvestPeriods: true,
  tags: { include: { tag: true } },
  assignments: { include: { location: true } },
} as const;

/** Forme renvoyée à l'interface : dates, durées et récoltes repliées, calculs joints. */
export function serializePlanting(row: any) {
  const dates = datesFromRows(row.dates ?? []);
  const durations = durationsFromRows(row.durations ?? []);
  const harvestPeriods = harvestPeriodsFromRows(row.harvestPeriods ?? []);
  const plantingType = row.plantingType as PlantingTypeValue;
  const spec = {
    plantingType,
    length: Number(row.length ?? 0),
    rows: row.rows ?? 0,
    spacingPlants: Number(row.spacingPlants ?? 0),
    yieldPerBedMeter: row.yieldPerBedMeter === null ? null : Number(row.yieldPerBedMeter),
    pricePerUnit: row.pricePerUnit === null ? null : Number(row.pricePerUnit),
    seedsPerGram: row.seedsPerGram,
    seedsPerHoleSeedling: row.seedsPerHoleSeedling,
    seedsPerHoleDirect: row.seedsPerHoleDirect,
    seedsExtraPercentage: row.seedsExtraPercentage,
    estimatedGreenhouseLoss: row.estimatedGreenhouseLoss,
    containerSize: row.container?.size ?? null,
  };

  return {
    ...row,
    dates,
    durations,
    harvestPeriods,
    tags: (row.tags ?? []).map((link: any) => link.tag),
    /** Date de mise en place au champ : `null` pour une production de plants. */
    fieldDate: fieldDate(dates, plantingType),
    occupation: occupationRange(dates, plantingType, harvestPeriods),
    computed: {
      ...seedRequirement(spec),
      expectedYield: expectedYield(spec),
      expectedRevenue: expectedRevenue(spec),
      assignedLength: (row.assignments ?? []).reduce(
        (total: number, a: any) => total + Number(a.length),
        0,
      ),
    },
  };
}

async function writeSchedule(
  db: Tx,
  plantingId: number,
  body: {
    dates?: any;
    sowingDate?: string;
    durations?: any;
    harvestPeriods?: HarvestPeriod[];
    plantingType: PlantingTypeValue;
  },
): Promise<void> {
  const schedule = resolveSchedule({
    plantingType: body.plantingType,
    dates: body.dates,
    sowingDate: body.sowingDate,
    durations: body.durations,
    harvestPeriods: body.harvestPeriods,
  });

  if (Object.keys(schedule.dates).length > 0) {
    await db.plantingDate.deleteMany({ where: { plantingId } });
    await db.plantingDate.createMany({
      data: Object.entries(schedule.dates).map(([type, value]) => ({
        plantingId,
        type: type as any,
        planned: toDbDate(value!.planned),
        effective: value!.effective ? toDbDate(value!.effective) : null,
      })),
    });
  }

  if (body.durations) {
    await db.plantingDuration.deleteMany({ where: { plantingId } });
    await db.plantingDuration.createMany({
      data: Object.entries(body.durations).map(([type, duration]) => ({
        plantingId,
        type: type as any,
        duration: duration as number,
      })),
    });
  }

  if (schedule.harvestPeriods) {
    await db.harvestPeriod.deleteMany({ where: { plantingId } });
    if (schedule.harvestPeriods.length > 0) {
      await db.harvestPeriod.createMany({
        data: schedule.harvestPeriods.map((period) => ({
          plantingId,
          begin: toDbDate(period.begin),
          end: toDbDate(period.end),
        })),
      });
    }
  }
}

export async function plantingRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['plan de culture'];

  typed.get(
    '/api/farms/:farmId/plantings',
    {
      onRequest: app.requirePermission('crop_plan', 'read'),
      schema: { tags, summary: 'Lister les séries', params: FarmParams, querystring: ListQuery },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const query = request.query;
        const rows = await db.planting.findMany({
          where: {
            farmId,
            ...(query.cropId ? { cropId: query.cropId } : {}),
            ...(query.varietyId ? { varietyId: query.varietyId } : {}),
            ...(query.plantingType ? { plantingType: query.plantingType } : {}),
            ...(query.inGreenhouse === undefined ? {} : { inGreenhouse: query.inGreenhouse }),
            ...(query.finished === undefined ? {} : { finished: query.finished }),
            ...(query.familyId ? { crop: { familyId: query.familyId } } : {}),
            ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
            ...(query.placed === undefined
              ? {}
              : query.placed
                ? { assignments: { some: {} } }
                : { assignments: { none: {} } }),
            ...(query.search
              ? {
                  OR: [
                    { crop: { name: { contains: query.search, mode: 'insensitive' as const } } },
                    { variety: { name: { contains: query.search, mode: 'insensitive' as const } } },
                  ],
                }
              : {}),
          },
          include: plantingInclude,
        });

        let series = rows.map(serializePlanting);

        if (query.year) {
          const from = `${query.year}-01-01`;
          const to = `${query.year}-12-31`;
          series = series.filter((planting) => {
            const range = planting.occupation;
            if (range) return range.begin <= to && from <= range.end;
            // Une production de plants n'occupe aucune planche : on la retient sur son
            // semis, faute de période au champ.
            const sowing = planting.dates.sowing?.planned ?? null;
            return sowing ? sowing >= from && sowing <= to : false;
          });
        }

        // Le tri par date porte sur une table satellite : Prisma ne sait pas l'ordonner,
        // on trie en mémoire (quelques milliers de séries par ferme au plus).
        const direction = query.order === 'desc' ? -1 : 1;
        series.sort((a, b) => {
          switch (query.sort) {
            case 'crop':
              return direction * (a.crop?.name ?? '').localeCompare(b.crop?.name ?? '');
            case 'length':
              return direction * (Number(a.length ?? 0) - Number(b.length ?? 0));
            case 'inserted':
              return direction * (a.id - b.id);
            default: {
              // Tri chronologique : mise en place au champ, ou semis si la série n'en a pas.
              const left = a.fieldDate ?? a.dates.sowing?.planned ?? '9999';
              const right = b.fieldDate ?? b.dates.sowing?.planned ?? '9999';
              return direction * left.localeCompare(right);
            }
          }
        });
        return series;
      }),
  );

  typed.get(
    '/api/farms/:farmId/plantings/:id',
    {
      onRequest: app.requirePermission('crop_plan', 'read'),
      schema: { tags, summary: 'Détail d’une série', params: IdParams },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const row = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: {
            ...plantingInclude,
            harvests: { orderBy: { date: 'asc' } },
            tasks: {
              include: { task: { include: { type: true, method: true, implement: true } } },
            },
            notes: { include: { note: { include: { photos: { include: { photo: true } } } } } },
          },
        });
        if (!row) throw notFound('Série introuvable');
        return serializePlanting(row);
      }),
  );

  typed.post(
    '/api/farms/:farmId/plantings',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Créer une série', params: FarmParams, body: CreateBody },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const { dates, sowingDate, durations, harvestPeriods, tagIds, ...fields } = request.body;
        await assertReferences(db, {
          crop: fields.cropId,
          variety: fields.varietyId,
          unit: fields.unitId,
          container: fields.containerId,
          tag: tagIds,
        });
        const planting = await db.planting.create({ data: { ...fields, farmId } });
        await writeSchedule(db, planting.id, {
          dates,
          sowingDate,
          durations,
          harvestPeriods,
          plantingType: fields.plantingType,
        });
        if (tagIds?.length) {
          await db.plantingTag.createMany({
            data: tagIds.map((tagId) => ({ plantingId: planting.id, tagId })),
          });
        }
        return db.planting.findUniqueOrThrow({
          where: { id: planting.id },
          include: plantingInclude,
        });
      });
      return reply.status(201).send(serializePlanting(created));
    },
  );

  typed.patch(
    '/api/farms/:farmId/plantings/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Modifier une série', params: IdParams, body: UpdateBody },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.planting.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Série introuvable');

        const body = request.body as any;
        const { dates, sowingDate, durations, harvestPeriods, tagIds, ...fields } = body;
        await assertReferences(db, {
          crop: fields.cropId,
          variety: fields.varietyId,
          unit: fields.unitId,
          container: fields.containerId,
          tag: tagIds,
        });
        if (Object.keys(fields).length > 0) {
          await db.planting.update({ where: { id }, data: fields });
        }
        await writeSchedule(db, id, {
          dates,
          sowingDate,
          durations,
          harvestPeriods,
          plantingType: (fields.plantingType ?? existing.plantingType) as PlantingTypeValue,
        });
        if (tagIds) {
          await db.plantingTag.deleteMany({ where: { plantingId: id } });
          if (tagIds.length > 0) {
            await db.plantingTag.createMany({
              data: tagIds.map((tagId: number) => ({ plantingId: id, tagId })),
            });
          }
        }
        return serializePlanting(
          await db.planting.findUniqueOrThrow({ where: { id }, include: plantingInclude }),
        );
      }),
  );

  typed.post(
    '/api/farms/:farmId/plantings/:id/duplicate',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Dupliquer une série',
        params: IdParams,
        body: z.object({
          /** Nombre de copies, pour créer une succession de séries échelonnées. */
          count: z.number().int().min(1).max(52).default(1),
          /** Décalage en jours entre chaque copie (7 = une par semaine). */
          intervalDays: z.number().int().min(0).max(365).default(0),
        }),
      },
    },
    async (request, reply) => {
      const copies = await inFarm(request, async (db, { farmId }) => {
        const source = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: { dates: true, durations: true, tags: true, harvestPeriods: true },
        });
        if (!source) throw notFound('Série introuvable');

        const { id: _id, insertedAt: _i, updatedAt: _u, ...fields } = source as any;
        const sourceDates = datesFromRows(source.dates);
        const sourcePeriods = harvestPeriodsFromRows(source.harvestPeriods);
        const created = [];

        for (let index = 1; index <= request.body.count; index += 1) {
          const shifted = shiftPlantingDates(sourceDates, index * request.body.intervalDays);
          const copy = await db.planting.create({
            data: {
              ...fields,
              dates: undefined,
              durations: undefined,
              tags: undefined,
              harvestPeriods: undefined,
            },
          });
          await db.plantingDate.createMany({
            data: Object.entries(shifted).map(([type, value]) => ({
              plantingId: copy.id,
              type: type as any,
              planned: toDbDate(value!.planned),
              effective: null,
            })),
          });
          await db.plantingDuration.createMany({
            data: source.durations.map((duration) => ({
              plantingId: copy.id,
              type: duration.type,
              duration: duration.duration,
            })),
          });
          const shiftedPeriods = shiftHarvestPeriods(
            sourcePeriods,
            index * request.body.intervalDays,
          );
          if (shiftedPeriods.length > 0) {
            await db.harvestPeriod.createMany({
              data: shiftedPeriods.map((period) => ({
                plantingId: copy.id,
                begin: toDbDate(period.begin),
                end: toDbDate(period.end),
              })),
            });
          }
          if (source.tags.length > 0) {
            await db.plantingTag.createMany({
              data: source.tags.map((link) => ({ plantingId: copy.id, tagId: link.tagId })),
            });
          }
          created.push(copy.id);
        }

        return db.planting.findMany({ where: { id: { in: created } }, include: plantingInclude });
      });
      return reply.status(201).send(copies.map(serializePlanting));
    },
  );

  typed.patch(
    '/api/farms/:farmId/plantings',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Traitement par lot (§3.1 : modifier plusieurs séries d’un coup)',
        params: FarmParams,
        body: z.object({
          ids: z.array(z.number().int().positive()).min(1).max(500),
          /** Décalage appliqué à toutes les dates prévues des séries visées. */
          shiftDays: z.number().int().min(-3650).max(3650).optional(),
          data: z
            .object({
              varietyId: z.number().int().positive().nullish(),
              unitId: z.number().int().positive().nullish(),
              containerId: z.number().int().positive().nullish(),
              plantingType: plantingType.optional(),
              inGreenhouse: z.boolean().optional(),
              length: z.number().int().min(0).optional(),
              rows: z.number().int().min(0).optional(),
              spacingPlants: z.number().int().min(0).optional(),
              yieldPerBedMeter: z.number().int().min(0).optional(),
              pricePerUnit: z.number().int().min(0).optional(),
              seedsExtraPercentage: z.number().int().min(0).max(1000).optional(),
              estimatedGreenhouseLoss: z.number().int().min(0).max(99).optional(),
              finished: z.boolean().optional(),
            })
            .optional(),
          addTagIds: z.array(z.number().int().positive()).optional(),
          removeTagIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { ids, shiftDays, data, addTagIds, removeTagIds } = request.body;
        await assertReferences(db, {
          variety: data?.varietyId,
          unit: data?.unitId,
          container: data?.containerId,
          tag: [...(addTagIds ?? []), ...(removeTagIds ?? [])],
        });
        const owned = await db.planting.findMany({
          where: { id: { in: ids }, farmId },
          include: { dates: true, harvestPeriods: true },
        });
        if (owned.length === 0) throw notFound('Aucune série correspondante');

        if (data && Object.keys(data).length > 0) {
          await db.planting.updateMany({ where: { id: { in: owned.map((p) => p.id) } }, data });
        }

        if (shiftDays) {
          for (const planting of owned) {
            const shifted = shiftPlantingDates(datesFromRows(planting.dates), shiftDays);
            for (const [type, value] of Object.entries(shifted)) {
              await db.plantingDate.update({
                where: { plantingId_type: { plantingId: planting.id, type: type as any } },
                data: { planned: toDbDate(value!.planned) },
              });
            }
            // Les fenêtres de récolte suivent : elles sont accrochées aux mêmes dates.
            for (const period of planting.harvestPeriods) {
              const [shiftedPeriod] = shiftHarvestPeriods(
                harvestPeriodsFromRows([period]),
                shiftDays,
              );
              if (!shiftedPeriod) continue;
              await db.harvestPeriod.update({
                where: { id: period.id },
                data: {
                  begin: toDbDate(shiftedPeriod.begin),
                  end: toDbDate(shiftedPeriod.end),
                },
              });
            }
          }
        }

        if (removeTagIds?.length) {
          await db.plantingTag.deleteMany({
            where: { plantingId: { in: owned.map((p) => p.id) }, tagId: { in: removeTagIds } },
          });
        }
        if (addTagIds?.length) {
          await db.plantingTag.createMany({
            data: owned.flatMap((planting) =>
              addTagIds.map((tagId) => ({ plantingId: planting.id, tagId })),
            ),
            skipDuplicates: true,
          });
        }

        return { updated: owned.length };
      }),
  );

  typed.delete(
    '/api/farms/:farmId/plantings/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Supprimer une série', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.planting.findFirst({ where: { id: request.params.id, farmId } });
        if (!existing) throw notFound('Série introuvable');
        return db.planting.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );

  typed.post(
    '/api/farms/:farmId/plantings/delete',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Supprimer plusieurs séries',
        params: FarmParams,
        body: z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const result = await db.planting.deleteMany({
          where: { id: { in: request.body.ids }, farmId },
        });
        return { deleted: result.count };
      }),
  );

  typed.get(
    '/api/farms/:farmId/gantt',
    {
      onRequest: app.requirePermission('crop_plan', 'read'),
      schema: {
        tags,
        summary: 'Données du diagramme de Gantt',
        params: FarmParams,
        querystring: z.object({
          from: isoDate.optional(),
          to: isoDate.optional(),
          familyId: z.coerce.number().int().positive().optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { from, to, familyId } = request.query;
        const rows = await db.planting.findMany({
          where: { farmId, ...(familyId ? { crop: { familyId } } : {}) },
          include: {
            crop: { include: { family: true } },
            variety: true,
            dates: true,
            harvestPeriods: true,
            assignments: true,
          },
        });

        const bars = rows
          .map((row) => {
            const dates = datesFromRows(row.dates);
            const plantingType = row.plantingType as PlantingTypeValue;
            const periods = harvestPeriodsFromRows(row.harvestPeriods);
            const range = occupationRange(dates, plantingType, periods);
            if (!range) return null;

            const sowing = dates.sowing;
            const planting = dates.planting;
            const firstHarvest = periods[0]?.begin ?? null;

            return {
              plantingId: row.id,
              cropName: row.crop.name,
              varietyName: row.variety?.name ?? null,
              color: row.crop.color,
              familyId: row.crop.familyId,
              familyName: row.crop.family.name,
              inGreenhouse: row.inGreenhouse ?? false,
              placed: row.assignments.length > 0,
              // La pépinière s'étend du semis à la plantation : elle n'occupe pas la planche.
              nursery:
                sowing && planting
                  ? {
                      begin: sowing.effective ?? sowing.planned,
                      end: planting.effective ?? planting.planned,
                    }
                  : null,
              growing: { begin: range.begin, end: firstHarvest ?? range.end },
              // Une série peut compter plusieurs fenêtres de récolte.
              harvest: periods,
            };
          })
          .filter((bar): bar is NonNullable<typeof bar> => bar !== null)
          .filter((bar) => {
            const last = bar.harvest[bar.harvest.length - 1]?.end ?? bar.growing.end;
            return (
              (!from || bar.growing.begin <= (to ?? '9999-12-31')) &&
              (!to || last >= (from ?? '0000-01-01'))
            );
          })
          .sort((a, b) => a.growing.begin.localeCompare(b.growing.begin));

        return bars;
      }),
  );
}

// Utilisé par les routes de commande et de statistiques.
export { plantingInclude };
