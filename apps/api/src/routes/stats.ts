// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Statistiques (§3.5) : rendements prévus et réalisés, temps de travail, avancement.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  actualYieldPerBedMeter,
  compareYield,
  expectedRevenue,
  expectedYield,
  occupationRange,
  totalLaborTime,
  type PlantingType as PlantingTypeValue,
} from '@sillon/core';
import { harvestPeriodsFromRows } from '../planting-io.js';
import { inFarm } from '../scope.js';
import { datesFromRows, toDbDate } from '../planting-io.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['statistiques'];

  typed.get(
    '/api/farms/:farmId/stats',
    {
      onRequest: app.requirePermission('charts', 'read'),
      schema: {
        tags,
        summary: 'Tableau de bord d’une saison',
        params: FarmParams,
        querystring: z.object({ year: z.coerce.number().int().min(1900).max(2200) }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { year } = request.query;
        const from = `${year}-01-01`;
        const to = `${year}-12-31`;

        const plantings = await db.planting.findMany({
          where: { farmId },
          include: {
            crop: { include: { family: true } },
            variety: true,
            unit: true,
            container: true,
            dates: true,
            harvestPeriods: true,
            harvests: true,
            assignments: true,
          },
        });

        const inSeason = plantings.filter((planting) => {
          const range = occupationRange(
            datesFromRows(planting.dates),
            planting.plantingType as PlantingTypeValue,
            harvestPeriodsFromRows(planting.harvestPeriods),
          );
          if (range) return range.begin <= to && from <= range.end;
          // Une production de plants n'occupe pas de planche : on la rattache à son semis.
          const sowing = datesFromRows(planting.dates).sowing?.planned ?? null;
          return sowing ? sowing >= from && sowing <= to : false;
        });

        // L'agrégat est tenu par espèce ET par unité : additionner des kilogrammes et des
        // bottes donnerait un total, un rendement au mètre et un écart dépourvus de sens.
        const byCrop = new Map<
          string,
          {
            key: string;
            cropId: number;
            cropName: string;
            familyName: string;
            color: string;
            unitName: string | null;
            plantingCount: number;
            bedLength: number;
            expectedYield: number;
            actualYield: number;
            expectedRevenue: number;
            harvestLaborTime: number;
          }
        >();

        for (const planting of inSeason) {
          const spec = {
            plantingType: planting.plantingType as PlantingTypeValue,
            length: Number(planting.length ?? 0),
            rows: planting.rows ?? 0,
            spacingPlants: Number(planting.spacingPlants ?? 0),
            yieldPerBedMeter:
              planting.yieldPerBedMeter === null ? null : Number(planting.yieldPerBedMeter),
            pricePerUnit: planting.pricePerUnit === null ? null : Number(planting.pricePerUnit),
          };
          const harvested = planting.harvests.reduce((total, h) => total + h.quantity, 0);
          const key = `${planting.cropId}:${planting.unitId ?? 0}`;
          const entry = byCrop.get(key) ?? {
            key,
            cropId: planting.cropId,
            cropName: planting.crop.name,
            familyName: planting.crop.family.name,
            color: planting.crop.color,
            unitName: planting.unit?.name ?? null,
            plantingCount: 0,
            bedLength: 0,
            expectedYield: 0,
            actualYield: 0,
            expectedRevenue: 0,
            harvestLaborTime: 0,
          };
          entry.plantingCount += 1;
          entry.bedLength += spec.length;
          entry.expectedYield += expectedYield(spec);
          entry.actualYield += harvested;
          entry.expectedRevenue += expectedRevenue(spec);
          entry.harvestLaborTime += planting.harvests.reduce((t, h) => t + (h.laborTime ?? 0), 0);
          byCrop.set(key, entry);
        }

        const tasks = await db.task.findMany({
          where: {
            farmId,
            plannedDate: { gte: toDbDate(from), lte: toDbDate(to) },
          },
          include: { type: true },
        });

        const laborByType = new Map<
          string,
          { name: string; color: string; planned: number; effective: number }
        >();
        for (const task of tasks) {
          const key = task.type?.name ?? 'Sans type';
          const entry = laborByType.get(key) ?? {
            name: key,
            color: task.type?.color ?? '#94a3b8',
            planned: 0,
            effective: 0,
          };
          entry.planned += task.plannedLaborTime ?? 0;
          entry.effective += task.effectiveLaborTime ?? 0;
          laborByType.set(key, entry);
        }

        const crops = [...byCrop.values()]
          .map((entry) => ({
            ...entry,
            yieldPerBedMeter: actualYieldPerBedMeter(entry.actualYield, entry.bedLength),
            comparison: compareYield(entry.expectedYield, entry.actualYield),
          }))
          .sort((a, b) => b.expectedRevenue - a.expectedRevenue);

        return {
          year,
          plantings: {
            total: inSeason.length,
            placed: inSeason.filter((p) => p.assignments.length > 0).length,
            finished: inSeason.filter((p) => p.finished).length,
            underCover: inSeason.filter((p) => p.inGreenhouse).length,
          },
          tasks: {
            total: tasks.length,
            done: tasks.filter((task) => task.done).length,
            labor: totalLaborTime(tasks),
            byType: [...laborByType.values()].sort((a, b) => b.planned - a.planned),
          },
          yields: {
            expected: crops.reduce((total, crop) => total + crop.expectedYield, 0),
            actual: crops.reduce((total, crop) => total + crop.actualYield, 0),
            expectedRevenue: crops.reduce((total, crop) => total + crop.expectedRevenue, 0),
          },
          crops,
        };
      }),
  );
}
