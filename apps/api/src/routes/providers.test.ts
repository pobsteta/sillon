// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Semenciers proposés (`brief/fournisseurs-par-defaut.md`).
//
// Ce qui se vérifie ici tient en une phrase : **on propose, on n'impose pas**. Une ferme
// neuve les reçoit ; une ferme ancienne les reçoit si elle le demande ; et dans tous les
// cas, un référentiel déjà rangé n'est pas défait — une maison renommée reste renommée, et
// appuyer deux fois ne crée pas de doublon.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SUGGESTED_PROVIDERS } from '../reference-data.js';
import {
  createTestApp,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

let app: FastifyInstance;
let compte: TestAccount;

const entetes = () => ({ cookie: compte.cookie });
const url = (chemin: string) => `/api/farms/${compte.farmId}${chemin}`;

beforeAll(async () => {
  app = await createTestApp();
}, 120_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
  compte = await registerAccount(app);
});

const fournisseurs = () =>
  app.inject({ method: 'GET', url: url('/providers'), headers: entetes() }).then((r) => r.json());

describe('une ferme neuve', () => {
  it('reçoit les semenciers proposés, avec leur site', async () => {
    const liste = await fournisseurs();

    for (const semencier of SUGGESTED_PROVIDERS) {
      const trouve = liste.find((f: { name: string }) => f.name === semencier.name);
      expect(trouve, `${semencier.name} doit être au référentiel`).toBeDefined();
      // `?? null` : une maison sans site n'en a pas, et la base écrit `null` là où la
      // liste ne dit rien. Les deux formes disent la même chose.
      expect(trouve.url, 'le site rend la feuille de commande cliquable').toBe(
        semencier.url ?? null,
      );
      expect(trouve.type).toBe(semencier.type);
    }
  });

  it('garde le générique comme fournisseur par défaut', async () => {
    // Désigner une maison précise ferait entrer un nom commercial dans des données saisies
    // sans intention : une variété créée sans y penser porterait ce nom.
    const ferme = await withoutFarmScope((db) =>
      db.farm.findUniqueOrThrow({
        where: { id: compte.farmId },
        include: { providers: { where: { id: undefined } } },
      }),
    );
    const defaut = (await fournisseurs()).find(
      (f: { id: number }) => f.id === ferme.defaultProviderId,
    );

    expect(defaut.name).toBe('Fournisseur par défaut');
    expect(
      SUGGESTED_PROVIDERS.map((s) => s.name),
      'aucune maison nommée en défaut',
    ).not.toContain(defaut.name);
  });
});

describe('le geste offert aux fermes existantes', () => {
  /** Remet la ferme dans l'état d'avant la liste : plus aucun semencier proposé. */
  const oublier = () =>
    withoutFarmScope((db) =>
      db.provider.deleteMany({
        where: { farmId: compte.farmId, name: { in: SUGGESTED_PROVIDERS.map((s) => s.name) } },
      }),
    );

  const proposes = () =>
    app
      .inject({ method: 'GET', url: url('/providers/suggested'), headers: entetes() })
      .then((r) => r.json());

  const ajouter = () =>
    app.inject({ method: 'POST', url: url('/providers/suggested'), headers: entetes() });

  it('dit ce qui manque avant d’écrire quoi que ce soit', async () => {
    await oublier();
    const avant = await proposes();
    expect(avant.every((s: { present: boolean }) => !s.present)).toBe(true);

    // Le simple fait de regarder ne doit rien créer.
    const liste = await fournisseurs();
    for (const semencier of SUGGESTED_PROVIDERS) {
      expect(liste.find((f: { name: string }) => f.name === semencier.name)).toBeUndefined();
    }
  });

  it('ajoute ce qui manque, et le dit', async () => {
    await oublier();

    const reponse = await ajouter();

    expect(reponse.statusCode).toBe(201);
    expect(reponse.json().added).toHaveLength(SUGGESTED_PROVIDERS.length);
    expect((await proposes()).every((s: { present: boolean }) => s.present)).toBe(true);
  });

  it('ne crée pas de doublon quand on appuie deux fois', async () => {
    await oublier();
    await ajouter();

    const seconde = await ajouter();

    // Rien à faire n'est pas une erreur : c'est la réponse juste à qui appuie deux fois.
    expect(seconde.statusCode).toBe(200);
    expect(seconde.json().added).toHaveLength(0);
    const liste = await fournisseurs();
    const kokopelli = liste.filter((f: { name: string }) => f.name === 'Kokopelli');
    expect(kokopelli).toHaveLength(1);
  });

  it('ne rétablit pas une maison que la ferme a renommée', async () => {
    // Le cas qui compte : quelqu'un a renommé « Kokopelli » en « Kokopelli (groupée) »
    // pour sa commande collective. Le geste ne doit pas faire réapparaître l'ancien nom à
    // côté — ce serait défaire son choix en croyant l'aider.
    const liste = await fournisseurs();
    const kokopelli = liste.find((f: { name: string }) => f.name === 'Kokopelli');
    await app.inject({
      method: 'PATCH',
      url: url(`/providers/${kokopelli.id}`),
      headers: entetes(),
      payload: { name: 'Kokopelli (commande groupée)' },
    });

    await ajouter();

    const apres = await fournisseurs();
    expect(
      apres.filter((f: { name: string }) => f.name.startsWith('Kokopelli')),
      'un seul Kokopelli, celui de la ferme',
    ).toHaveLength(1);
  });
});

