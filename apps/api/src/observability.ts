// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Remontée des erreurs (§6 du brief : « Uptime Kuma / Better Stack + Sentry »).
//
// Sans `SENTRY_DSN`, rien n'est initialisé et rien ne sort de la machine. C'est le défaut,
// et il compte : le brief promet « aucun tiers analytique » et un hébergement européen, et
// une installation auto-hébergée ne doit pas se mettre à parler à un service tiers parce
// qu'une dépendance était dans le paquet.
//
// Quand le DSN est présent, ce qui part est bridé volontairement :
//
//   * `sendDefaultPii: false` — ni adresse IP, ni cookie, ni en-tête d'authentification ;
//   * les corps de requête ne sont jamais joints. Une requête de Sillon contient des
//     rendements, des prix de vente, des adresses : les données d'exploitation d'une ferme
//     n'ont rien à faire chez un prestataire de supervision ;
//   * l'échantillonnage des traces est à zéro par défaut : seules les erreurs partent.

import * as Sentry from '@sentry/node';
import type { Env } from './env.js';

let actif = false;

/** Sentry est-il en service ? Utile aux tests et au message de démarrage. */
export function supervisionActive(): boolean {
  return actif;
}

/**
 * Initialise la remontée d'erreurs. À appeler **avant** de construire l'application : les
 * instrumentations de Sentry s'accrochent aux modules au moment où ils sont chargés.
 */
export function initSupervision(env: Env): boolean {
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    beforeSend(event) {
      // Ceinture et bretelles : même si une version de l'SDK décide un jour de joindre le
      // corps de la requête, il ne partira pas d'ici.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });

  actif = true;
  return true;
}

/** Signale une erreur si la supervision est en service ; sans effet sinon. */
export function signaler(error: unknown): void {
  if (actif) Sentry.captureException(error);
}

/** Laisse aux envois en cours le temps de partir avant l'arrêt du processus. */
export async function viderSupervision(delaiMs = 2_000): Promise<void> {
  if (actif) await Sentry.flush(delaiMs);
}
