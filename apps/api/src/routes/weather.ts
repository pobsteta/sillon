// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Météo du jour, pour la fiche du calendrier lunaire.
//
// **C'est le second endroit où Sillon parle à l'extérieur**, après la recherche d'adresse,
// et il tient les mêmes règles — pour les mêmes raisons, qui n'ont pas changé :
//
// 1. la requête passe par le **serveur** et non par le navigateur : un seul endroit à
//    éteindre, un seul endroit qui s'identifie, rien à ouvrir dans la CSP ;
// 2. elle **s'éteint** (`WEATHER=none`), et la fiche du jour s'affiche alors sans météo —
//    diminuée, jamais cassée ;
// 3. elle part avec des coordonnées **arrondies au centième de degré**, environ un
//    kilomètre. C'est la précision que la météo mérite, et elle ne livre pas la parcelle.
//
// Trois choses à savoir avant d'y toucher. La météo est **hors périmètre V1** du brief
// général (§3.8) : elle est ici sur demande explicite, tranchée le 20 septembre 2026, et le
// réglage d'extinction est ce qui rend cette entorse réversible. Open-Meteo ne couvre
// qu'une fenêtre autour d'aujourd'hui — au-delà, la route rend `null` plutôt qu'une
// prévision inventée. Et **rien ici n'est stocké** : la réponse traverse, elle ne se
// range pas en base.
//
// Les températures voyagent en **dixièmes de degré**, les hauteurs d'eau en dixièmes de
// millimètre, les vitesses en dixièmes de km/h : des entiers, comme tout le reste du dépôt.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { isIsoDate, today } from '@sillon/core';
import { withoutFarmScope } from '../tenant.js';
import { farmContext } from '../scope.js';
import type { Env } from '../env.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

/**
 * Fenêtre servie, en jours autour d'aujourd'hui.
 *
 * Open-Meteo prévoit seize jours et garde quelques mois d'archive sur la même route. On
 * reste en deçà des deux bornes : une prévision à quinze jours n'a plus de valeur
 * d'information, et la fiche d'une journée de mars consultée en septembre doit dire
 * « pas de météo » plutôt qu'une valeur dont personne ne saurait ce qu'elle vaut.
 */
const PASSE_MAX = 60;
const AVENIR_MAX = 14;

/** Ce que l'interface reçoit. Tout en entiers ; `null` quand la donnée manque. */
export interface Meteo {
  date: string;
  /** Code WMO 4677, tel qu'Open-Meteo le rend. Traduit en pictogramme par l'interface. */
  weatherCode: number | null;
  /** Dixièmes de degré Celsius. */
  temperatureMax: number | null;
  temperatureMin: number | null;
  /** Température relevée à l'instant ; seulement pour aujourd'hui, `null` sinon. */
  temperatureNow: number | null;
  /** Dixièmes de millimètre. */
  precipitation: number | null;
  /** Dixièmes de km/h. */
  windMax: number | null;
}

interface ReponseOpenMeteo {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
  current?: { temperature_2m?: number | null };
}

/** Un flottant d'Open-Meteo en dixièmes, ou `null`. Les entiers sont la règle du dépôt. */
const dixiemes = (valeur: number | null | undefined): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? Math.round(valeur * 10) : null;

/**
 * Traduit la réponse d'Open-Meteo pour la date demandée.
 *
 * **La date est retrouvée dans `daily.time`, jamais supposée en première position.** Le
 * service peut décaler la fenêtre qu'il rend — fuseau, heure d'été, bornes hors couverture
 * — et lire l'indice zéro afficherait alors la météo de la veille sous le bon titre, ce
 * qui est indétectable à l'œil.
 */
