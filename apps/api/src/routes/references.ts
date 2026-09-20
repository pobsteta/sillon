// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Valeurs de référence (lot A de `specs/brief-sillon-references-microfermes.md`).
//
// **Le principe directeur du brief, tenu ici** : les références ne remplacent jamais les
// données de la ferme. Cette route **lit** ; rien dans Sillon n'écrit dans ces tables, en
// dehors du seed. Elles ne portent d'ailleurs aucun `farm_id` — ce sont des faits publiés,
// identiques pour tout le monde.
//
// **Pourquoi une route sous `/farms/:farmId` pour des données qui n'appartiennent à aucune
// ferme.** Le brief écrivait `GET /references?species_id=`. Mais une espèce de Sillon est
// **par ferme** : l'identifiant 42 ne désigne pas la même culture d'une ferme à l'autre.
// Résoudre `speciesId` exige donc un contexte de ferme, et le donner ailleurs obligerait
// l'appelant à traduire lui-même — c'est-à-dire à recopier `cropKeysFor` dans l'interface.
// La route est sous la ferme ; la donnée servie reste globale, et le dit.
//
// **Chaque valeur part avec sa source.** Une référence sans provenance affichable est une
// affirmation : l'interface doit pouvoir écrire « réf. Pépinière-Mesclun 2023 » et donner
// la licence au survol, sans second appel.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CONDUITES, cropKeysFor, METRIQUES_FERME, SYSTEMES } from '@sillon/core';
import { withFarm, withoutFarmScope } from '../tenant.js';
import { farmContext } from '../scope.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

const Query = z.object({
  /** Espèce **de cette ferme**. Traduite en clés de culture par le noyau. */
  speciesId: z.coerce.number().int().positive().optional(),
  /** Clé de culture directe, pour l'écran qui rattache une espèce à la main. */
  cropKey: z.string().min(1).max(100).optional(),
  sourceId: z.string().min(1).max(100).optional(),
  conduite: z.enum(CONDUITES).optional(),
  systeme: z.enum(SYSTEMES).optional(),
});

