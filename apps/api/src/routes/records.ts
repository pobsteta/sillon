// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Suivi au champ (§3.5 du brief) : récoltes, notes et photos.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { toIsoDate, today } from '@sillon/core';
import { inFarm } from '../scope.js';
import { badRequest, notFound } from '../errors.js';
import { assertReferences } from '../references.js';
import { isoDate, toDbDate } from '../planting-io.js';
import { createStorage } from '../storage.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const IdParams = FarmParams.extend({ id: z.coerce.number().int().positive() });

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export async function recordRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const storage = createStorage();

  // ─────────────────────────── Récoltes ───────────────────────────
  const harvestTags = ['récoltes'];

  typed.get(
    '/api/farms/:farmId/harvests',
    {
      onRequest: app.requirePermission('harvests', 'read'),
      schema: {
        tags: harvestTags,
        summary: 'Lister les récoltes',
        params: FarmParams,
        querystring: z.object({
          plantingId: z.coerce.number().int().positive().optional(),
          from: isoDate.optional(),
          to: isoDate.optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { plantingId, from, to } = request.query;
        const rows = await db.harvest.findMany({
          where: {
            farmId,
            ...(plantingId ? { plantingId } : {}),
            ...(from || to
              ? {
                  date: {
                    ...(from ? { gte: toDbDate(from) } : {}),
                    ...(to ? { lte: toDbDate(to) } : {}),
                  },
                }
              : {}),
          },
          include: { planting: { include: { crop: true, variety: true, unit: true } } },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
        });
        return rows.map((row) => ({ ...row, date: toIsoDate(row.date) }));
      }),
  );

  typed.post(
    '/api/farms/:farmId/harvests',
    {
      onRequest: app.requirePermission('harvests', 'create'),
      schema: {
        tags: harvestTags,
        summary: 'Saisir une récolte',
        params: FarmParams,
        body: z.object({
          plantingId: z.number().int().positive(),
          date: isoDate.default(() => today()),
          /** Quantité entière, dans l'unité de la série. */
          quantity: z.number().int().min(0).max(100_000_000),
          laborTime: z.number().int().min(0).max(100_000).nullish(),
          done: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const { plantingId, date, ...fields } = request.body;
        const planting = await db.planting.findFirst({ where: { id: plantingId, farmId } });
        if (!planting) throw notFound('Série introuvable');
        return db.harvest.create({
          data: { ...fields, farmId, plantingId, date: toDbDate(date) },
        });
      });
      return reply.status(201).send({ ...created, date: toIsoDate(created.date) });
    },
  );

  typed.patch(
    '/api/farms/:farmId/harvests/:id',
    {
      onRequest: app.requirePermission('harvests', 'update'),
      schema: {
        tags: harvestTags,
        summary: 'Modifier une récolte',
        params: IdParams,
        body: z.object({
          date: isoDate.optional(),
          quantity: z.number().int().min(0).max(100_000_000).optional(),
          laborTime: z.number().int().min(0).max(100_000).nullish(),
          done: z.boolean().optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.harvest.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Récolte introuvable');
        const { date, ...fields } = request.body;
        const updated = await db.harvest.update({
          where: { id },
          data: { ...fields, ...(date ? { date: toDbDate(date) } : {}) },
        });
        return { ...updated, date: toIsoDate(updated.date) };
      }),
  );

  typed.delete(
    '/api/farms/:farmId/harvests/:id',
    {
      onRequest: app.requirePermission('harvests', 'delete'),
      schema: { tags: harvestTags, summary: 'Supprimer une récolte', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.harvest.findFirst({ where: { id: request.params.id, farmId } });
        if (!existing) throw notFound('Récolte introuvable');
        return db.harvest.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );

  // ──────────────────────────── Notes ────────────────────────────
  const noteTags = ['notes'];

  typed.get(
    '/api/farms/:farmId/notes',
    {
      onRequest: app.requirePermission('notes', 'read'),
      schema: {
        tags: noteTags,
        summary: 'Lister les notes',
        params: FarmParams,
        querystring: z.object({
          plantingId: z.coerce.number().int().positive().optional(),
          locationId: z.coerce.number().int().positive().optional(),
          pinned: z.stringbool().optional(),
          archived: z.stringbool().default(false),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { plantingId, locationId, pinned, archived } = request.query;
        const rows = await db.note.findMany({
          where: {
            farmId,
            ...(pinned === undefined ? {} : { pinned }),
            archivedAt: archived ? { not: null } : null,
            ...(plantingId ? { plantings: { some: { plantingId } } } : {}),
            ...(locationId ? { locations: { some: { locationId } } } : {}),
          },
          include: {
            photos: { include: { photo: true } },
            plantings: { include: { planting: { include: { crop: true } } } },
            locations: { include: { location: true } },
          },
          orderBy: [{ pinned: 'desc' }, { date: 'desc' }],
        });
        return rows.map((row) => ({ ...row, date: toIsoDate(row.date) }));
      }),
  );

  typed.post(
    '/api/farms/:farmId/notes',
    {
      onRequest: app.requirePermission('notes', 'create'),
      schema: {
        tags: noteTags,
        summary: 'Écrire une note',
        params: FarmParams,
        body: z.object({
          content: z.string().trim().min(1).max(10_000),
          date: isoDate.default(() => today()),
          pinned: z.boolean().default(false),
          plantingIds: z.array(z.number().int().positive()).default([]),
          locationIds: z.array(z.number().int().positive()).default([]),
          photoIds: z.array(z.number().int().positive()).default([]),
        }),
      },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const { date, plantingIds, locationIds, photoIds, ...fields } = request.body;
        await assertReferences(db, {
          planting: plantingIds,
          location: locationIds,
          photo: photoIds,
        });
        return db.note.create({
          data: {
            ...fields,
            farmId,
            date: toDbDate(date),
            plantings: { create: plantingIds.map((plantingId) => ({ plantingId })) },
            locations: { create: locationIds.map((locationId) => ({ locationId })) },
            photos: { create: photoIds.map((photoId) => ({ photoId })) },
          },
          include: { photos: { include: { photo: true } } },
        });
      });
      return reply.status(201).send({ ...created, date: toIsoDate(created.date) });
    },
  );

  typed.patch(
    '/api/farms/:farmId/notes/:id',
    {
      onRequest: app.requirePermission('notes', 'update'),
      schema: {
        tags: noteTags,
        summary: 'Modifier, épingler ou archiver une note',
        params: IdParams,
        body: z.object({
          content: z.string().trim().min(1).max(10_000).optional(),
          date: isoDate.optional(),
          pinned: z.boolean().optional(),
          archived: z.boolean().optional(),
          photoIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await db.note.findFirst({ where: { id, farmId } });
        if (!existing) throw notFound('Note introuvable');
        const { date, archived, photoIds, ...fields } = request.body;
        await assertReferences(db, { photo: photoIds });
        if (photoIds) {
          await db.notePhoto.deleteMany({ where: { noteId: id } });
          if (photoIds.length > 0) {
            await db.notePhoto.createMany({
              data: photoIds.map((photoId) => ({ noteId: id, photoId })),
            });
          }
        }
        const updated = await db.note.update({
          where: { id },
          data: {
            ...fields,
            ...(date ? { date: toDbDate(date) } : {}),
            ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          },
          include: { photos: { include: { photo: true } } },
        });
        return { ...updated, date: toIsoDate(updated.date) };
      }),
  );

  typed.delete(
    '/api/farms/:farmId/notes/:id',
    {
      onRequest: app.requirePermission('notes', 'delete'),
      schema: { tags: noteTags, summary: 'Supprimer une note', params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const existing = await db.note.findFirst({ where: { id: request.params.id, farmId } });
        if (!existing) throw notFound('Note introuvable');
        return db.note.delete({ where: { id: existing.id } });
      });
      return reply.status(204).send();
    },
  );

  // ──────────────────────────── Photos ────────────────────────────
  const photoTags = ['photos'];

  app.post(
    '/api/farms/:farmId/photos',
    {
      // Une photo n'existe que pour être jointe à une note : c'est donc la permission
      // `notes` qui la commande, pas l'échelle des rôles. La matrice Brinjel donne au
      // saisonnier `notes: [create, read, update, delete]` — lui refuser le téléversement
      // le laissait écrire une note sans pouvoir y joindre la photo qui la motive.
      onRequest: app.requirePermission('notes', 'create'),
      schema: { tags: photoTags, summary: 'Téléverser une photo' },
    },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_PHOTO_BYTES } });
      if (!file) throw badRequest('Aucun fichier reçu');
      if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
        throw badRequest(`Format d’image non accepté : ${file.mimetype}`);
      }
      const content = await file.toBuffer();
      const uuid = randomUUID();

      const photo = await inFarm(request, async (db, { farmId }) => {
        await storage.put(`${farmId}/${uuid}`, content, file.mimetype);
        return db.photo.create({ data: { farmId, name: file.filename, uuid } });
      });
      return reply.status(201).send(photo);
    },
  );

  typed.get(
    '/api/farms/:farmId/photos/:id/content',
    {
      onRequest: app.requirePermission('notes', 'read'),
      schema: { tags: photoTags, summary: 'Télécharger une photo', params: IdParams },
    },
    async (request, reply) => {
      const photo = await inFarm(request, async (db, { farmId }) => {
        const found = await db.photo.findFirst({ where: { id: request.params.id, farmId } });
        if (!found) throw notFound('Photo introuvable');
        return found;
      });
      const content = await storage.get(`${request.params.farmId}/${photo.uuid}`);
      reply.header('cache-control', 'private, max-age=86400');
      reply.type('application/octet-stream');
      return reply.send(content);
    },
  );

  typed.delete(
    '/api/farms/:farmId/photos/:id',
    {
      onRequest: app.requirePermission('notes', 'delete'),
      schema: { tags: photoTags, summary: 'Supprimer une photo', params: IdParams },
    },
    async (request, reply) => {
      const photo = await inFarm(request, async (db, { farmId }) => {
        const found = await db.photo.findFirst({ where: { id: request.params.id, farmId } });
        if (!found) throw notFound('Photo introuvable');
        await db.photo.delete({ where: { id: found.id } });
        return found;
      });
      await storage.remove(`${request.params.farmId}/${photo.uuid}`);
      return reply.status(204).send();
    },
  );
}
