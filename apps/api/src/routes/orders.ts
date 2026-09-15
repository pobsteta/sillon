// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (règles d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Commandes de semences et de plants (§3.4) : liste agrégée et export CSV.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  buildOrderLines,
  formatSeedMass,
  orderPeriod,
  toCsv,
  type OrderablePlanting,
  type PlantingType as PlantingTypeValue,
} from '@sillon/core';
import { inFarm } from '../scope.js';
import type { Tx } from '../db.js';
import { datesFromRows } from '../planting-io.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

const OrderQuery = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  period: z.enum(['year', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4']).default('year'),
  placedOnly: z.stringbool().default(false),
  providerId: z.coerce.number().int().positive().optional(),
  cropId: z.coerce.number().int().positive().optional(),
});

async function collectOrderLines(db: Tx, farmId: number, query: z.infer<typeof OrderQuery>) {
  const rows = await db.planting.findMany({
    where: { farmId, finished: false },
    include: {
      crop: true,
      variety: { include: { provider: true } },
      container: true,
      dates: true,
      assignments: { select: { plantingId: true } },
    },
  });

  const plantings: OrderablePlanting[] = rows.map((row) => ({
    id: row.id,
    plantingType: row.plantingType as PlantingTypeValue,
    length: Number(row.length ?? 0),
    rows: row.rows ?? 0,
    spacingPlants: Number(row.spacingPlants ?? 0),
    seedsPerGram: row.seedsPerGram,
    seedsPerHoleSeedling: row.seedsPerHoleSeedling,
    seedsPerHoleDirect: row.seedsPerHoleDirect,
    seedsExtraPercentage: row.seedsExtraPercentage,
    estimatedGreenhouseLoss: row.estimatedGreenhouseLoss,
    containerSize: row.container?.size ?? null,
    cropId: row.cropId,
    cropName: row.crop.name,
    varietyId: row.varietyId,
    varietyName: row.variety?.name ?? null,
    providerId: row.variety?.providerId ?? null,
    providerName: row.variety?.provider?.name ?? null,
    dates: datesFromRows(row.dates),
    placed: row.assignments.length > 0,
  }));

  return buildOrderLines(plantings, {
    placedOnly: query.placedOnly,
    range: query.year ? orderPeriod(query.year, query.period) : null,
    providerIds: query.providerId ? [query.providerId] : null,
    cropIds: query.cropId ? [query.cropId] : null,
  });
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['commandes'];

  typed.get(
    '/api/farms/:farmId/orders',
    {
      onRequest: app.requireFarm('member'),
      schema: {
        tags,
        summary: 'Liste des semences et plants à commander',
        params: FarmParams,
        querystring: OrderQuery,
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const lines = await collectOrderLines(db, farmId, request.query);
        return {
          period: request.query.year ? orderPeriod(request.query.year, request.query.period) : null,
          lines,
          totals: {
            seedCount: lines.reduce((total, line) => total + line.seedCount, 0),
            plantsToBuy: lines.reduce((total, line) => total + line.plantsToBuy, 0),
          },
        };
      }),
  );

  typed.get(
    '/api/farms/:farmId/orders.csv',
    {
      onRequest: app.requireFarm('member'),
      schema: {
        tags,
        summary: 'Export CSV de la commande',
        params: FarmParams,
        querystring: OrderQuery,
      },
    },
    async (request, reply) => {
      const lines = await inFarm(request, (db, { farmId }) =>
        collectOrderLines(db, farmId, request.query),
      );
      const csv = toCsv(lines, [
        { header: 'Fournisseur', value: (line) => line.providerName ?? '' },
        { header: 'Espèce', value: (line) => line.cropName },
        { header: 'Variété', value: (line) => line.varietyName ?? '' },
        { header: 'Séries', value: (line) => line.plantingCount },
        { header: 'Graines', value: (line) => line.seedCount },
        {
          header: 'Masse',
          value: (line) => (line.seedMassMg === null ? '' : formatSeedMass(line.seedMassMg)),
        },
        { header: 'Plants à acheter', value: (line) => line.plantsToBuy },
        { header: 'Première utilisation', value: (line) => line.firstNeededOn ?? '' },
      ]);

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="sillon-commandes.csv"');
      return reply.send(csv);
    },
  );
}
