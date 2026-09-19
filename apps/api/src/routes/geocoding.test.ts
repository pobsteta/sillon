// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Recherche d'adresse.
//
// Deux choses se vérifient ici, et aucune n'est une question de cartographie :
//
// - **l'ordre des coordonnées**, parce qu'une inversion placerait chaque ferme française
//   au large de la Somalie sans lever la moindre erreur ;
// - **le silence quand on l'a demandé**, parce que c'est le seul endroit où Sillon parle à
//   l'extérieur, et qu'un réglage qui ne couperait pas vraiment serait pire que pas de
//   réglage du tout.
//
// Aucun essai ne joint la Base Adresse Nationale : un service tiers dans une suite
// d'essais, c'est un échec du jour où il est en maintenance, sur du code qui n'a pas bougé.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { lireBan } from './geocoding.js';
import { registerAccount, resetDatabase, type TestAccount } from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

async function monter(env: Record<string, string> = {}) {
  await resetDatabase();
  const app = await buildApp({ NODE_ENV: 'test', ...env });
  await app.ready();
  apps.push(app);
  const compte = await registerAccount(app, { email: 'carte@example.org' });
  return { app, compte };
}

const chercher = (app: FastifyInstance, compte: TestAccount, q = 'chemin de la Rougerie') =>
  app.inject({
    method: 'GET',
    url: `/api/farms/${compte.farmId}/geocode?q=${encodeURIComponent(q)}`,
    headers: { cookie: compte.cookie },
  });

/** Réponse de la BAN, telle qu'elle est arrivée le 19 septembre 2026 — forme, pas contenu. */
const REPONSE_BAN = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.44078, 47.59855] },
      properties: {
        label: '1 Chemin de la Rougerie 49140 Rives-du-Loir-en-Anjou',
        score: 0.95,
        postcode: '49140',
        city: 'Rives-du-Loir-en-Anjou',
      },
    },
  ],
};

describe('la lecture d’une réponse', () => {
  it('remet la latitude devant', () => {
    // La BAN parle GeoJSON : `[longitude, latitude]`. C'est la seule chose que cette
    // fonction ait à faire, et c'est celle qui compte.
    const [adresse] = lireBan(REPONSE_BAN);

    expect(adresse!.latitude, 'l’Anjou est vers 47° nord').toBe(47.59855);
    expect(adresse!.longitude, 'et vers 0,44° ouest').toBe(-0.44078);
  });

  it('écarte ce qui n’est pas exploitable plutôt que de l’inventer', () => {
    const bancal = {
      features: [
        { geometry: { coordinates: [2.35, 48.85] } }, // sans libellé
        { properties: { label: 'Sans position' } }, // sans coordonnées
        { geometry: { coordinates: [2.35, 120] }, properties: { label: 'Hors Terre' } },
      ],
    };

    expect(lireBan(bancal)).toEqual([]);
  });

  it('ne suppose rien d’une réponse vide', () => {
    expect(lireBan({})).toEqual([]);
    expect(lireBan({ features: [] })).toEqual([]);
  });
});

describe('la route', () => {
  it('rend les adresses trouvées', async () => {
    const { app, compte } = await monter();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(REPONSE_BAN)));

    const reponse = await chercher(app, compte);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().results[0]).toMatchObject({ latitude: 47.59855, longitude: -0.44078 });
  });

  it('s’identifie auprès du service', async () => {
    // La politique d'usage de Nominatim l'exige, et un service qui ne se nomme pas se fait
    // refuser sans explication.
    const { app, compte } = await monter();
    let entetes: Headers | undefined;
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      entetes = new Headers(init.headers);
      return new Response(JSON.stringify(REPONSE_BAN));
    });

    await chercher(app, compte);

    expect(entetes?.get('user-agent')).toMatch(/Sillon/);
  });

  it('ne parle à personne quand la recherche est éteinte', async () => {
    // Le réglage existe pour qui ne veut pas que l'adresse de sa ferme sorte. S'il
    // n'empêchait pas réellement l'appel, il serait pire qu'inutile : il rassurerait.
    const { app, compte } = await monter({ GEOCODING: 'none' });
    const appels: unknown[] = [];
    vi.stubGlobal('fetch', async (url: unknown) => {
      appels.push(url);
      return new Response('{}');
    });

    const refus = await chercher(app, compte);

    expect(refus.statusCode).toBe(400);
    expect(appels, 'aucune requête n’est partie').toHaveLength(0);
  });

  it('ne relaie ni le message ni l’adresse du tiers quand il échoue', async () => {
    const { app, compte } = await monter();
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED api-adresse.data.gouv.fr:443');
    });

    const echec = await chercher(app, compte);

    expect(echec.statusCode).toBe(400);
    expect(echec.body, 'le détail de déploiement reste chez nous').not.toMatch(/ECONNREFUSED/);
    expect(echec.body).not.toMatch(/data\.gouv/);
  });

  it('exige une recherche qui ait un sens', async () => {
    const { app, compte } = await monter();
    expect((await chercher(app, compte, 'a')).statusCode).toBe(422);
  });
});

