// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Centres de formation (lot 2 de `brief/abonnements-et-centres-de-formation.md`).
//
// Un centre de formation **est** une ferme, avec des attributs en plus ; une ferme
// d'apprenant **est** une ferme rattachée à un centre. Rien ici n'invente un second modèle
// de données : tout tient dans trois tables de rattachement et dans la duplication de ferme
// (`farm-copy.ts`).
//
// Les trois partis pris du brief, qui expliquent ce qui suit :
//
// 1. **Le formateur voit tout par une adhésion ordinaire**, au rôle `manager`. Pas de porte
//    dérobée : l'apprenant le voit dans la liste de son équipe, et peut le retirer comme
//    n'importe quel membre — c'est sa ferme.
// 2. **Plusieurs modèles par centre**, un par promotion ou par module. Le modèle par défaut
//    figure toujours dans la liste, pour qu'un seul endroit la porte.
// 3. **À l'échéance, l'apprenant garde sa ferme.** Terminer une formation ne supprime rien :
//    cela retire les formateurs et rend la ferme personnelle.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { withoutFarmScope } from '../tenant.js';
import { createEmptyFarm } from '../farm-setup.js';
import { copierFerme } from '../farm-copy.js';
import { farmContext } from '../scope.js';
import { invitationMail } from '../mail-templates.js';
import type { Tx } from '../db.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });
const JOUR = 86_400_000;

/** Le centre de formation de cette ferme, ou une erreur qui le dit. */
async function centre(db: Tx, farmId: number) {
  const trouve = await db.trainingCenter.findUnique({ where: { farmId } });
  if (!trouve) throw notFound("Cette ferme n'est pas un centre de formation");
  return trouve;
}

/**
 * Une ferme ne devient un modèle que si la personne qui la désigne y a des droits
 * d'encadrement. Sans cette vérification, un centre pourrait prendre pour modèle la ferme
 * de n'importe qui et en dupliquer le contenu — c'est-à-dire copier les données d'un tiers
 * en une requête.
 */
async function verifierModele(db: Tx, templateFarmId: number, userId: number): Promise<void> {
  const ferme = await db.farm.findUnique({ where: { id: templateFarmId } });
  if (!ferme) throw notFound('Ferme modèle introuvable');
  const adhesion = await db.farmMembership.findFirst({
    where: { farmId: templateFarmId, userId, role: { in: ['owner', 'manager'] } },
  });
  if (!adhesion) {
    throw forbidden('Vous devez encadrer une ferme pour en faire un modèle de formation');
  }
}

/** Les formateurs du centre : ceux qui l'encadrent au moment où la ferme est créée. */
async function formateurs(db: Tx, centerFarmId: number): Promise<number[]> {
  const equipe = await db.farmMembership.findMany({
    where: { farmId: centerFarmId, role: { in: ['owner', 'manager'] } },
    select: { userId: true },
  });
  return equipe.map((membre) => membre.userId);
}

