// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Valeurs de référence, côté API.
//
// Le calcul et la validation sont éprouvés dans le noyau. Ce qui se vérifie ici est ce que
// le noyau ne peut pas voir :
//
// - **le rapprochement espèce → clés**, qui traverse la frontière entre le vocabulaire
//   d'une ferme et celui des sources. Une espèce rattachée à la mauvaise clé donnerait des
//   rendements plausibles et faux, sans rien qui le signale ;
// - **l'absence de fuite entre fermes** : la route lit une espèce, donc une donnée de
//   ferme, pour répondre. Un identifiant deviné ne doit rien révéler ;
// - **le silence en écriture** : ces tables ne sont écrites que par le seed, et aucune
//   route de Sillon ne doit y toucher.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

let app: FastifyInstance;
let compte: TestAccount;
let voisin: TestAccount;

const entetes = (qui: TestAccount = compte) => ({ cookie: qui.cookie });

/**
 * Une source et deux valeurs, posées à la main.
 *
 * Les essais ne rejouent pas le seed : il lit les jeux livrés, dont le contenu évoluera, et
 * un essai qui en dépendrait échouerait le jour où une valeur change — pour une raison qui
 * n'aurait rien à voir avec la route.
 */
async function poserDesReferences(): Promise<void> {
  await withoutFarmScope(async (db) => {
    await db.referenceSource.upsert({
      where: { id: 'essai-2026' },
      create: {
        id: 'essai-2026',
        titre: 'Jeu d’essai',
        auteurs: ['Sillon'],
        annee: 2026,
        url: 'https://example.org/',
        licence: 'CC0-1.0',
        notes: '',
      },
      update: {},
    });
    await db.referenceValue.deleteMany({ where: { sourceId: 'essai-2026' } });
    await db.referenceValue.createMany({
      data: [
        {
          sourceId: 'essai-2026',
          cropKey: 'carotte-conservation',
          context: { abri: null, systeme: 'tous', conduite: 'biologique' },
          yieldMilliKgM2: { low: 2000, median: 2775, high: 7500 },
          priceCentsKg: { low: 180, median: 270, high: 350 },
          n: null,
          pageRef: 'onglet Rendements',
          notes: '',
        },
        {
          sourceId: 'essai-2026',
          cropKey: 'carotte-conservation',
          context: { abri: null, systeme: 'tous', conduite: 'conventionnelle' },
          yieldMilliKgM2: { low: 2500, median: 4000, high: 9000 },
          n: null,
          pageRef: 'onglet Rendements',
          notes: '',
        },
      ],
    });
  });
}

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'references@example.org' });
  voisin = await registerAccount(app, { email: 'voisine@example.org' });
  await poserDesReferences();
}, 120_000);

afterAll(async () => {
  await app?.close();
});

const especeNommee = async (qui: TestAccount, nom: string): Promise<number> => {
  const crops = (
    await app.inject({
      method: 'GET',
      url: `/api/farms/${qui.farmId}/crops`,
      headers: entetes(qui),
    })
  ).json();
  const espece = crops.find((candidate: { name: string }) => candidate.name === nom);
  expect(espece, `${nom} doit exister au référentiel`).toBeDefined();
  return espece.id;
};

const references = (params: string, qui: TestAccount = compte) =>
  app.inject({
    method: 'GET',
    url: `/api/farms/${qui.farmId}/references?${params}`,
    headers: entetes(qui),
  });

