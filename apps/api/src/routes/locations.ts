// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Parcellaire et assolement (§3.3 du brief) : arbre jardins → planches, placement des
// séries, emplacements disponibles, historique et contrôle des rotations.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  bedHistory,
  checkRotation,
  distributeOverBeds,
  findAvailableBeds,
  occupationRange,
  type Bed,
  type Occupation,
} from '@sillon/core';
import { inFarm } from '../scope.js';
import { badRequest, notFound } from '../errors.js';
import { assertReferences } from '../references.js';
import type { Tx } from '../db.js';
import { datesFromRows, isoDate } from '../planting-io.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const IdParams = FarmParams.extend({ id: z.coerce.number().int().positive() });

/**
 * Toutes les occupations de planches de la ferme, avec la période de chaque série et
 * sa famille botanique : c'est la matière première de l'assolement et des rotations.
 */
export async function loadOccupations(db: Tx, farmId: number): Promise<Occupation[]> {
  const assignments = await db.locationAssignment.findMany({
    where: { location: { farmId } },
    include: { planting: { include: { dates: true, crop: true } } },
  });

  const occupations: Occupation[] = [];
  for (const assignment of assignments) {
    const range = occupationRange(datesFromRows(assignment.planting.dates));
    if (!range) continue;
    occupations.push({
      plantingId: assignment.plantingId,
      locationId: assignment.locationId,
      length: assignment.length,
      range,
      familyId: assignment.planting.crop.familyId,
    });
  }
  return occupations;
}

