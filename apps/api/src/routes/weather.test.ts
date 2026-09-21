// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Météo de la fiche du jour.
//
// Trois choses se vérifient ici, et la cartographie n'en fait pas partie :
//
// - **le silence quand on l'a demandé** (`WEATHER=none`), parce que la météo est hors
//   périmètre V1 du brief et que le réglage d'extinction est ce qui rend l'entorse
//   réversible. Un réglage qui ne couperait pas vraiment serait pire que pas de réglage ;
// - **ce qui sort de Sillon** : des coordonnées arrondies au kilomètre, pas la parcelle ;
// - **la lecture de la réponse**, où se cache le défaut indétectable à l'œil : afficher la
//   météo de la veille sous le bon titre.
//
// Aucun essai ne joint Open-Meteo : un service tiers dans une suite d'essais, c'est un
// échec le jour de sa maintenance, sur du code qui n'a pas bougé.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { today } from '@sillon/core';
import { buildApp } from '../app.js';
import { lireOpenMeteo } from './weather.js';
import { registerAccount, resetDatabase, type TestAccount } from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

const apps = new Map<string, FastifyInstance>();

afterAll(async () => {
  await Promise.all([...apps.values()].map((app) => app.close()));
  apps.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Réponse d'Open-Meteo, dans la forme qu'elle a. Le contenu est inventé, pas la forme. */
const reponseOpenMeteo = (date: string) => ({
  daily: {
    time: [date],
    weather_code: [3],
    temperature_2m_max: [21.4],
    temperature_2m_min: [11.2],
    precipitation_sum: [0.6],
    wind_speed_10m_max: [12.3],
  },
  current: { temperature_2m: 17.1 },
});

describe('la lecture d’une réponse', () => {
  it('convertit en dixièmes, comme tout le reste du dépôt', () => {
    const meteo = lireOpenMeteo(reponseOpenMeteo('2026-06-15'), '2026-06-15');

    expect(meteo.temperatureMax, '21,4 °C').toBe(214);
    expect(meteo.temperatureMin).toBe(112);
    expect(meteo.precipitation, '0,6 mm').toBe(6);
    expect(meteo.windMax).toBe(123);
    expect(meteo.weatherCode).toBe(3);
  });

  it('retrouve la date dans la fenêtre, au lieu de lire la première ligne', () => {
    // Le défaut que cette fonction existe pour éviter. Open-Meteo peut décaler la fenêtre
    // qu'il rend ; lire l'indice zéro afficherait alors la météo de la veille sous le bon
    // titre, ce qui ne se voit pas.
    const decalee = {
      daily: {
        time: ['2026-06-14', '2026-06-15'],
        weather_code: [61, 0],
        temperature_2m_max: [14.0, 21.4],
        temperature_2m_min: [9.0, 11.2],
        precipitation_sum: [8.0, 0.0],
        wind_speed_10m_max: [30.0, 12.3],
      },
    };

    expect(lireOpenMeteo(decalee, '2026-06-15')).toMatchObject({
      weatherCode: 0,
      temperatureMax: 214,
    });
  });

  it('rend des champs nuls plutôt que d’inventer, quand la date manque', () => {
    const meteo = lireOpenMeteo(reponseOpenMeteo('2026-06-14'), '2026-06-15');

    expect(meteo.date).toBe('2026-06-15');
    expect(meteo.temperatureMax).toBeNull();
    expect(meteo.weatherCode).toBeNull();
  });

  it('ne suppose rien d’une réponse vide', () => {
    expect(lireOpenMeteo({}, '2026-06-15').temperatureMax).toBeNull();
    expect(lireOpenMeteo({ daily: {} }, '2026-06-15').weatherCode).toBeNull();
  });

  it('ne colle la température du moment que sur aujourd’hui', () => {
    // « 17 °C » sous la date du 15 juin alors qu'on est le 20 septembre serait un relevé
    // faux sous un titre juste.
    expect(lireOpenMeteo(reponseOpenMeteo('2026-06-15'), '2026-06-15').temperatureNow).toBeNull();
    expect(lireOpenMeteo(reponseOpenMeteo(today()), today()).temperatureNow).toBe(171);
  });
});

async function monter(env: Record<string, string> = {}) {
  const cle = JSON.stringify(env);
  let app = apps.get(cle);
  if (!app) {
    app = await buildApp({ NODE_ENV: 'test', ...env });
    await app.ready();
    apps.set(cle, app);
  }
  await resetDatabase();
  const compte = await registerAccount(app, { email: 'meteo@example.org' });
  return { app, compte };
}

const situer = (farmId: number) =>
  withoutFarmScope((db) =>
    db.farm.update({ where: { id: farmId }, data: { latitude: 47.32234, longitude: 5.04187 } }),
  );

const demander = (app: FastifyInstance, compte: TestAccount, date = today()) =>
  app.inject({
    method: 'GET',
    url: `/api/farms/${compte.farmId}/weather/${date}`,
    headers: { cookie: compte.cookie },
  });

describe('la route', () => {
  it('rend la météo de la journée demandée', async () => {
    const { app, compte } = await monter();
    await situer(compte.farmId);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(reponseOpenMeteo(today()))));

    const reponse = await demander(app, compte);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ temperatureMax: 214, weatherCode: 3 });
  }, 120_000);

  it('n’envoie que des coordonnées arrondies au kilomètre', async () => {
    // Ce qui sort de Sillon est une donnée personnelle pour une exploitation
    // individuelle. La maille des modèles météo est plus large que le kilomètre : la
    // précision perdue ne l'est pour personne, et la parcelle ne sort pas.
    const { app, compte } = await monter();
    await situer(compte.farmId);
    let appelee: URL | null = null;
    vi.stubGlobal('fetch', async (url: URL) => {
      appelee = url;
      return new Response(JSON.stringify(reponseOpenMeteo(today())));
    });

    await demander(app, compte);

    expect(appelee).not.toBeNull();
    expect(appelee!.searchParams.get('latitude')).toBe('47.32');
    expect(appelee!.searchParams.get('longitude')).toBe('5.04');
  }, 120_000);

  it('ne parle à personne quand la météo est éteinte', async () => {
    // Le réglage qui rend l'entorse au périmètre V1 réversible. On vérifie le **silence
    // réseau**, pas seulement la réponse : une route qui appellerait puis jetterait le
    // résultat aurait l'air de respecter le réglage.
    const { app, compte } = await monter({ WEATHER: 'none' });
    await situer(compte.farmId);
    const appels: unknown[] = [];
    vi.stubGlobal('fetch', async (url: unknown) => {
      appels.push(url);
      return new Response('{}');
    });

    const reponse = await demander(app, compte);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toBeNull();
    expect(appels, 'rien ne doit sortir').toEqual([]);
  }, 120_000);

  it('ne parle à personne quand la ferme n’a pas de position', async () => {
    const { app, compte } = await monter();
    const appels: unknown[] = [];
    vi.stubGlobal('fetch', async (url: unknown) => {
      appels.push(url);
      return new Response('{}');
    });

    const reponse = await demander(app, compte);

    expect(reponse.json()).toBeNull();
    expect(appels).toEqual([]);
  }, 120_000);

  it('rend null hors de la fenêtre couverte, plutôt qu’une prévision inventée', async () => {
    const { app, compte } = await monter();
    await situer(compte.farmId);
    const appels: unknown[] = [];
    vi.stubGlobal('fetch', async (url: unknown) => {
      appels.push(url);
      return new Response('{}');
    });

    const dans5ans = `${Number(today().slice(0, 4)) + 5}${today().slice(4)}`;
    const reponse = await demander(app, compte, dans5ans);

    expect(reponse.json()).toBeNull();
    expect(appels).toEqual([]);
  }, 120_000);

  it('rend null quand le service ne répond pas, sans faire échouer la fiche', async () => {
    // La météo est un agrément : sa panne ne doit pas transformer la fiche du jour en
    // écran d'erreur. Un 502 ici ferait clignoter un message d'échec à chaque ouverture.
    const { app, compte } = await monter();
    await situer(compte.farmId);
    vi.stubGlobal('fetch', async () => {
      throw new Error('réseau injoignable');
    });

    const reponse = await demander(app, compte);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toBeNull();
  }, 120_000);

  it('refuse une date qui n’en est pas une', async () => {
    // 422 et non 400 : c'est la réponse que `errors.ts` donne à toute violation de schéma,
    // et une route qui s'en écarterait obligerait l'interface à traiter deux cas.
    const { app, compte } = await monter();
    const reponse = await demander(app, compte, '15-06-2026');
    expect(reponse.statusCode).toBe(422);
  }, 120_000);
});