export function lireOpenMeteo(charge: unknown, date: string): Meteo {
  const reponse = charge as ReponseOpenMeteo;
  const quotidien = reponse.daily;
  const index = quotidien?.time?.indexOf(date) ?? -1;
  const vide: Meteo = {
    date,
    weatherCode: null,
    temperatureMax: null,
    temperatureMin: null,
    temperatureNow: null,
    precipitation: null,
    windMax: null,
  };
  if (!quotidien || index < 0) return vide;

  return {
    date,
    weatherCode: quotidien.weather_code?.[index] ?? null,
    temperatureMax: dixiemes(quotidien.temperature_2m_max?.[index]),
    temperatureMin: dixiemes(quotidien.temperature_2m_min?.[index]),
    // Une température « à l'instant » n'a de sens qu'aujourd'hui : la coller sur une autre
    // journée donnerait un relevé faux sous une date juste.
    temperatureNow: date === today() ? dixiemes(reponse.current?.temperature_2m) : null,
    precipitation: dixiemes(quotidien.precipitation_sum?.[index]),
    windMax: dixiemes(quotidien.wind_speed_10m_max?.[index]),
  };
}

/** Écart en jours entre deux dates ISO, sans dépendre du fuseau du processus. */
const ecartJours = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export async function weatherRoutes(app: FastifyInstance, options: { env: Env }): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/farms/:farmId/weather/:date',
    {
      // Simple membre : lire la météo de sa propre ferme n'engage rien.
      onRequest: app.requireMember,
      schema: {
        tags: ['lune'],
        summary: 'Météo d’une journée, si le déploiement l’a activée',
        params: FarmParams.extend({
          date: z.string().refine(isIsoDate, 'date attendue au format AAAA-MM-JJ'),
        }),
      },
    },
    async (request, reply) => {
      const { farmId } = farmContext(request);
      const { date } = request.params;

      // Trois façons de n'avoir pas de météo, et **aucune n'est une erreur** : la fiche du
      // jour s'affiche sans elle. Un 4xx ferait clignoter un message d'échec à chaque
      // ouverture sur un déploiement qui a simplement choisi de ne pas appeler dehors.
      if (options.env.WEATHER === 'none') return reply.send(null);

      const ecart = ecartJours(today(), date);
      if (ecart < -PASSE_MAX || ecart > AVENIR_MAX) return reply.send(null);

      const ferme = await withoutFarmScope((db) =>
        db.farm.findUniqueOrThrow({
          where: { id: farmId },
          select: { latitude: true, longitude: true, timezone: true },
        }),
      );
      if (ferme.latitude === null || ferme.longitude === null) return reply.send(null);

      const cible = new URL(options.env.WEATHER_URL);
      // Arrondi au centième de degré, environ un kilomètre : la maille des modèles est
      // plus large que cela, et la parcelle ne sort pas.
      cible.searchParams.set('latitude', (Math.round(ferme.latitude * 100) / 100).toFixed(2));
      cible.searchParams.set('longitude', (Math.round(ferme.longitude * 100) / 100).toFixed(2));
      cible.searchParams.set(
        'daily',
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      );
      if (date === today()) cible.searchParams.set('current', 'temperature_2m');
      cible.searchParams.set('timezone', ferme.timezone);
      cible.searchParams.set('start_date', date);
      cible.searchParams.set('end_date', date);

      let charge: unknown;
      try {
        const reponse = await fetch(cible, {
          // Borné, comme le géocodage : un service tiers lent ne doit pas immobiliser une
          // requête de Sillon, et la fiche du jour préfère s'afficher sans météo.
          signal: AbortSignal.timeout(5_000),
          headers: { 'user-agent': 'Sillon (logiciel libre de planification maraîchère)' },
        });
        if (!reponse.ok) return reply.send(null);
        charge = await reponse.json();
      } catch {
        return reply.send(null);
      }

      // Une heure : la météo bouge, mais pas au point de justifier un appel par affichage.
      reply.header('cache-control', 'private, max-age=3600');
      return reply.send(lireOpenMeteo(charge, date));
    },
  );
}