describe('la position de la ferme', () => {
  it('se pose, se relit et se retire', async () => {
    const { app, compte } = await monter();
    const regler = (corps: Record<string, unknown>) =>
      app.inject({
        method: 'PATCH',
        url: `/api/farms/${compte.farmId}`,
        headers: { cookie: compte.cookie },
        payload: corps,
      });

    expect((await regler({ latitude: 47.59855, longitude: -0.44078 })).statusCode).toBe(200);
    const ferme = await app
      .inject({
        method: 'GET',
        url: `/api/farms/${compte.farmId}`,
        headers: { cookie: compte.cookie },
      })
      .then((r) => r.json());
    expect(ferme).toMatchObject({ latitude: 47.59855, longitude: -0.44078 });

    // On doit pouvoir la retirer aussi simplement qu'on l'a posée.
    await regler({ latitude: null, longitude: null });
    const apres = await app
      .inject({
        method: 'GET',
        url: `/api/farms/${compte.farmId}`,
        headers: { cookie: compte.cookie },
      })
      .then((r) => r.json());
    expect(apres.latitude).toBeNull();
  });

  it('se lit de toute l’équipe, et pas seulement de l’encadrement', async () => {
    // Décision du 19 septembre 2026 : les coordonnées de l'exploitation sont visibles de
    // qui peut se connecter. L'essai la fixe — sans lui, un resserrement des droits
    // passerait pour une correction.
    const { app, compte } = await monter();
    await app.inject({
      method: 'PATCH',
      url: `/api/farms/${compte.farmId}`,
      headers: { cookie: compte.cookie },
      payload: { latitude: 47.59855, longitude: -0.44078 },
    });

    const saisonnier = await registerAccount(app, { email: 'saisonnier@example.org' });
    await withoutFarmScope((db) =>
      db.farmMembership.create({
        data: { farmId: compte.farmId, userId: saisonnier.userId, role: 'seasonal' },
      }),
    );

    const lecture = await app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}`,
      headers: { cookie: saisonnier.cookie },
    });

    expect(lecture.statusCode).toBe(200);
    expect(lecture.json()).toMatchObject({ latitude: 47.59855, longitude: -0.44078 });
  });

  it('ne se modifie que par qui règle la ferme', async () => {
    // Voir n'est pas poser. `PATCH /farms/:id` exige le rôle propriétaire, et l'écran ne
    // propose les boutons qu'à qui peut s'en servir.
    const { app, compte } = await monter();
    const employe = await registerAccount(app, { email: 'employe@example.org' });
    await withoutFarmScope((db) =>
      db.farmMembership.create({
        data: { farmId: compte.farmId, userId: employe.userId, role: 'employee' },
      }),
    );

    const refus = await app.inject({
      method: 'PATCH',
      url: `/api/farms/${compte.farmId}`,
      headers: { cookie: employe.cookie },
      payload: { latitude: 47.6, longitude: -0.44 },
    });

    expect(refus.statusCode).toBe(403);
  });

  it('refuse une latitude qui n’existe pas', async () => {
    const { app, compte } = await monter();
    const refus = await app.inject({
      method: 'PATCH',
      url: `/api/farms/${compte.farmId}`,
      headers: { cookie: compte.cookie },
      payload: { latitude: 120, longitude: 2.35 },
    });
    expect(refus.statusCode).toBe(422);
  });
});
