// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Second facteur, de bout en bout sur une vraie base : préparer, activer, se connecter,
// épuiser un code de secours, désactiver. Les chemins qui comptent sont les refus.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { codePour, depuisBase32, pasCourant } from './totp.js';
import { createTestApp, registerAccount, resetDatabase, type TestAccount } from './test-support.js';

let app: FastifyInstance;
let compte: TestAccount;
const motDePasse = 'graines-de-courgette-2026';

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'totp@example.org' });
});

afterAll(async () => {
  await app?.close();
});

/** Prépare le secret et rend le code valable à cet instant. */
async function preparer(): Promise<{ secret: Buffer; code: () => string }> {
  const reponse = await app.inject({
    method: 'POST',
    url: '/api/auth/totp/setup',
    headers: { cookie: compte.cookie },
  });
  expect(reponse.statusCode).toBe(200);
  const secret = depuisBase32(reponse.json().secret);
  return { secret, code: () => codePour(secret, pasCourant()) };
}

const connexion = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload });

/** Remet le compte sans second facteur. Sans effet s'il n'y en avait pas. */
const desactiver = () =>
  app.inject({
    method: 'POST',
    url: '/api/auth/totp/disable',
    headers: { cookie: compte.cookie },
    payload: { password: motDePasse },
  });

describe('activation du second facteur', () => {
  it('prépare un secret sans rien changer à la connexion', async () => {
    const { code } = await preparer();

    // Tant que le code n'a pas été vérifié, le second facteur n'est pas actif : une
    // application mal configurée ne doit pas enfermer dehors dès l'enregistrement.
    const avant = await connexion({ email: compte.email, password: motDePasse });
    expect(avant.statusCode, 'connexion inchangée tant que rien n’est activé').toBe(200);
    expect(code()).toMatch(/^\d{6}$/);
  });

  it('rend une URI otpauth lisible par une application d’authentification', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/setup',
      headers: { cookie: compte.cookie },
    });

    const uri = new URL(reponse.json().uri);
    expect(uri.protocol).toBe('otpauth:');
    expect(decodeURIComponent(uri.pathname)).toContain('totp@example.org');
  });

  it('refuse d’activer sur un code faux', async () => {
    await preparer();

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/enable',
      headers: { cookie: compte.cookie },
      payload: { code: '000000' },
    });

    expect(reponse.statusCode).toBe(400);
  });

  it('active sur un code juste et remet dix codes de secours', async () => {
    const { code } = await preparer();

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/enable',
      headers: { cookie: compte.cookie },
      payload: { code: code() },
    });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().enabled).toBe(true);
    expect(reponse.json().recoveryCodes).toHaveLength(10);
  });
});

/** Remet un second facteur neuf et rend son secret et ses codes de secours. */
async function armer(): Promise<{ secret: Buffer; codesSecours: string[] }> {
  await desactiver();
  const prepare = await preparer();
  const active = await app.inject({
    method: 'POST',
    url: '/api/auth/totp/enable',
    headers: { cookie: compte.cookie },
    payload: { code: prepare.code() },
  });
  expect(active.statusCode).toBe(200);
  return { secret: prepare.secret, codesSecours: active.json().recoveryCodes };
}

describe('connexion avec second facteur', () => {
  it('réclame le code quand le mot de passe est bon', async () => {
    await armer();

    const reponse = await connexion({ email: compte.email, password: motDePasse });

    expect(reponse.statusCode).toBe(401);
    // Le code d'erreur est nommé : l'interface sait afficher le champ du code, et rien
    // n'est dit à qui n'a pas déjà le mot de passe.
    expect(reponse.json().error).toBe('totp_required');
  });

  it('ne réclame rien quand le mot de passe est faux', async () => {
    // Sinon la réponse dirait « ce compte existe et a un second facteur ».
    const reponse = await connexion({ email: compte.email, password: 'mauvais-mot-de-passe' });

    expect(reponse.statusCode).toBe(401);
    expect(reponse.json().error).toBe('unauthorized');
  });

  it('refuse un code faux', async () => {
    const reponse = await connexion({
      email: compte.email,
      password: motDePasse,
      totpCode: '000000',
    });

    expect(reponse.statusCode).toBe(401);
  });

  it('refuse de rejouer le code qui a servi à activer', async () => {
    // L'activation consomme le pas courant. Le même code ne doit pas ouvrir une session
    // dans la foulée : c'est la même propriété que le rejeu, au moment le plus tentant.
    const { secret } = await armer();

    const reponse = await connexion({
      email: compte.email,
      password: motDePasse,
      totpCode: codePour(secret, pasCourant()),
    });

    expect(reponse.statusCode).toBe(401);
  });

  it('ouvre la session sur un code juste', async () => {
    const { secret } = await armer();

    // Le pas suivant : celui du moment a servi à l'activation. La fenêtre de tolérance
    // l'accepte, et il est postérieur au dernier pas consommé.
    const reponse = await connexion({
      email: compte.email,
      password: motDePasse,
      totpCode: codePour(secret, pasCourant() + 1),
    });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.cookies.some((c) => c.name === 'sillon_session')).toBe(true);
  });

  it('refuse le même code une seconde fois', async () => {
    // Un code reste valable une demi-minute : intercepté, il ne doit pas resservir.
    const { secret } = await armer();
    const code = codePour(secret, pasCourant() + 1);

    const premiere = await connexion({ email: compte.email, password: motDePasse, totpCode: code });
    expect(premiere.statusCode, 'la première passe').toBe(200);

    const seconde = await connexion({ email: compte.email, password: motDePasse, totpCode: code });

    expect(seconde.statusCode, 'le rejeu est refusé').toBe(401);
  });

  it('accepte un code de secours, et une seule fois', async () => {
    const { codesSecours } = await armer();
    const code = codesSecours[0]!;

    const premiere = await connexion({ email: compte.email, password: motDePasse, totpCode: code });
    expect(premiere.statusCode, 'le code de secours ouvre la session').toBe(200);

    const seconde = await connexion({ email: compte.email, password: motDePasse, totpCode: code });
    expect(seconde.statusCode, 'il ne resservira pas').toBe(401);
  });

  it('décompte les codes de secours restants', async () => {
    const etat = await app.inject({
      method: 'GET',
      url: '/api/auth/totp',
      headers: { cookie: compte.cookie },
    });

    expect(etat.json().enabled).toBe(true);
    expect(etat.json().recoveryCodesLeft).toBe(9);
  });
});

describe('désactivation', () => {
  it('exige le mot de passe, pas seulement une session ouverte', async () => {
    // Un poste laissé sans surveillance ne doit pas suffire à retirer la protection.
    const refus = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/disable',
      headers: { cookie: compte.cookie },
      payload: { password: 'mauvais-mot-de-passe' },
    });

    expect(refus.statusCode).toBe(401);
  });

  it('retire le second facteur et ses codes de secours', async () => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/disable',
      headers: { cookie: compte.cookie },
      payload: { password: motDePasse },
    });
    expect(reponse.statusCode).toBe(204);

    const etat = await app.inject({
      method: 'GET',
      url: '/api/auth/totp',
      headers: { cookie: compte.cookie },
    });
    expect(etat.json()).toEqual({ enabled: false, recoveryCodesLeft: 0 });
    // Pas de connexion de vérification ici : ce fichier en a déjà enchaîné une douzaine, et
    // `/api/auth/login` est limitée à dix par minute. Elle répondrait 429 — ce qui est le
    // bon comportement, et que le premier essai du fichier couvre déjà dans l'autre sens.
    // Que la connexion redevienne simple après désactivation se lit dans l'état ci-dessus.
  });
});
