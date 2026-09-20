// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calendrier lunaire : une année, d'un coup.
//
// La forme retenue par le brief (§5) : le serveur calcule, l'interface demande une fois,
// le service worker garde. Sillon travaille au champ, sur un réseau qui hoquette — un
// calendrier lunaire qui exigerait un appel réseau serait inutilisable là où il sert.
//
// Le calcul lui-même est dans `@sillon/core` : des fonctions du temps vers une
// qualification, sans base ni navigateur, éprouvées contre des références publiées.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { isIsoDate, moonDayDetail, moonYear, type IsoDate } from '@sillon/core';
import { withoutFarmScope } from '../tenant.js';
import { farmContext } from '../scope.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

/** Réglages de la ferme dont dépend la qualification. Lus une fois, partagés par les deux routes. */
async function reglages(farmId: number) {
  return withoutFarmScope((db) =>
    db.farm.findUniqueOrThrow({
      where: { id: farmId },
      select: { moonConvention: true, timezone: true, latitude: true, longitude: true },
    }),
  );
}

export async function moonRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/farms/:farmId/moon/:year',
    {
      onRequest: app.requireMember,
      schema: {
        tags: ['lune'],
        summary: 'Qualification lunaire d’une année',
        params: FarmParams.extend({
          // Bornes larges mais finies : au-delà, les éphémérides perdent en précision et
          // la requête n'a plus de sens agronomique.
          year: z.coerce.number().int().min(1900).max(2100),
        }),
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const ferme = await reglages(farmId);

      // Une année passée ne change plus : le navigateur peut la garder longtemps. On reste
      // en `private`, le calendrier dépendant des réglages de la ferme.
      reply.header('cache-control', 'private, max-age=604800');
      return moonYear(request.params.year, {
        convention: ferme.moonConvention,
        timeZone: ferme.timezone,
      });
    },
  );

  /**
   * La fiche d'une journée : ce que l'année porte, plus ce qui dépend du **lieu**.
   *
   * Une route à part, et non un enrichissement de l'année. Les levers et couchers
   * supposent un observateur, et les calculer pour 365 jours alourdirait d'autant la
   * charge que le service worker garde — le poids du calendrier hors ligne est un
   * engagement du brief (§5). Cette fiche-ci ne se demande que pour la journée qu'on
   * ouvre, et c'est la seule raison pour laquelle elle peut se permettre d'être chère.
   */
  typed.get(
    '/api/farms/:farmId/moon/day/:date',
    {
      onRequest: app.requireMember,
      schema: {
        tags: ['lune'],
        summary: 'Fiche d’une journée lunaire',
        params: FarmParams.extend({
          date: z.string().refine(isIsoDate, 'date attendue au format AAAA-MM-JJ'),
        }),
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const ferme = await reglages(farmId);

      // Plus court que l'année : la fiche dépend de la position de la ferme, qu'on peut
      // poser ou déplacer d'un jour à l'autre. Une journée gardée une semaine afficherait
      // encore les heures de l'ancienne adresse.
      reply.header('cache-control', 'private, max-age=86400');
      return moonDayDetail(request.params.date as IsoDate, {
        convention: ferme.moonConvention,
        timeZone: ferme.timezone,
        latitude: ferme.latitude,
        longitude: ferme.longitude,
      });
    },
  );
}
