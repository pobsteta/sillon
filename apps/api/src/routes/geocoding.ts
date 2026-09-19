// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Recherche d'adresse (lot 1 de `brief/carte-du-jardin.md`).
//
// **C'est le seul endroit où Sillon parle à l'extérieur.** Chercher une adresse, c'est
// envoyer celle de la ferme à un tiers ; pour une exploitation individuelle, c'est une
// donnée personnelle. Trois conséquences, toutes visibles dans ce fichier :
//
// 1. la requête passe par le **serveur** et non par le navigateur — un seul endroit à
//    éteindre, un seul endroit qui s'identifie, et rien à ouvrir dans la CSP ;
// 2. elle ne part que sur **demande explicite** : aucune route ne géocode en arrière-plan,
//    et l'interface n'appelle pas à la frappe ;
// 3. elle **s'éteint** (`GEOCODING=none`), auquel cas on saisit ses coordonnées à la main
//    et rien ne sort.
//
// Sillon retire par ailleurs les coordonnées GPS des photos de notes (`images.ts`). Poser
// une position volontairement et ne pas la prélever à l'insu de quelqu'un ne se
// contredisent pas : c'est la même règle vue des deux côtés.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { arrondirCoordonnee, isLatitude, isLongitude } from '@sillon/core';
import { badRequest } from '../errors.js';
import type { Env } from '../env.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

/** Ce que l'interface reçoit : le strict nécessaire pour poser un point sur une carte. */
export interface Adresse {
  label: string;
  latitude: number;
  longitude: number;
  /** Confiance annoncée par le service, de 0 à 1. Affichée, jamais interprétée. */
  score: number;
  postcode: string | null;
  city: string | null;
}

interface ReponseBan {
  features?: {
    properties?: { label?: string; score?: number; postcode?: string; city?: string };
    geometry?: { coordinates?: [number, number] };
  }[];
}

/**
 * Traduit la réponse de la Base Adresse Nationale.
 *
 * La BAN parle GeoJSON : ses coordonnées sont en `[longitude, latitude]`. Les remettre dans
 * l'ordre est le seul travail de cette fonction, et c'est celui qui compte — une inversion
 * ici placerait chaque ferme française au large de la Somalie, sans erreur ni message.
 */
export function lireBan(charge: unknown): Adresse[] {
  const reponse = charge as ReponseBan;
  const adresses: Adresse[] = [];

  for (const trait of reponse.features ?? []) {
    const coordonnees = trait.geometry?.coordinates;
    const label = trait.properties?.label;
    if (!coordonnees || !label) continue;
    const [longitude, latitude] = coordonnees;
    if (!isLatitude(latitude) || !isLongitude(longitude)) continue;

    adresses.push({
      label,
      latitude: arrondirCoordonnee(latitude),
      longitude: arrondirCoordonnee(longitude),
      score: trait.properties?.score ?? 0,
      postcode: trait.properties?.postcode ?? null,
      city: trait.properties?.city ?? null,
    });
  }
  return adresses;
}

export async function geocodingRoutes(app: FastifyInstance, options: { env: Env }): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/farms/:farmId/geocode',
    {
      // Un rôle d'encadrement : poser la position de la ferme est un réglage, et la
      // recherche fait sortir une donnée.
      onRequest: app.requireFarm('manager'),
      schema: {
        tags: ['carte'],
        summary: 'Chercher une adresse pour situer la ferme',
        params: FarmParams,
        querystring: z.object({
          q: z.string().trim().min(3).max(200),
          limit: z.coerce.number().int().min(1).max(10).default(5),
        }),
      },
    },
    async (request) => {
      if (options.env.GEOCODING === 'none') {
        throw badRequest('La recherche d’adresse est désactivée sur ce déploiement');
      }

      const cible = new URL(options.env.GEOCODING_URL);
      cible.searchParams.set('q', request.query.q);
      cible.searchParams.set('limit', String(request.query.limit));

      // Un délai borné : un service tiers lent ne doit pas immobiliser une requête de
      // Sillon, et l'interface préfère un échec net à une attente sans fin.
      const minuteur = AbortSignal.timeout(5_000);
      let charge: unknown;
      try {
        const reponse = await fetch(cible, {
          signal: minuteur,
          // La politique d'usage de Nominatim exige que l'application s'identifie ; la BAN
          // ne l'impose pas, mais le faire partout coûte une ligne et évite d'y penser le
          // jour où l'on branche l'autre.
          headers: { 'user-agent': 'Sillon (logiciel libre de planification maraîchère)' },
        });
        if (!reponse.ok) throw new Error(`statut ${reponse.status}`);
        charge = await reponse.json();
      } catch {
        // On ne relaie ni le message ni l'adresse du tiers : ils ne disent rien d'utile à
        // qui cherche une adresse, et le second est un détail de déploiement.
        throw badRequest('Le service de recherche d’adresse n’a pas répondu');
      }

      return { provider: options.env.GEOCODING, results: lireBan(charge) };
    },
  );
}