function groupByBed(occupations: readonly Occupation[]): Map<number, Occupation[]> {
  const grouped = new Map<number, Occupation[]>();
  for (const occupation of occupations) {
    const list = grouped.get(occupation.locationId);
    if (list) list.push(occupation);
    else grouped.set(occupation.locationId, [occupation]);
  }
  return grouped;
}

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['assolement'];

  typed.get(
    '/api/farms/:farmId/locations',
    {
      onRequest: app.requireFarm('member'),
      schema: {
        tags,
        summary: 'Arbre du parcellaire',
        params: FarmParams,
        querystring: z.object({ greenhouse: z.stringbool().optional() }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const rows = await db.location.findMany({
          where: {
            farmId,
            ...(request.query.greenhouse === undefined
              ? {}
              : { greenhouse: request.query.greenhouse }),
          },
          orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
          include: { _count: { select: { children: true, assignments: true } } },
        });
        return rows;
      }),
  );

  typed.post(
    '/api/farms/:farmId/locations',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Créer un jardin, une serre ou une planche',
        params: FarmParams,
        body: z.object({
          name: z.string().trim().min(1).max(120),
          parentId: z.number().int().positive().nullish(),
          bedLength: z.number().int().min(0).max(10_000_000),
          bedWidth: z.number().int().min(0).max(100_000).nullish(),
          greenhouse: z.boolean().default(false),
          position: z.number().int().min(0).max(99_999).optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const { position, parentId, ...fields } = request.body;
        if (parentId) {
          const parent = await db.location.findFirst({ where: { id: parentId, farmId } });
          if (!parent) throw notFound('Emplacement parent introuvable');
        }
        // Position par défaut : à la suite des frères existants.
        const siblings = await db.location.count({ where: { farmId, parentId: parentId ?? null } });
        return db.location.create({
          data: {
            ...fields,
            farmId,
            parentId: parentId ?? null,
            position: position ?? siblings + 1,
          },
        });
      });
      return reply.status(201).send(created);
    },
  );

  typed.patch(
    '/api/farms/:farmId/locations/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Modifier ou déplacer un emplacement',
        params: IdParams,
        body: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          parentId: z.number().int().positive().nullish(),
          bedLength: z.number().int().min(0).max(10_000_000).optional(),
          bedWidth: z.number().int().min(0).max(100_000).nullish(),
          greenhouse: z.boolean().optional(),
          position: z.number().int().min(0).max(99_999).optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.location.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Emplacement introuvable');

        const { parentId } = request.body;
        if (parentId === id) throw badRequest('Un emplacement ne peut pas être son propre parent');
        if (parentId) {
          await assertReferences(db, { location: parentId });
          // Déplacer un emplacement sous l'un de ses propres descendants formerait un cycle :
          // la clé étrangère l'accepterait, mais l'arbre ltree ne sait pas le représenter et
          // le trigger recalculerait les chemins contre un sous-arbre devenu incohérent.
          const cycle = await db.$queryRaw<{ id: number }[]>`
            SELECT enfant.id
              FROM locations enfant, locations racine
             WHERE enfant.id = ${parentId} AND racine.id = ${id}
               AND enfant.path <@ racine.path`;
          if (cycle.length > 0) {
            throw badRequest(
              'Un emplacement ne peut pas être déplacé sous l’un de ses descendants',
            );
          }
        }

        // Le trigger `locations_path_before` recalcule le chemin ltree, et
        // `locations_path_after` celui de toute la descendance.
        return db.location.update({ where: { id }, data: request.body });
      }),
  );

  typed.delete(
    '/api/farms/:farmId/locations/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Supprimer un emplacement', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.location.findFirst({ where: { id: request.params.id, farmId } });
        if (!existing) throw notFound('Emplacement introuvable');
        return db.location.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );

  typed.get(
    '/api/farms/:farmId/locations/:id/history',
    {
      onRequest: app.requireFarm('member'),
      schema: { tags, summary: 'Historique des cultures d’une planche', params: IdParams },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const location = await db.location.findFirst({ where: { id, farmId } });
        if (!location) throw notFound('Emplacement introuvable');

        const occupations = await loadOccupations(db, farmId);
        const history = bedHistory(id, occupations);
        const plantings = await db.planting.findMany({
          where: { id: { in: history.map((o) => o.plantingId) } },
          include: { crop: { include: { family: true } }, variety: true },
        });
        const byId = new Map(plantings.map((planting) => [planting.id, planting]));

        return history.map((occupation) => ({
          ...occupation,
          planting: byId.get(occupation.plantingId) ?? null,
        }));
      }),
  );

  // ─────────────────────── Placement des séries ───────────────────────

  typed.get(
    '/api/farms/:farmId/plantings/:id/available-locations',
    {
      onRequest: app.requireFarm('member'),
      schema: {
        tags,
        summary: 'Emplacements disponibles pour une série',
        params: IdParams,
        querystring: z.object({
          /** Longueur cherchée en centimètres ; par défaut celle de la série. */
          length: z.coerce.number().int().min(0).optional(),
          from: isoDate.optional(),
          to: isoDate.optional(),
          /** Inclure les planches où la rotation n'est pas respectée. */
          includeConflicts: z.stringbool().default(true),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const planting = await db.planting.findFirst({
          where: { id: request.params.id, farmId },
          include: { dates: true, crop: { include: { family: true } } },
        });
        if (!planting) throw notFound('Série introuvable');

        const range =
          request.query.from && request.query.to
            ? { begin: request.query.from, end: request.query.to }
            : occupationRange(datesFromRows(planting.dates));
        if (!range)
          throw badRequest('La série n’a pas de dates : impossible de chercher une place');

        const required = request.query.length ?? Number(planting.length ?? 0);
        const rows = await db.location.findMany({
          where: { farmId, children: { none: {} } },
          orderBy: { position: 'asc' },
        });
        const beds: Bed[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          bedLength: row.bedLength,
          bedWidth: row.bedWidth,
          greenhouse: row.greenhouse,
        }));

        const occupations = await loadOccupations(db, farmId);
        const availability = findAvailableBeds(beds, groupByBed(occupations), required, range, {
          greenhouse: planting.inGreenhouse ?? null,
          ignorePlantingIds: [planting.id],
        });

        const results = availability.map((entry) => ({
          ...entry,
          rotation: checkRotation(
            entry.bed.id,
            planting.crop.familyId,
            range,
            planting.crop.family.interval,
            occupations,
            [planting.id],
          ),
        }));

        return {
          range,
          requiredLength: required,
          locations: request.query.includeConflicts
            ? results
            : results.filter((entry) => entry.rotation === null),
          suggestion: distributeOverBeds(
            required,
            results.filter((entry) => entry.rotation === null),
          ),
        };
      }),
  );

  typed.put(
    '/api/farms/:farmId/plantings/:id/assignments',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Placer une série sur des planches',
        params: IdParams,
        body: z.object({
          assignments: z
            .array(
              z.object({
                locationId: z.number().int().positive(),
                length: z.number().int().min(1).max(10_000_000),
              }),
            )
            .max(200),
          /** Placer malgré un conflit de rotation (l'alerte reste dans la réponse). */
          force: z.boolean().default(false),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const planting = await db.planting.findFirst({
          where: { id, farmId },
          include: { dates: true, crop: { include: { family: true } } },
        });
        if (!planting) throw notFound('Série introuvable');

        const range = occupationRange(datesFromRows(planting.dates));
        const occupations = await loadOccupations(db, farmId);
        const warnings: unknown[] = [];

        if (range) {
          const byBed = groupByBed(occupations);
          for (const assignment of request.body.assignments) {
            const location = await db.location.findFirst({
              where: { id: assignment.locationId, farmId },
            });
            if (!location) throw notFound(`Emplacement ${assignment.locationId} introuvable`);

            const available = findAvailableBeds(
              [
                {
                  id: location.id,
                  name: location.name,
                  bedLength: location.bedLength,
                  bedWidth: location.bedWidth,
                  greenhouse: location.greenhouse,
                },
              ],
              byBed,
              assignment.length,
              range,
              { ignorePlantingIds: [id] },
            )[0];
            if (available && !available.fits) {
              warnings.push({
                type: 'overbooked',
                locationId: location.id,
                availableLength: available.availableLength,
                requestedLength: assignment.length,
              });
            }

            const rotation = checkRotation(
              location.id,
              planting.crop.familyId,
              range,
              planting.crop.family.interval,
              occupations,
              [id],
            );
            if (rotation) warnings.push({ type: 'rotation', ...rotation });
          }
        }

        const blocking = warnings.filter((w: any) => w.type === 'rotation');
        if (blocking.length > 0 && !request.body.force) {
          throw badRequest('Rotation non respectée sur au moins une planche', { warnings });
        }

        await db.locationAssignment.deleteMany({ where: { plantingId: id } });
        if (request.body.assignments.length > 0) {
          await db.locationAssignment.createMany({
            data: request.body.assignments.map((assignment) => ({ ...assignment, plantingId: id })),
          });
        }

        return {
          assignments: await db.locationAssignment.findMany({
            where: { plantingId: id },
            include: { location: true },
          }),
          warnings,
        };
      }),
  );

  typed.get(
    '/api/farms/:farmId/assignments',
    {
      onRequest: app.requireFarm('member'),
      schema: {
        tags,
        summary: 'Plan d’assolement sur une période',
        params: FarmParams,
        querystring: z.object({ from: isoDate, to: isoDate }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { from, to } = request.query;
        const occupations = (await loadOccupations(db, farmId)).filter(
          (occupation) => occupation.range.begin <= to && from <= occupation.range.end,
        );

        const locations = await db.location.findMany({
          where: { farmId },
          orderBy: { position: 'asc' },
        });
        const plantings = await db.planting.findMany({
          where: { id: { in: occupations.map((o) => o.plantingId) } },
          include: { crop: { include: { family: true } }, variety: true },
        });
        const byId = new Map(plantings.map((planting) => [planting.id, planting]));

        return {
          range: { begin: from, end: to },
          locations,
          occupations: occupations.map((occupation) => ({
            ...occupation,
            cropName: byId.get(occupation.plantingId)?.crop.name ?? null,
            varietyName: byId.get(occupation.plantingId)?.variety?.name ?? null,
            color: byId.get(occupation.plantingId)?.crop.color ?? '#888888',
          })),
        };
      }),
  );
}
