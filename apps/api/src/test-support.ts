// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Utilitaires des tests d'intégration : base vidée entre chaque fichier, application
// construite une fois, et un compte de travail déjà connecté.

import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { getPrisma } from './db.js';
import { CaptureMailer } from './mail.js';

/** Toutes les tables, ordonnées pour un TRUNCATE ... CASCADE unique. */
const TABLES = ['users', 'farms'];

export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  // TRUNCATE n'est pas soumis au RLS et suit les clés étrangères en cascade :
  // vider `users` et `farms` suffit à repartir d'une base propre.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Transport de capture partagé par les tests : rien ne part, tout s'inspecte.
 * `app.mailer` pointe dessus, donc `mailbox.sent` reflète exactement ce que l'API
 * a demandé d'envoyer.
 */
export const mailbox = new CaptureMailer();

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp(
    { NODE_ENV: 'test', APP_URL: 'https://sillon.example', TOKEN_HOURS: 24 },
    { mailer: mailbox },
  );
  await app.ready();
  return app;
}

/** Extrait le jeton d'un lien reçu par courriel. */
export function tokenFromUrl(url: string): string {
  return decodeURIComponent(url.split('/').at(-1) ?? '');
}

/** Premier lien https du corps en texte brut. */
export function urlFromMail(text: string): string {
  return /https:\/\/\S+/.exec(text)?.[0] ?? '';
}

export interface TestAccount {
  cookie: string;
  farmId: number;
  userId: number;
  email: string;
}

let accountCounter = 0;

/** Inscrit un compte, crée sa ferme et renvoie le cookie de session à rejouer. */
export async function registerAccount(
  app: FastifyInstance,
  overrides: { email?: string; farmName?: string } = {},
): Promise<TestAccount> {
  accountCounter += 1;
  const email = overrides.email ?? `maraichere${accountCounter}@example.org`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password: 'graines-de-courgette-2026',
      farmName: overrides.farmName ?? `Ferme ${accountCounter}`,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Inscription impossible : ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  const cookie = response.cookies.find((c) => c.name === 'sillon_session');
  if (!cookie) throw new Error('Cookie de session absent');
  return {
    cookie: `sillon_session=${cookie.value}`,
    farmId: body.farm.id,
    userId: body.user.id,
    email,
  };
}

/** Raccourci d'appel authentifié. */
export function as(account: TestAccount) {
  return { cookie: account.cookie };
}