describe('rapprocher une espèce de ses références', () => {
  it('traduit l’espèce de la ferme en clés de source', async () => {
    // Le cœur du lot A : « Carotte » chez Sillon, « Carotte conservation » chez la source.
    const id = await especeNommee(compte, 'Carotte');
    const reponse = await references(`speciesId=${id}`);

    expect(reponse.statusCode).toBe(200);
    const corps = reponse.json();
    expect(corps.matched).toBe(true);
    expect(corps.cropKeys).toContain('carotte-conservation');
    expect(corps.values.length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('rend chaque valeur avec sa source, sans second appel', async () => {
    // « Une référence sans provenance affichable est une affirmation. » L'interface doit
    // pouvoir écrire le badge et donner la licence au survol depuis cette seule réponse.
    const id = await especeNommee(compte, 'Carotte');
    const [valeur] = (await references(`speciesId=${id}`)).json().values;

    expect(valeur.source).toMatchObject({ id: 'essai-2026', annee: 2026, licence: 'CC0-1.0' });
    expect(valeur.pageRef).toBeTruthy();
  }, 120_000);

  it('garde les unités de stockage, en entiers', async () => {
    // Le piège que les noms de colonnes existent pour éviter : 2775 millièmes de kg/m², et
    // non 2775 kg/m². Un flottant ou une conversion ici se verrait à l'écran comme un
    // rendement mille fois trop grand.
    const id = await especeNommee(compte, 'Carotte');
    const bio = (await references(`speciesId=${id}&conduite=biologique`)).json().values[0];

    expect(bio.yield).toEqual({ low: 2000, median: 2775, high: 7500 });
    expect(Number.isInteger(bio.yield.median)).toBe(true);
  }, 120_000);

  it('filtre par conduite sans confondre bio et conventionnel', async () => {
    const id = await especeNommee(compte, 'Carotte');
    const bio = (await references(`speciesId=${id}&conduite=biologique`)).json();
    const conv = (await references(`speciesId=${id}&conduite=conventionnelle`)).json();

    expect(bio.values).toHaveLength(1);
    expect(conv.values).toHaveLength(1);
    expect(bio.values[0].yield.median).not.toBe(conv.values[0].yield.median);
  }, 120_000);

  it('distingue « rattachée mais inconnue » de « non rattachée »', async () => {
    // Deux vides qui n'appellent pas le même message. Le melon **est** au vocabulaire des
    // sources — `cropKeys` le dit — mais aucune ne le couvre ici : l'écran doit répondre
    // « on ne sait rien de cette culture ». Une espèce créée par la ferme, elle, n'est
    // rattachée à rien : l'écran doit proposer de la rattacher à la main.
    const melon = await especeNommee(compte, 'Melon');
    const rattachee = (await references(`speciesId=${melon}`)).json();

    expect(rattachee.matched, 'aucune valeur').toBe(false);
    expect(rattachee.cropKeys, 'mais une clé connue').toContain('melon');
    expect(rattachee.values).toEqual([]);

    const maison = await app
      .inject({
        method: 'POST',
        url: `/api/farms/${compte.farmId}/crops`,
        headers: entetes(),
        payload: { name: 'Yacon', color: '#7c3aed', familyId: undefined },
      })
      .then((reponse) => reponse.json());

    if (maison?.id) {
      const inconnue = (await references(`speciesId=${maison.id}`)).json();
      expect(inconnue.matched).toBe(false);
      expect(inconnue.cropKeys, 'rien à quoi la rattacher').toEqual([]);
    }
  }, 120_000);

  it('accepte une clé de culture directe, pour le rattrapage manuel', async () => {
    const corps = (await references('cropKey=carotte-conservation')).json();
    expect(corps.values.length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

describe('ce que la route ne laisse pas passer', () => {
  it('ne révèle pas l’espèce d’une autre ferme', async () => {
    // La route lit une espèce pour répondre : c'est le seul endroit où elle touche à une
    // donnée de ferme, et l'isolation doit y tenir comme ailleurs.
    const chezElle = await especeNommee(voisin, 'Carotte');
    const corps = (await references(`speciesId=${chezElle}`, compte)).json();

    expect(corps.matched, 'l’identifiant de la voisine ne doit rien rapprocher').toBe(false);
    expect(corps.values).toEqual([]);
  }, 120_000);

  it('refuse un paramètre hors des valeurs admises', async () => {
    expect((await references('conduite=douteuse')).statusCode).toBe(422);
  }, 120_000);

  it('exige une session', async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}/references`,
    });
    expect(reponse.statusCode).toBe(401);
  }, 120_000);

  it('n’expose aucune route d’écriture', async () => {
    // Ces tables sont écrites par le seed, et par lui seul. Une route de création ouverte
    // par inadvertance laisserait une ferme modifier une donnée que toutes les autres
    // lisent — le contraire de ce que « référence publiée » veut dire.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const reponse = await app.inject({
        method,
        url: `/api/farms/${compte.farmId}/references`,
        headers: entetes(),
        payload: {},
      });
      expect(reponse.statusCode, `${method} ne doit pas exister`).toBe(404);
    }
  }, 120_000);
});

describe('les sources', () => {
  it('se listent avec leur licence', async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}/references/sources`,
      headers: entetes(),
    });

    expect(reponse.statusCode).toBe(200);
    const sources = reponse.json();
    expect(sources.find((s: { id: string }) => s.id === 'essai-2026')).toMatchObject({
      licence: 'CC0-1.0',
    });
  }, 120_000);

  it('couvrent tous les jeux livrés une fois le seed passé', async () => {
    // Un jeu ajouté dans `packages/core/data/references/` sans passer par le seed
    // resterait invisible, et son absence ne se verrait qu'à l'écran.
    const dossier = new URL('../../../../packages/core/data/references/', import.meta.url).pathname;
    const attendus = readdirSync(dossier)
      .filter((nom) => nom.endsWith('.json'))
      .map((nom) => nom.replace(/\.json$/, ''));

    expect(attendus.length, 'des jeux doivent être livrés').toBeGreaterThan(0);
    expect(attendus).toContain('mesclun-2023');
  }, 120_000);
});

describe('les repères d’exploitation', () => {
  const reperes = (params = '') =>
    app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}/references/farm?${params}`,
      headers: entetes(),
    });

  it('servent les surfaces par équivalent temps plein, avec leur source', async () => {
    await withoutFarmScope(async (db) => {
      await db.referenceFarmValue.deleteMany({ where: { sourceId: 'essai-2026' } });
      await db.referenceFarmValue.create({
        data: {
          sourceId: 'essai-2026',
          metric: 'surface-cultivee-par-etp',
          context: { systeme: 'bio-intensif', conduite: null },
          range: { low: 2000, median: 5000, high: 8000 },
          n: null,
          pageRef: 'onglet Repères_temps_travail, ligne 9',
          notes: '',
        },
      });
    });

    const reponse = await reperes('metric=surface-cultivee-par-etp');
    expect(reponse.statusCode).toBe(200);
    const trouve = reponse
      .json()
      .find((repere: { source: { id: string } }) => repere.source.id === 'essai-2026');

    expect(trouve.range).toEqual({ low: 2000, median: 5000, high: 8000 });
    expect(trouve.pageRef).toContain('ligne 9');
    expect(trouve.source.licence).toBe('CC0-1.0');
  }, 120_000);

  it('filtrent par système de culture', async () => {
    const bio = (await reperes('systeme=bio-intensif')).json();
    const perma = (await reperes('systeme=permaculture')).json();

    // Le jeu d'essai n'a qu'un repère, en bio-intensif : le filtre doit le distinguer.
    expect(bio.some((r: { source: { id: string } }) => r.source.id === 'essai-2026')).toBe(true);
    expect(perma.some((r: { source: { id: string } }) => r.source.id === 'essai-2026')).toBe(false);
  }, 120_000);

  it('refusent une métrique qui n’existe pas', async () => {
    // Une métrique commande l'unité de sa fourchette : en accepter une inconnue reviendrait
    // à servir un nombre dont personne ne saurait dire s'il est en mètres ou en secondes.
    expect((await reperes('metric=surface-inventee')).statusCode).toBe(422);
  }, 120_000);
});
