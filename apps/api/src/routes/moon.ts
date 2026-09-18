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
import { moonYear } from '@sillon/core';
import { withoutFarmScope } from '../tenant.js';
import { farmContext } from '../scope.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

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
      const ferme = await withoutFarmScope((db) =>
        db.farm.findUniqueOrThrow({
          where: { id: farmId },
          select: { moonConvention: true, timezone: true },
        }),
      );

      // Une année passée ne change plus : le navigateur peut la garder longtemps. On reste
      // en `private`, le calendrier dépendant des réglages de la ferme.
      reply.header('cache-control', 'private, max-age=604800');
      return moonYear(request.params.year, {
        convention: ferme.moonConvention,
        timeZone: ferme.timezone,
      });
    },
  );
}
