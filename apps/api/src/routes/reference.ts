// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Référentiel paramétrable de la ferme : familles → espèces → variétés, fournisseurs,
// unités, plaques, étiquettes, et la hiérarchie type → méthode → outil des tâches.
// Toutes ces ressources suivent le même cycle de vie ; une fabrique évite d'écrire
// dix fois le même CRUD.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inFarm } from '../scope.js';
import { notFound } from '../errors.js';
import { assertReferences, type ReferenceKind } from '../references.js';
import type { Tx } from '../db.js';

/**
 * Vue minimale d'un délégué Prisma. Les arguments sont volontairement non typés :
 * c'est le seul endroit de l'API où l'on renonce au typage fin, en échange d'un CRUD
 * unique pour dix ressources dont les schémas Zod, eux, restent stricts.
 */
interface SimpleDelegate {
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

interface ResourceOptions {
  /** Segment d'URL, par exemple `families`. */
  path: string;
  /** Nom affiché dans les messages d'erreur. */
  label: string;
  delegate: (db: Tx) => SimpleDelegate;
  create: z.ZodType;
  update: z.ZodType;
  orderBy?: unknown;
  include?: unknown;
  /** Filtres de liste supportés, validés puis passés tels quels à `where`. */
  filters?: z.ZodType;
  /**
   * Champs du corps qui citent une autre ressource, avec la nature de celle-ci.
   * Chacun est relu dans la ferme courante avant l'écriture : une clé étrangère
   * est globale, elle accepterait sans cela une ligne d'une autre ferme.
   */
  references?: Record<string, ReferenceKind>;
}

const IdParams = z.object({
  farmId: z.coerce.number().int().positive(),
  id: z.coerce.number().int().positive(),
});

export function registerResource(app: FastifyInstance, options: ResourceOptions): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const base = `/api/farms/:farmId/${options.path}`;
  const tags = ['référentiel'];

  const checkReferences = async (db: Tx, body: Record<string, unknown>): Promise<void> => {
    if (!options.references) return;
    const cited: Partial<Record<ReferenceKind, (number | null | undefined)[]>> = {};
    for (const [field, kind] of Object.entries(options.references)) {
      if (body[field] === undefined) continue;
      (cited[kind] ??= []).push(body[field] as number | null);
    }
    await assertReferences(db, cited);
  };

  typed.get(
    base,
    {
      onRequest: app.requireFarm('employee'),
      schema: {
        tags,
        summary: `Lister : ${options.label}`,
        querystring: options.filters ?? z.object({}),
      },
    },
    async (request) =>
      inFarm(request, (db, { farmId }) =>
        options.delegate(db).findMany({
          where: { farmId, ...(request.query as Record<string, unknown>) },
          orderBy: options.orderBy ?? { name: 'asc' },
          include: options.include,
        }),
      ),
  );

  typed.post(
    base,
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: `Créer : ${options.label}`, body: options.create },
    },
    async (request, reply) => {
      const created = await inFarm(request, async (db, { farmId }) => {
        const body = request.body as Record<string, unknown>;
        await checkReferences(db, body);
        return options.delegate(db).create({
          data: { ...body, farmId },
          include: options.include,
        });
      });
      return reply.status(201).send(created);
    },
  );

  typed.patch(
    `${base}/:id`,
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: `Modifier : ${options.label}`,
        params: IdParams,
        body: options.update,
      },
    },
    async (request) =>
      inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await options.delegate(db).findFirst({ where: { id, farmId } });
        if (!existing) throw notFound(`${options.label} introuvable`);
        const body = request.body as Record<string, unknown>;
        await checkReferences(db, body);
        return options.delegate(db).update({
          where: { id },
          data: body,
          include: options.include,
        });
      }),
  );

  typed.delete(
    `${base}/:id`,
    {
      onRequest: app.requireFarm('manager'),
      schema: { tags, summary: `Supprimer : ${options.label}`, params: IdParams },
    },
    async (request, reply) => {
      await inFarm(request, async (db, { farmId }) => {
        const { id } = request.params;
        const existing = await options.delegate(db).findFirst({ where: { id, farmId } });
        if (!existing) throw notFound(`${options.label} introuvable`);
        return options.delegate(db).delete({ where: { id } });
      });
      return reply.status(204).send();
    },
  );
}

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format #rrggbb')
  .default('#4d7c0f');
const name = z.string().trim().min(1).max(120);
/**
 * Le site d'un fournisseur. Restreint à http(s) : la colonne devient un lien cliquable, et
 * un `javascript:` s'y glisserait sans cela — la personne qui saisit n'est pas forcément
 * celle qui clique.
 */
