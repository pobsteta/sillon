// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Semenciers proposés (lot 3 de `brief/fournisseurs-par-defaut.md`).
//
// Une ferme créée avant que cette liste n'existe n'a rien : `seedFarmReference()` ne tourne
// qu'à la création. Plutôt qu'une migration qui écrirait dans le référentiel de chacun sans
// rien demander, c'est un geste **offert** : on propose, la ferme accepte ou non. Écrire
// dans les données de quelqu'un sans le lui demander est exactement ce qu'on ne fait pas.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SUGGESTED_PROVIDERS } from '../reference-data.js';
import { ajouterSemenciersProposes } from '../farm-setup.js';
import { withFarm } from '../tenant.js';
import { farmContext } from '../scope.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['référentiel'];

  typed.get(
    '/api/farms/:farmId/providers/suggested',
    {
      onRequest: app.requireFarm('employee'),
      schema: { tags, summary: 'Semenciers proposés, et ceux qui manquent', params: FarmParams },
    },
    async (request) => {
      const { farmId } = farmContext(request);
      return withFarm(farmId, async (db) => {
        // Même reconnaissance que l'ajout — nom **ou** adresse — sans quoi l'écran
        // annoncerait « absent » une maison que la ferme a simplement renommée, et le
        // bouton ne ferait rien de ce qu'il promet.
        // Les adresses connues seulement : une maison sans site n'en apporte pas, et un
        // `in` contenant `undefined` ne veut rien dire.
        const adresses = SUGGESTED_PROVIDERS.map((s) => s.url).filter(
          (url): url is string => typeof url === 'string',
        );
        const presents = await db.provider.findMany({
          where: {
            farmId,
            OR: [
              { name: { in: SUGGESTED_PROVIDERS.map((s) => s.name) } },
              ...(adresses.length > 0 ? [{ url: { in: adresses } }] : []),
            ],
          },
          select: { name: true, type: true, url: true },
        });
        return SUGGESTED_PROVIDERS.map(({ name, type, url }) => ({
          name,
          type,
          url: url ?? null,
          present: presents.some((p) => p.type === type && (p.name === name || p.url === url)),
        }));
      });
    },
  );

  typed.post(
    '/api/farms/:farmId/providers/suggested',
    {
      onRequest: app.requireFarm('manager'),
      schema: {
        tags,
        summary: 'Ajouter les semenciers proposés qui manquent',
        params: FarmParams,
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const locale = request.currentUser!.locale;
      const ajoutes = await withFarm(farmId, (db) => ajouterSemenciersProposes(db, farmId, locale));
      // Rien à ajouter n'est pas une erreur : le geste est idempotent, et le redire est la
      // réponse juste à quelqu'un qui appuie deux fois.
      return reply.status(ajoutes.length > 0 ? 201 : 200).send({ added: ajoutes });
    },
  );
}