describe('une maison sans site', () => {
  // `grainesdelpais.com` ne répondait plus le 19 septembre 2026 : mieux vaut pas de lien
  // qu'un lien mort. La maison reste au référentiel — c'est son nom qui répartit une
  // commande, pas son site.
  const sansSite = SUGGESTED_PROVIDERS.filter((semencier) => !semencier.url);

  it('existe dans la liste proposée', () => {
    expect(sansSite.length, 'ce cas existe et doit être traité').toBeGreaterThan(0);
  });

  it('est tout de même ajoutée', async () => {
    // Le piège : en Prisma, `{ url: undefined }` dans un `OR` n'est pas « adresse
    // inconnue » mais une clause **vide**, qui accepte n'importe quelle ligne. Elle ferait
    // considérer la maison comme déjà présente, et celle-ci ne serait jamais créée — sans
    // erreur, sans message, et sans que la liste proposée ne s'en aperçoive.
    await withoutFarmScope((db) =>
      db.provider.deleteMany({
        where: { farmId: compte.farmId, name: { in: SUGGESTED_PROVIDERS.map((s) => s.name) } },
      }),
    );

    const reponse = await app.inject({
      method: 'POST',
      url: url('/providers/suggested'),
      headers: entetes(),
    });

    expect(reponse.json().added).toHaveLength(SUGGESTED_PROVIDERS.length);
    const liste = await fournisseurs();
    for (const semencier of sansSite) {
      const trouve = liste.find((f: { name: string }) => f.name === semencier.name);
      expect(trouve, `${semencier.name} doit être au référentiel`).toBeDefined();
      expect(trouve.url, 'et sans lien mort').toBeNull();
    }
  });

  it('est reconnue comme présente, par son nom', async () => {
    const proposes = await app
      .inject({ method: 'GET', url: url('/providers/suggested'), headers: entetes() })
      .then((r) => r.json());

    for (const semencier of sansSite) {
      const ligne = proposes.find((s: { name: string }) => s.name === semencier.name);
      expect(ligne.url, 'aucun lien annoncé').toBeNull();
      expect(ligne.present, 'et pourtant reconnue').toBe(true);
    }
  });
});

describe('le site et les notes', () => {
  it('se saisissent et se relisent', async () => {
    const cree = await app.inject({
      method: 'POST',
      url: url('/providers'),
      headers: entetes(),
      payload: {
        name: 'Semencier du coin',
        url: 'https://exemple.test/',
        notes: 'Commande groupée avant le 15 janvier',
      },
    });

    expect(cree.statusCode, cree.body).toBe(201);
    expect(cree.json()).toMatchObject({
      url: 'https://exemple.test/',
      notes: 'Commande groupée avant le 15 janvier',
    });
  });

  it('refusent une adresse qui n’en est pas une', async () => {
    // La colonne devient un lien cliquable : un `javascript:` s'y glisserait, et la
    // personne qui saisit n'est pas forcément celle qui clique.
    for (const mauvaise of ['javascript:alert(1)', 'ftp://exemple.test', 'pas une adresse']) {
      const refus = await app.inject({
        method: 'POST',
        url: url('/providers'),
        headers: entetes(),
        payload: { name: `Essai ${mauvaise}`, url: mauvaise },
      });
      expect(refus.statusCode, mauvaise).toBe(422);
    }
  });

  it('accompagnent la variété jusqu’à la feuille de commande', async () => {
    // C'est la raison d'être de `url` : depuis la commande, on va sur le site.
    const liste = await fournisseurs();
    const kokopelli = liste.find((f: { name: string }) => f.name === 'Kokopelli');
    const crop = (
      await app.inject({ method: 'GET', url: url('/crops'), headers: entetes() })
    ).json()[0];
    const variete = await app
      .inject({
        method: 'POST',
        url: url('/varieties'),
        headers: entetes(),
        payload: { name: 'Variété de chez eux', cropId: crop.id, providerId: kokopelli.id },
      })
      .then((r) => r.json());
    await app.inject({
      method: 'POST',
      url: url('/plantings'),
      headers: entetes(),
      payload: {
        cropId: crop.id,
        varietyId: variete.id,
        plantingType: 'direct_seeded',
        length: 30_000,
        rows: 2,
        spacingPlants: 5_000,
        // Sans graines par poquet, la série ne demande rien et la feuille de commande
        // l'ignore : la ligne n'existerait pas, et l'essai passerait à côté de son sujet.
        seedsPerHoleDirect: 3,
        sowingDate: '2027-03-01',
        durations: { days_to_transplant: 0, days_to_maturity: 60, harvest_window: 30 },
      },
    });

    const commande = await app
      .inject({ method: 'GET', url: url('/orders?year=2027'), headers: entetes() })
      .then((r) => r.json());
    const ligne = commande.lines.find(
      (l: { providerName: string }) => l.providerName === 'Kokopelli',
    );

    expect(ligne, 'la ligne cite le semencier').toBeDefined();
    expect(ligne.providerUrl).toBe('https://kokopelli-semences.fr/');
  });
});