const url = z
  .string()
  .trim()
  .max(500)
  .refine((valeur) => /^https?:\/\//i.test(valeur), { message: 'Adresse http(s) attendue' });
const notes = z.string().trim().max(2000);
/** Ce qu'on récolte de l'espèce, pour le calendrier lunaire (`brief/jardinage-lunaire.md` §4). */
const harvestedPart = z.enum(['root', 'leaf', 'flower', 'fruit']);

export async function referenceRoutes(app: FastifyInstance): Promise<void> {
  registerResource(app, {
    path: 'families',
    label: 'Famille botanique',
    delegate: (db) => db.family as unknown as SimpleDelegate,
    // `interval` est le délai de retour sur une même planche, en années — vérifié dans
    // `locations_live.ex`, qui compare `écart en jours / 365` à cette valeur.
    create: z.object({ name, color, interval: z.number().int().min(0).max(20).default(3) }),
    update: z.object({
      name: name.optional(),
      color: color.optional(),
      interval: z.number().int().min(0).max(20).optional(),
    }),
  });

  registerResource(app, {
    path: 'crops',
    label: 'Espèce',
    delegate: (db) => db.crop as unknown as SimpleDelegate,
    create: z.object({
      name,
      color,
      familyId: z.number().int().positive(),
      defaultVarietyId: z.number().int().positive().nullish(),
      harvestedPart: harvestedPart.nullish(),
    }),
    update: z.object({
      name: name.optional(),
      color: color.optional(),
      familyId: z.number().int().positive().optional(),
      defaultVarietyId: z.number().int().positive().nullish(),
      harvestedPart: harvestedPart.nullish(),
    }),
    include: { family: true },
    filters: z.object({ familyId: z.coerce.number().int().positive().optional() }),
    references: { familyId: 'family', defaultVarietyId: 'variety' },
  });

  registerResource(app, {
    path: 'providers',
    label: 'Fournisseur',
    delegate: (db) => db.provider as unknown as SimpleDelegate,
    create: z.object({
      name,
      type: z.enum(['seed', 'transplant']).default('seed'),
      url: url.nullish(),
      notes: notes.nullish(),
    }),
    update: z.object({
      name: name.optional(),
      type: z.enum(['seed', 'transplant']).optional(),
      url: url.nullish(),
      notes: notes.nullish(),
    }),
  });

  registerResource(app, {
    path: 'varieties',
    label: 'Variété',
    delegate: (db) => db.variety as unknown as SimpleDelegate,
    create: z.object({
      name,
      cropId: z.number().int().positive(),
      providerId: z.number().int().positive(),
    }),
    update: z.object({
      name: name.optional(),
      cropId: z.number().int().positive().optional(),
      providerId: z.number().int().positive().optional(),
    }),
    include: { crop: true, provider: true },
    filters: z.object({
      cropId: z.coerce.number().int().positive().optional(),
      providerId: z.coerce.number().int().positive().optional(),
    }),
    references: { cropId: 'crop', providerId: 'provider' },
  });

  registerResource(app, {
    path: 'units',
    label: 'Unité',
    delegate: (db) => db.unit as unknown as SimpleDelegate,
    create: z.object({ name }),
    update: z.object({ name: name.optional() }),
  });

  registerResource(app, {
    path: 'containers',
    label: 'Plaque de semis',
    delegate: (db) => db.container as unknown as SimpleDelegate,
    create: z.object({ name, size: z.number().int().positive().max(2000) }),
    update: z.object({
      name: name.optional(),
      size: z.number().int().positive().max(2000).optional(),
    }),
  });

  registerResource(app, {
    path: 'tags',
    label: 'Étiquette',
    delegate: (db) => db.tag as unknown as SimpleDelegate,
    create: z.object({ name, color }),
    update: z.object({ name: name.optional(), color: color.optional() }),
  });

  registerResource(app, {
    path: 'task-types',
    label: 'Type de tâche',
    delegate: (db) => db.taskType as unknown as SimpleDelegate,
    create: z.object({ name, color }),
    update: z.object({ name: name.optional(), color: color.optional() }),
    include: { methods: { include: { implements: true } } },
  });

  registerResource(app, {
    path: 'task-methods',
    label: 'Méthode',
    delegate: (db) => db.taskMethod as unknown as SimpleDelegate,
    create: z.object({ name, typeId: z.number().int().positive() }),
    update: z.object({ name: name.optional(), typeId: z.number().int().positive().optional() }),
    filters: z.object({ typeId: z.coerce.number().int().positive().optional() }),
    references: { typeId: 'taskType' },
  });

  registerResource(app, {
    path: 'task-implements',
    label: 'Outil',
    delegate: (db) => db.taskImplement as unknown as SimpleDelegate,
    create: z.object({ name, methodId: z.number().int().positive() }),
    update: z.object({ name: name.optional(), methodId: z.number().int().positive().optional() }),
    filters: z.object({ methodId: z.coerce.number().int().positive().optional() }),
    references: { methodId: 'taskMethod' },
  });
}
