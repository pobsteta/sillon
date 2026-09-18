// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calendrier lunaire, côté API.
//
// Le calcul est éprouvé dans le noyau (`packages/core/src/moon.test.ts`), y compris contre
// des calendriers publiés. Ce qui se vérifie ici est le câblage : la route sert-elle bien
// l'année demandée, **avec les réglages de la ferme**, et le réglage se change-t-il ?
//
// Le point sensible est le dernier : un réglage qu'on peut poser mais que le calcul ignore
// donnerait un calendrier faux sans rien signaler — le risque nommé par le brief.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from '../test-support.js';

let app: FastifyInstance;
let compte: TestAccount;

const entetes = () => ({ cookie: compte.cookie });

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'lune@example.org' });
}, 120_000);

afterAll(async () => {
  await app?.close();
});

const annee = (an: number) =>
  app.inject({ method: 'GET', url: `/api/farms/${compte.farmId}/moon/${an}`, headers: entetes() });

const regler = (corps: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/api/farms/${compte.farmId}`,
    headers: entetes(),
    payload: corps,
  });

describe('la route d’année', () => {
  it('sert les 365 jours, prêts à mettre en cache', async () => {
    const reponse = await annee(2026);

    expect(reponse.statusCode).toBe(200);
    const jours = reponse.json();
    expect(jours).toHaveLength(365);
    expect(jours[0]).toMatchObject({ date: '2026-01-01' });
    // Le service worker doit pouvoir la garder : le champ n'a pas de réseau.
    expect(reponse.headers['cache-control']).toContain('max-age');
  });

  it('refuse une année hors des bornes', async () => {
    expect((await annee(1200)).statusCode).toBe(422);
    expect((await annee(3000)).statusCode).toBe(422);
  });

  it('reste éteinte pour l’interface tant qu’on ne l’allume pas', async () => {
    // La route répond toujours — elle ne coûte rien et ne dit rien de plus qu'un état du
    // ciel. C'est l'interface qui se tait : `moonCalendar` est faux par défaut, et qui ne
    // pratique pas ne doit pas voir un mot de plus à l'écran.
    const session = await app.inject({ method: 'GET', url: '/api/auth/me', headers: entetes() });
    expect(session.json().farms[0].moonCalendar).toBe(false);
  });
});

describe('les réglages de la ferme changent le calendrier', () => {
  it('bascule de convention, et les dates changent', async () => {
    // Deux conventions, deux calendriers. Si les changer ne changeait rien, le réglage
    // serait un mensonge — et personne ne s'en apercevrait.
    await regler({ moonConvention: 'tropical' });
    const tropical = (await annee(2026)).json();

    await regler({ moonConvention: 'constellations' });
    const constellations = (await annee(2026)).json();

    const differents = tropical.filter(
      (jour: { dayType: string }, index: number) => jour.dayType !== constellations[index].dayType,
    );
    expect(differents.length, 'les deux conventions divergent').toBeGreaterThan(100);
  });

  it('refuse un fuseau inventé', async () => {
    // Un fuseau inconnu décalerait la journée civile sans lever d'erreur au calcul :
    // le calendrier serait faux d'un jour, et plausible.
    const refus = await regler({ timezone: 'Europe/Nulle-Part' });
    expect(refus.statusCode).toBe(422);
  });

  it('accepte un fuseau réel, et le calendrier suit', async () => {
    await regler({ timezone: 'Pacific/Auckland' });
    const auckland = (await annee(2026)).json();

    await regler({ timezone: 'Europe/Paris' });
    const paris = (await annee(2026)).json();

    const differents = paris.filter(
      (jour: { dayType: string }, index: number) => jour.dayType !== auckland[index].dayType,
    );
    expect(differents.length, 'douze heures d’écart changent des journées').toBeGreaterThan(20);
  });

  it('allume le calendrier pour l’interface', async () => {
    await regler({ moonCalendar: true });
    const session = await app.inject({ method: 'GET', url: '/api/auth/me', headers: entetes() });
    expect(session.json().farms[0].moonCalendar).toBe(true);
  });
});