export async function referenceValueRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/farms/:farmId/references',
    {
      // Simple membre : lire des références publiées n'engage rien et n'expose aucune
      // donnée de ferme.
      onRequest: app.requireMember,
      schema: {
        tags: ['références'],
        summary: 'Valeurs de référence issues de la recherche, pour une espèce ou une clé',
        params: FarmParams,
        querystring: Query,
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const query = request.query;

      /**
       * Les clés visées. Une espèce en vaut souvent plusieurs — les sources séparent ce
       * que Sillon réunit, « pomme de terre primeur » et « de conservation » par exemple —
       * et n'en retenir qu'une ferait disparaître l'autre sans rien dire.
       */
      let cles: string[] | null = null;
      if (query.cropKey) cles = [query.cropKey];
      else if (query.speciesId !== undefined) {
        // Sous la portée de la ferme : la politique d'isolation garantit qu'on ne lit pas
        // l'espèce d'une autre ferme, même avec un identifiant deviné.
        const espece = await withFarm(farmId, (db) =>
          db.crop.findUnique({ where: { id: query.speciesId }, select: { name: true } }),
        );
        // Espèce inconnue de cette ferme : une liste vide, et non une erreur. L'appel vient
        // d'un écran qui affiche des suggestions, et une 404 y ferait clignoter un échec.
        cles = espece ? cropKeysFor(espece.name) : [];
      }

      // Aucune clé ne correspond : l'espèce n'est pas au vocabulaire des sources. On le
      // dit franchement, pour que l'écran propose un rattrapage à la main (« fallback
      // manuel côté UI », brief lot 0) plutôt que d'afficher un vide sans explication.
      //
      // À ne pas confondre avec « rattachée, mais aucune source ne la couvre » : c'est le
      // cas plus bas, où `cropKeys` est rempli et `values` vide. Les deux appellent des
      // messages différents — proposer un rattachement, ou dire qu'on ne sait rien.
      if (cles !== null && cles.length === 0) {
        reply.header('cache-control', 'private, max-age=3600');
        return { matched: false, cropKeys: [], values: [] };
      }

      const valeurs = await withoutFarmScope((db) =>
        db.referenceValue.findMany({
          where: {
            ...(cles ? { cropKey: { in: cles } } : {}),
            ...(query.sourceId ? { sourceId: query.sourceId } : {}),
          },
          include: {
            source: {
              select: {
                id: true,
                titre: true,
                auteurs: true,
                annee: true,
                url: true,
                licence: true,
              },
            },
          },
          orderBy: [{ cropKey: 'asc' }, { sourceId: 'asc' }],
        }),
      );

      // `conduite` et `systeme` vivent dans le JSON du contexte : Prisma ne sait pas les
      // filtrer de façon portable, et le volume — quelques centaines de lignes — ne
      // justifie ni une colonne dédiée ni un index d'expression.
      const contexteDe = (valeur: (typeof valeurs)[number]) =>
        valeur.context as { abri: boolean | null; systeme: string; conduite: string | null };
      const retenues = valeurs.filter((valeur) => {
        const contexte = contexteDe(valeur);
        if (query.conduite && contexte.conduite !== query.conduite) return false;
        if (query.systeme && contexte.systeme !== query.systeme) return false;
        return true;
      });

      // Publiées et immuables entre deux seeds : le navigateur peut les garder, et le
      // service worker avec lui — le champ n'a pas de réseau.
      reply.header('cache-control', 'private, max-age=86400');
      return {
        /** Des valeurs ont été trouvées. `cropKeys` dit si l'espèce était rattachée. */
        matched: retenues.length > 0,
        cropKeys: cles ?? [],
        values: retenues.map((valeur) => ({
          id: valeur.id,
          cropKey: valeur.cropKey,
          context: valeur.context,
          /** Millièmes de kg/m², secondes pour 100 m², centimes par kg. */
          yield: valeur.yieldMilliKgM2,
          labor: valeur.laborSeconds100m2,
          price: valeur.priceCentsKg,
          n: valeur.n,
          pageRef: valeur.pageRef,
          notes: valeur.notes,
          source: valeur.source,
        })),
      };
    },
  );

  /**
   * Les repères d'exploitation : surface par équivalent temps plein, et le reste.
   *
   * Une route à part de celle des cultures, comme la table l'est de l'autre. Les deux
   * répondent à des questions différentes — « que rend une carotte » et « combien de
   * surface un temps plein tient » — et les servir ensemble obligerait chaque appelant à
   * trier ce qui ne le regarde pas.
   */
  typed.get(
    '/api/farms/:farmId/references/farm',
    {
      onRequest: app.requireMember,
      schema: {
        tags: ['références'],
        summary: 'Repères à l’échelle de l’exploitation',
        params: FarmParams,
        querystring: z.object({
          metric: z.enum(METRIQUES_FERME).optional(),
          systeme: z.enum(SYSTEMES).optional(),
        }),
      },
    },
    async (request, reply) => {
      const reperes = await withoutFarmScope((db) =>
        db.referenceFarmValue.findMany({
          where: request.query.metric ? { metric: request.query.metric } : {},
          include: {
            source: {
              select: {
                id: true,
                titre: true,
                auteurs: true,
                annee: true,
                url: true,
                licence: true,
              },
            },
          },
          orderBy: [{ metric: 'asc' }, { sourceId: 'asc' }],
        }),
      );

      const retenus = request.query.systeme
        ? reperes.filter(
            (repere) => (repere.context as { systeme: string }).systeme === request.query.systeme,
          )
        : reperes;

      reply.header('cache-control', 'private, max-age=86400');
      return retenus.map((repere) => ({
        id: repere.id,
        metric: repere.metric,
        context: repere.context,
        /** L'unité dépend de la métrique : voir `farmMetricToStorage` dans le noyau. */
        range: repere.range,
        n: repere.n,
        pageRef: repere.pageRef,
        notes: repere.notes,
        source: repere.source,
      }));
    },
  );

  typed.get(
    '/api/farms/:farmId/references/sources',
    {
      onRequest: app.requireMember,
      schema: {
        tags: ['références'],
        summary: 'Sources des valeurs de référence, avec leur licence',
        params: FarmParams,
      },
    },
    async (_request, reply) => {
      const sources = await withoutFarmScope((db) =>
        db.referenceSource.findMany({ orderBy: { id: 'asc' } }),
      );
      reply.header('cache-control', 'private, max-age=86400');
      // Les sources sans valeur sont servies aussi : leur en-tête dit pourquoi elles sont
      // vides — une licence incompatible, par exemple — et c'est une information.
      return sources;
    },
  );
}
