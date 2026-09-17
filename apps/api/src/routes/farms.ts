// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fermes, réglages, équipe et invitations (§3.6 du brief), plus l'export complet
// des données de la ferme, exigé en auto-service par le RGPD (§8).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { withFarm, withoutFarmScope } from '../tenant.js';
import { createFarm } from '../farm-setup.js';
import { farmContext } from '../scope.js';
import { invitationMail } from '../mail-templates.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const role = z.enum(['owner', 'manager', 'employee', 'seasonal', 'consultant']);

export async function farmRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['fermes'];

  typed.post(
    '/api/farms',
    {
      onRequest: app.requireUser,
      schema: {
        tags,
        summary: 'Créer une ferme',
        body: z.object({
          name: z.string().trim().min(1).max(120),
          countryCode: z.string().length(2).default('FR'),
        }),
      },
    },
    async (request, reply) => {
      const farm = await withoutFarmScope((db) =>
        createFarm(db, {
          name: request.body.name,
          ownerId: request.currentUser!.id,
          countryCode: request.body.countryCode,
          locale: request.currentUser!.locale,
        }),
      );
      return reply.status(201).send(farm);
    },
  );

  typed.get(
    '/api/farms/:farmId',
    {
      onRequest: app.requireMember,
      schema: { tags, summary: 'Détail d’une ferme', params: FarmParams },
    },
    async (request) => {
      const { farmId, role: currentRole } = farmContext(request);
      const farm = await withoutFarmScope((db) =>
        db.farm.findUniqueOrThrow({
          where: { id: farmId },
          include: {
            bedSettings: true,
            _count: { select: { memberships: true, plantings: true } },
          },
        }),
      );
      // L'état d'accès voyage avec la ferme : l'interface doit pouvoir dire « lecture seule »
      // avant que la personne ne se heurte à un refus en essayant d'enregistrer.
      return { ...farm, role: currentRole, access: request.farm!.access };
    },
  );

  typed.patch(
    '/api/farms/:farmId',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Modifier une ferme',
        params: FarmParams,
        body: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          countryCode: z.string().length(2).optional(),
          taskOverdueWindowValue: z.number().int().positive().max(100).optional(),
          taskOverdueWindowUnit: z.enum(['day', 'week', 'month', 'year']).optional(),
        }),
      },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withoutFarmScope((db) =>
        db.farm.update({ where: { id: farmId }, data: request.body }),
      );
    },
  );

  typed.put(
    '/api/farms/:farmId/bed-settings',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Réglages de planches (mesures en centimètres)',
        params: FarmParams,
        body: z.object({
          bedWidth: z.number().int().positive().max(10_000).nullish(),
          pathWidth: z.number().int().positive().max(10_000).nullish(),
          bedLength: z.number().int().positive().max(1_000_000).nullish(),
          standardizedBeds: z.boolean().optional(),
        }),
      },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withFarm(farmId, (db) =>
        db.bedSettings.upsert({
          where: { farmId },
          create: { farmId, ...request.body },
          update: request.body,
        }),
      );
    },
  );

  // ─────────────────────────────── Équipe ───────────────────────────────

  typed.get(
    '/api/farms/:farmId/members',
    {
      onRequest: app.requirePermission('team', 'read'),
      schema: { tags, summary: 'Membres de la ferme', params: FarmParams },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withoutFarmScope((db) =>
        db.farmMembership.findMany({
          where: { farmId },
          include: { user: { select: { id: true, email: true, lastSeen: true, locale: true } } },
          orderBy: { insertedAt: 'asc' },
        }),
      );
    },
  );

  typed.patch(
    '/api/farms/:farmId/members/:userId',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Changer le rôle d’un membre',
        params: FarmParams.extend({ userId: z.coerce.number().int().positive() }),
        body: z.object({ role }),
      },
    },
    async (request) => {
      const { farmId, userId: currentUserId } = farmContext(request);
      const { userId } = request.params;
      if (request.body.role === 'owner') {
        // Un seul propriétaire par ferme (index partiel `farm_memberships_single_owner`) :
        // transmettre la propriété est une opération à part entière, pas un simple changement de rôle.
        throw badRequest('Utilisez le transfert de propriété pour désigner un autre propriétaire');
      }
      if (userId === currentUserId)
        throw badRequest('Vous ne pouvez pas changer votre propre rôle');
      return withoutFarmScope((db) =>
        db.farmMembership.update({
          where: { farmId_userId: { farmId, userId } },
          data: { role: request.body.role },
        }),
      );
    },
  );

  typed.delete(
    '/api/farms/:farmId/members/:userId',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Retirer un membre',
        params: FarmParams.extend({ userId: z.coerce.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const { farmId, userId: currentUserId } = farmContext(request);
      const { userId } = request.params;
      if (userId === currentUserId)
        throw badRequest('Le propriétaire ne peut pas se retirer lui-même');
      await withoutFarmScope((db) =>
        db.farmMembership.delete({ where: { farmId_userId: { farmId, userId } } }),
      );
      return reply.status(204).send();
    },
  );

  typed.post(
    '/api/farms/:farmId/members/transfer',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Transférer la propriété de la ferme',
        params: FarmParams,
        body: z.object({ userId: z.number().int().positive() }),
      },
    },
    async (request) => {
      const { farmId, userId: currentUserId } = farmContext(request);
      const { userId } = request.body;
      return withoutFarmScope(async (db) => {
        const target = await db.farmMembership.findUnique({
          where: { farmId_userId: { farmId, userId } },
        });
        if (!target) throw notFound('Cette personne n’est pas membre de la ferme');
        // L'ancien propriétaire redevient chef de culture ; l'index partiel impose que
        // les deux mises à jour se fassent dans cet ordre, dans la même transaction.
        await db.farmMembership.update({
          where: { farmId_userId: { farmId, userId: currentUserId } },
          data: { role: 'manager' },
        });
        await db.farmMembership.update({
          where: { farmId_userId: { farmId, userId } },
          data: { role: 'owner' },
        });
        await db.farm.update({ where: { id: farmId }, data: { ownerId: userId } });
        return { ok: true };
      });
    },
  );

  // ─────────────────────────── Invitations ───────────────────────────

  typed.get(
    '/api/farms/:farmId/invitations',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Invitations en cours', params: FarmParams },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withoutFarmScope((db) =>
        db.invitation.findMany({ where: { farmId }, orderBy: { insertedAt: 'desc' } }),
      );
    },
  );

  typed.post(
    '/api/farms/:farmId/invitations',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Inviter quelqu’un par courriel',
        params: FarmParams,
        body: z.object({
          email: z.email(),
          role: z.enum(['manager', 'employee', 'seasonal', 'consultant']).default('employee'),
        }),
      },
    },
    async (request, reply) => {
      const { farmId, userId } = farmContext(request);
      const address = request.body.email.trim().toLowerCase();
      const invitation = await withoutFarmScope(async (db) => {
        const already = await db.farmMembership.findFirst({
          where: { farmId, user: { email: address } },
        });
        if (already) throw conflict('Cette personne est déjà membre de la ferme');
        return db.invitation.create({
          data: {
            farmId,
            inviterId: userId,
            email: address,
            role: request.body.role,
            invitationId: randomUUID(),
          },
        });
      });
      const farm = await withoutFarmScope((db) =>
        db.farm.findUniqueOrThrow({ where: { id: farmId }, select: { name: true } }),
      );
      await app.mailer.send(
        invitationMail({
          to: address,
          farmName: farm.name,
          inviterEmail: request.currentUser!.email,
          url: `${app.appUrl}/invitation/${invitation.invitationId}`,
        }),
      );
      // Le jeton reste dans la réponse : l'interface propose le lien à copier, ce qui
      // dépanne quand le courriel se perd ou que SMTP n'est pas configuré.
      return reply.status(201).send(invitation);
    },
  );

  typed.delete(
    '/api/farms/:farmId/invitations/:id',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Annuler une invitation',
        params: FarmParams.extend({ id: z.coerce.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const { id } = request.params;
      await withoutFarmScope(async (db) => {
        const invitation = await db.invitation.findFirst({ where: { id, farmId } });
        if (!invitation) throw notFound('Invitation introuvable');
        return db.invitation.delete({ where: { id } });
      });
      return reply.status(204).send();
    },
  );

  typed.post(
    '/api/invitations/:invitationId/accept',
    {
      onRequest: app.requireUser,
      schema: {
        tags,
        summary: 'Rejoindre une ferme sur invitation',
        params: z.object({ invitationId: z.string().min(8) }),
      },
    },
    async (request) => {
      const user = request.currentUser!;
      return withoutFarmScope(async (db) => {
        const invitation = await db.invitation.findUnique({
          where: { invitationId: request.params.invitationId },
        });
        if (!invitation) throw notFound('Invitation introuvable ou déjà utilisée');
        if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
          throw forbidden('Cette invitation vise une autre adresse');
        }
        await db.farmMembership.create({
          data: { farmId: invitation.farmId, userId: user.id, role: invitation.role },
        });
        await db.invitation.delete({ where: { id: invitation.id } });
        return db.farm.findUniqueOrThrow({
          where: { id: invitation.farmId },
          select: { id: true, name: true, slug: true },
        });
      });
    },
  );

  // ─────────────────────────── Export complet ───────────────────────────

  typed.get(
    '/api/farms/:farmId/export',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Exporter toutes les données de la ferme (JSON)',
        params: FarmParams,
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const data = await withFarm(farmId, async (db) => ({
        exportedAt: new Date().toISOString(),
        families: await db.family.findMany({ where: { farmId } }),
        crops: await db.crop.findMany({ where: { farmId } }),
        providers: await db.provider.findMany({ where: { farmId } }),
        varieties: await db.variety.findMany({ where: { farmId } }),
        units: await db.unit.findMany({ where: { farmId } }),
        containers: await db.container.findMany({ where: { farmId } }),
        tags: await db.tag.findMany({ where: { farmId } }),
        locations: await db.location.findMany({ where: { farmId }, orderBy: { id: 'asc' } }),
        plantings: await db.planting.findMany({
          where: { farmId },
          include: {
            dates: true,
            durations: true,
            harvestPeriods: true,
            tags: true,
            assignments: true,
          },
        }),
        tasks: await db.task.findMany({
          where: { farmId },
          include: { plantings: true, locations: true },
        }),
        taskTemplates: await db.taskTemplate.findMany({
          where: { farmId },
          include: { tasks: true },
        }),
        harvests: await db.harvest.findMany({ where: { farmId } }),
        notes: await db.note.findMany({
          where: { farmId },
          include: { plantings: true, locations: true, photos: true },
        }),
        photos: await db.photo.findMany({ where: { farmId } }),
      }));

      reply.header('content-disposition', `attachment; filename="sillon-ferme-${farmId}.json"`);
      return data;
    },
  );
}