describe('la fiche du jour', () => {
  let app: FastifyInstance;
  let compte: TestAccount;

  beforeAll(async () => {
    ({ app, compte } = await monter());
    await situer(compte.farmId);
  }, 120_000);

  const fiche = (date: string) =>
    app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}/moon/day/${date}`,
      headers: { cookie: compte.cookie },
    });

  it('sert les heures du lieu de la ferme', async () => {
    const reponse = await fiche('2026-09-20');

    expect(reponse.statusCode).toBe(200);
    const jour = reponse.json();
    expect(jour).toMatchObject({ date: '2026-09-20', dayType: 'fruit', trend: 'montante' });
    // Le point sensible du câblage : la position de la ferme doit parvenir au calcul.
    // Sans elle, ces quatre champs seraient nuls et rien ne le signalerait.
    expect(jour.observer).toMatchObject({ latitude: 47.32234 });
    expect(jour.sunrise).toMatch(/^\d{2}h\d{2}$/);
    expect(jour.sunset).toMatch(/^\d{2}h\d{2}$/);
    expect(jour.index.score).toBeGreaterThanOrEqual(0);
    expect(jour.index.score).toBeLessThanOrEqual(100);
  }, 120_000);

  it('explique son indice, toujours', async () => {
    // La garantie qui remplace la règle 5 du brief : l'indice s'ouvre. Un compte rendu
    // absent ferait du chiffre un argument d'autorité (voir `moon-detail.ts`).
    const jour = (await fiche('2026-09-19')).json();

    expect(Array.isArray(jour.index.reasons)).toBe(true);
    expect(
      100 + jour.index.reasons.reduce((t: number, r: { delta: number }) => t + r.delta, 0),
    ).toBe(jour.index.score);
  }, 120_000);

  it('refuse une date qui n’en est pas une', async () => {
    expect((await fiche('2026-13-45')).statusCode).toBe(422);
  }, 120_000);
});