export async function trainingRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['formation'];

  // ─────────────────────────── Le centre ───────────────────────────

  typed.put(
    '/api/farms/:farmId/training-center',
    {
      onRequest: app.requireFarm('owner'),
      schema: {
        tags,
        summary: 'Déclarer la ferme comme centre de formation',
        params: FarmParams,
        body: z.object({
          defaultTemplateFarmId: z.number().int().positive(),
          defaultTrainingDuration: z.number().int().positive().max(3_650).default(365),
          maximumTrainingDuration: z.number().int().positive().max(3_650).default(365),
        }),
      },
    },
    async (request) => {
      const { farmId, userId } = farmContext(request);
      const corps = request.body;
      if (corps.defaultTrainingDuration > corps.maximumTrainingDuration) {
        throw badRequest('La durée par défaut dépasse la durée maximale');
      }
      return withoutFarmScope(async (db) => {
        await verifierModele(db, corps.defaultTemplateFarmId, userId);
        const centreFerme = await db.trainingCenter.upsert({
          where: { farmId },
          create: { farmId, ...corps },
          update: corps,
        });
        // Le modèle par défaut appartient toujours à la liste : c'est l'invariant qui
        // permet de lire les modèles d'un centre sur une seule table.
        await db.trainingCenterTemplate.upsert({
          where: {
            trainingCenterId_templateFarmId: {
              trainingCenterId: farmId,
              templateFarmId: corps.defaultTemplateFarmId,
            },
          },
          create: { trainingCenterId: farmId, templateFarmId: corps.defaultTemplateFarmId },
          update: {},
        });
        return centreFerme;
      });
    },
  );

  typed.get(
    '/api/farms/:farmId/training-center',
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: 'Le centre de formation et ses modèles', params: FarmParams },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withoutFarmScope(async (db) => {
        const centreFerme = await centre(db, farmId);
        const modeles = await db.trainingCenterTemplate.findMany({
          where: { trainingCenterId: farmId },
          include: { templateFarm: { select: { id: true, name: true, slug: true } } },
          orderBy: { insertedAt: 'asc' },
        });
        const apprenants = await db.studentFarm.count({ where: { trainingCenterId: farmId } });
        const enCours = await db.studentFarm.count({
          where: { trainingCenterId: farmId, endedAt: null },
        });
        return {
          ...centreFerme,
          templates: modeles.map((modele) => ({
            ...modele.templateFarm,
            label: modele.label,
            isDefault: modele.templateFarmId === centreFerme.defaultTemplateFarmId,
          })),
          studentCount: apprenants,
          activeStudentCount: enCours,
        };
      });
    },
  );

  typed.delete(
    '/api/farms/:farmId/training-center',
    {
      onRequest: app.requireFarm('owner'),
      schema: { tags, summary: 'Cesser d’être un centre de formation', params: FarmParams },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      await withoutFarmScope(async (db) => {
        await centre(db, farmId);
        const encadres = await db.studentFarm.count({
          where: { trainingCenterId: farmId, endedAt: null },
        });
        // Supprimer le centre effacerait en cascade le rattachement de ses apprenants : on
        // demande de terminer les formations d'abord, ce qui leur laisse leur ferme.
        if (encadres > 0) {
          throw conflict(`${encadres} formation(s) en cours : terminez-les d’abord`);
        }
        await db.trainingCenter.delete({ where: { farmId } });
      });
      return reply.status(204).send();
    },
  );

  // ─────────────────────────── Les modèles ───────────────────────────

  typed.post(
    '/api/farms/:farmId/training-center/templates',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Ajouter une ferme modèle',
        params: FarmParams,
        body: z.object({
          templateFarmId: z.number().int().positive(),
          label: z.string().trim().min(1).max(120).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { farmId, userId } = farmContext(request);
      const { templateFarmId, label } = request.body;
      const ajoute = await withoutFarmScope(async (db) => {
        await centre(db, farmId);
        await verifierModele(db, templateFarmId, userId);
        const deja = await db.trainingCenterTemplate.findUnique({
          where: {
            trainingCenterId_templateFarmId: { trainingCenterId: farmId, templateFarmId },
          },
        });
        if (deja) throw conflict('Cette ferme est déjà un modèle de ce centre');
        return db.trainingCenterTemplate.create({
          data: { trainingCenterId: farmId, templateFarmId, label: label ?? null },
        });
      });
      return reply.status(201).send(ajoute);
    },
  );

  typed.delete(
    '/api/farms/:farmId/training-center/templates/:templateFarmId',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Retirer une ferme modèle',
        params: FarmParams.extend({ templateFarmId: z.coerce.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const { templateFarmId } = request.params;
      await withoutFarmScope(async (db) => {
        const centreFerme = await centre(db, farmId);
        if (centreFerme.defaultTemplateFarmId === templateFarmId) {
          throw conflict('Le modèle par défaut ne se retire pas : désignez-en un autre d’abord');
        }
        const lien = await db.trainingCenterTemplate.findUnique({
          where: {
            trainingCenterId_templateFarmId: { trainingCenterId: farmId, templateFarmId },
          },
        });
        if (!lien) throw notFound('Ce modèle n’appartient pas à ce centre');
        await db.trainingCenterTemplate.delete({
          where: {
            trainingCenterId_templateFarmId: { trainingCenterId: farmId, templateFarmId },
          },
        });
      });
      return reply.status(204).send();
    },
  );

  // ─────────────────────────── Les apprenants ───────────────────────────

  typed.get(
    '/api/farms/:farmId/training-center/students',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Fermes d’apprenants',
        params: FarmParams,
        // `z.stringbool()` et non `z.coerce.boolean()` : dans une chaîne de requête, tout
        // arrive en texte, et `Boolean('false')` vaut `true`. Demander les formations en
        // cours renvoyait donc les formations terminées — une liste vide, sans erreur.
        querystring: z.object({ ended: z.stringbool().optional() }),
      },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      const { ended } = request.query;
      return withoutFarmScope(async (db) => {
        await centre(db, farmId);
        const fermes = await db.studentFarm.findMany({
          where: {
            trainingCenterId: farmId,
            ...(ended === undefined ? {} : ended ? { NOT: { endedAt: null } } : { endedAt: null }),
          },
          include: {
            farm: {
              select: {
                id: true,
                name: true,
                slug: true,
                trialExpiryDate: true,
                owner: { select: { id: true, email: true } },
              },
            },
            templateFarm: { select: { id: true, name: true } },
          },
          orderBy: { insertedAt: 'desc' },
        });
        // L'apprenant peut n'avoir pas encore accepté : on montre alors l'adresse invitée,
        // faute de quoi la liste afficherait une ferme sans personne.
        const invitations = await db.invitation.findMany({
          where: { farmId: { in: fermes.map((ferme) => ferme.farmId) } },
          select: { farmId: true, email: true },
        });
        const invite = new Map(invitations.map((i) => [i.farmId, i.email]));
        return fermes.map((ferme) => ({
          ...ferme,
          pendingEmail: ferme.farm.owner ? null : (invite.get(ferme.farmId) ?? null),
        }));
      });
    },
  );

  typed.post(
    '/api/farms/:farmId/training-center/students',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Créer une ferme d’apprenant par duplication d’un modèle',
        params: FarmParams,
        body: z.object({
          email: z.email(),
          name: z.string().trim().min(1).max(120).optional(),
          templateFarmId: z.number().int().positive().optional(),
          trainingDays: z.number().int().positive().max(3_650).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { farmId, userId } = farmContext(request);
      const adresse = request.body.email.trim().toLowerCase();

      const cree = await withoutFarmScope(async (db) => {
        const centreFerme = await centre(db, farmId);
        const modeleId = request.body.templateFarmId ?? centreFerme.defaultTemplateFarmId;
        const lien = await db.trainingCenterTemplate.findUnique({
          where: {
            trainingCenterId_templateFarmId: {
              trainingCenterId: farmId,
              templateFarmId: modeleId,
            },
          },
        });
        if (!lien) throw badRequest('Ce modèle n’appartient pas à ce centre');

        const duree = request.body.trainingDays ?? centreFerme.defaultTrainingDuration;
        if (duree > centreFerme.maximumTrainingDuration) {
          throw badRequest(
            `La formation ne peut excéder ${centreFerme.maximumTrainingDuration} jours`,
          );
        }

        const apprenant = await db.user.findFirst({ where: { email: adresse } });
        const nom = request.body.name ?? `Ferme de ${adresse.split('@')[0]}`;
        const ferme = await createEmptyFarm(db, {
          name: nom,
          ownerId: apprenant?.id ?? null,
          trialDays: duree,
        });

        const resultat = await copierFerme(db, modeleId, ferme.id);

        // L'adhésion du formateur est ordinaire et visible. Elle est prise à la création :
        // un formateur ajouté au centre plus tard s'ajoutera aux fermes existantes comme
        // n'importe quel membre.
        const encadrants = await formateurs(db, farmId);
        for (const encadrantId of encadrants) {
          if (encadrantId === apprenant?.id) continue;
          await db.farmMembership.create({
            data: { farmId: ferme.id, userId: encadrantId, role: 'manager' },
          });
        }

        // Sans compte, la ferme existe déjà et l'attend : l'invitation au rôle `owner` lui
        // en donnera la propriété à l'acceptation.
        let invitation: { invitationId: string } | null = null;
        if (!apprenant) {
          invitation = await db.invitation.create({
            data: {
              farmId: ferme.id,
              inviterId: userId,
              email: adresse,
              role: 'owner',
              invitationId: randomUUID(),
            },
          });
        }

        const rattachement = await db.studentFarm.create({
          data: {
            farmId: ferme.id,
            trainingCenterId: farmId,
            templateFarmId: modeleId,
          },
        });

        return { ferme, resultat, invitation, rattachement };
      });

      if (cree.invitation) {
        await app.mailer.send(
          invitationMail({
            to: adresse,
            farmName: cree.ferme.name,
            inviterEmail: request.currentUser!.email,
            url: `${app.appUrl}/invitation/${cree.invitation.invitationId}`,
          }),
        );
      }

      return reply.status(201).send({
        ...cree.rattachement,
        farm: cree.ferme,
        copied: cree.resultat.lignes,
        invitation: cree.invitation,
      });
    },
  );

  typed.post(
    '/api/farms/:farmId/training-center/students/:studentFarmId/end',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Terminer une formation : l’apprenant garde sa ferme',
        params: FarmParams.extend({ studentFarmId: z.coerce.number().int().positive() }),
        body: z.object({ extendTrialDays: z.number().int().min(0).max(3_650).optional() }),
      },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      const { studentFarmId } = request.params;
      return withoutFarmScope(async (db) => {
        const rattachement = await db.studentFarm.findFirst({
          where: { farmId: studentFarmId, trainingCenterId: farmId },
          include: { farm: { select: { ownerId: true } } },
        });
        if (!rattachement) throw notFound('Cette ferme n’est pas un apprenant de ce centre');
        if (rattachement.endedAt) throw conflict('Cette formation est déjà terminée');

        // Les formateurs perdent l'accès : l'encadrement s'arrête avec la formation. Tout
        // autre membre — un camarade que l'apprenant a invité — reste, c'est sa ferme.
        const equipeCentre = await formateurs(db, farmId);
        await db.farmMembership.deleteMany({
          where: {
            farmId: studentFarmId,
            userId: { in: equipeCentre.filter((id) => id !== rattachement.farm.ownerId) },
          },
        });

        if (request.body.extendTrialDays) {
          await db.farm.update({
            where: { id: studentFarmId },
            data: {
              trialExpiryDate: new Date(Date.now() + request.body.extendTrialDays * JOUR),
            },
          });
        }

        return db.studentFarm.update({
          where: { farmId: studentFarmId },
          data: { endedAt: new Date() },
        });
      });
    },
  );
}
