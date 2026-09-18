// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Duplication d'une ferme.
//
// L'essai qui compte n'est pas « tout a-t-il été copié » mais « la copie est-elle
// **autonome** » : une seule référence restée sur la ferme d'origine, et les deux fermes
// partagent des données sans que rien ne le signale. C'est le pire résultat possible, parce
// qu'il est silencieux — un apprenant modifierait la ferme modèle de son formateur.
//
// Tous les accès directs à la base passent par `withoutFarmScope` : sous la RLS, une requête
// sans portée de ferme ne voit rien, et l'essai échouerait pour une raison étrangère à ce
// qu'il vérifie.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { copierFerme } from './farm-copy.js';
import { withoutFarmScope } from './tenant.js';
import { createTestApp, registerAccount, resetDatabase, type TestAccount } from './test-support.js';

let app: FastifyInstance;
let source: TestAccount;
let cibleId: number;

const url = (chemin: string) => `/api/farms/${source.farmId}${chemin}`;
const entetes = () => ({ cookie: source.cookie });
const sansPortee = withoutFarmScope;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  source = await registerAccount(app, { email: 'modele@example.org', farmName: 'Ferme modèle' });
  await peuplerLaFermeSource();

  const cible = await sansPortee((db) =>
    db.farm.create({
      data: {
        name: 'Ferme copiée',
        slug: `copie-${Date.now()}`,
        trialExpiryDate: new Date('2099-12-31'),
      },
    }),
  );
  cibleId = cible.id;

  // La copie lit une ferme et écrit dans une autre : sous la RLS, seule une exécution hors
  // portée peut voir les deux.
  await sansPortee((tx) => copierFerme(tx, source.farmId, cibleId));
}, 120_000);

afterAll(async () => {
  await app?.close();
});

/** De quoi exercer les deux cycles et les tables de liaison. */
async function peuplerLaFermeSource(): Promise<void> {
  const jardin = await app
    .inject({
      method: 'POST',
      url: url('/locations'),
      headers: entetes(),
      payload: { name: 'Jardin du bas', parentId: null, bedLength: 0, greenhouse: false },
    })
    .then((r) => r.json());
  for (const nom of ['Planche A1', 'Planche A2']) {
    await app.inject({
      method: 'POST',
      url: url('/locations'),
      headers: entetes(),
      payload: { name: nom, parentId: jardin.id, bedLength: 30_000, greenhouse: false },
    });
  }

  // Une espèce avec sa variété par défaut : c'est le cycle Crop ↔ Variety.
  const crop = (
    await app.inject({ method: 'GET', url: url('/crops'), headers: entetes() })
  ).json()[0];
  // Une variété exige un fournisseur : le référentiel de départ en pose un.
  const fournisseur = (
    await app.inject({ method: 'GET', url: url('/providers'), headers: entetes() })
  ).json()[0];
  const creation = await app.inject({
    method: 'POST',
    url: url('/varieties'),
    headers: entetes(),
    payload: { cropId: crop.id, providerId: fournisseur.id, name: 'Variété modèle' },
  });
  expect(creation.statusCode, creation.body).toBe(201);
  const variete = creation.json();
  await sansPortee((db) =>
    db.crop.update({ where: { id: crop.id }, data: { defaultVarietyId: variete.id } }),
  );

  const serie = await app
    .inject({
      method: 'POST',
      url: url('/plantings'),
      headers: entetes(),
      payload: {
        cropId: crop.id,
        varietyId: variete.id,
        plantingType: 'transplant_raised',
        length: 30_000,
        rows: 2,
        spacingPlants: 5_000,
        sowingDate: '2026-03-01',
        durations: { days_to_transplant: 35, days_to_maturity: 60, harvest_window: 45 },
      },
    })
    .then((r) => r.json());
  await app.inject({
    method: 'POST',
    url: url(`/plantings/${serie.id}/generate-tasks`),
    headers: entetes(),
    payload: { replace: true },
  });

  const etiquette = await app
    .inject({
      method: 'POST',
      url: url('/tags'),
      headers: entetes(),
      payload: { name: 'Printemps', color: '#446644' },
    })
    .then((r) => r.json());

  await sansPortee(async (db) => {
    await db.plantingTag.create({ data: { plantingId: serie.id, tagId: etiquette.id } });

    const planches = await db.location.findMany({
      where: { farmId: source.farmId, parentId: jardin.id },
      orderBy: { id: 'asc' },
    });
    await db.locationAssignment.create({
      data: { plantingId: serie.id, locationId: planches[0]!.id, length: 30_000 },
    });

    const note = await db.note.create({
      data: { farmId: source.farmId, content: 'Note du modèle', date: new Date('2026-03-02') },
    });
    await db.plantingNote.create({ data: { noteId: note.id, plantingId: serie.id } });
  });
}

type Modele = 'crop' | 'variety' | 'planting' | 'location' | 'task' | 'note';

const compter = (modele: Modele, farmId: number): Promise<number> =>
  sansPortee((db) =>
    (db[modele] as unknown as { count: (a: unknown) => Promise<number> }).count({
      where: { farmId },
    }),
  );

describe('la copie est complète', () => {
  it('reprend chaque table peuplée de la source', async () => {
    for (const modele of ['crop', 'variety', 'planting', 'location', 'task', 'note'] as const) {
      const avant = await compter(modele, source.farmId);
      const apres = await compter(modele, cibleId);
      expect(
        avant,
        `${modele} : la source doit être peuplée pour que l’essai prouve quelque chose`,
      ).toBeGreaterThan(0);
      expect(apres, `${modele} : ${avant} dans la source`).toBe(avant);
    }
  });

  it('reprend les tables de liaison, qui n’ont pas de farm_id', async () => {
    // Leur cloisonnement ne tient qu'aux clauses écrites dans `farm-copy.ts` : c'est
    // exactement là qu'une erreur passerait inaperçue.
    const dansLaCopie = { planting: { farmId: cibleId } };
    await sansPortee(async (db) => {
      expect(await db.plantingTag.count({ where: dansLaCopie })).toBe(1);
      expect(await db.locationAssignment.count({ where: dansLaCopie })).toBe(1);
      expect(await db.plantingNote.count({ where: dansLaCopie })).toBe(1);
      expect(await db.plantingTask.count({ where: dansLaCopie })).toBeGreaterThan(0);
      expect(await db.plantingDate.count({ where: dansLaCopie })).toBeGreaterThan(0);
    });
  });
});

describe('la copie est autonome', () => {
  it('ne laisse aucune référence vers la ferme d’origine', async () => {
    await sansPortee(async (db) => {
      const series = await db.planting.findMany({
        where: { farmId: cibleId },
        include: { crop: true, variety: true, tags: { include: { tag: true } } },
      });
      expect(series.length).toBeGreaterThan(0);
      for (const serie of series) {
        expect(serie.crop.farmId, 'l’espèce citée appartient à la copie').toBe(cibleId);
        expect(serie.variety?.farmId ?? cibleId, 'la variété citée aussi').toBe(cibleId);
        for (const { tag } of serie.tags) expect(tag.farmId, 'et l’étiquette').toBe(cibleId);
      }

      const placements = await db.locationAssignment.findMany({
        where: { planting: { farmId: cibleId } },
        include: { location: true },
      });
      for (const placement of placements) {
        expect(placement.location.farmId, 'la planche occupée appartient à la copie').toBe(cibleId);
      }
    });
  });

  it('referme le cycle espèce ↔ variété sur la copie', async () => {
    // `Crop.defaultVarietyId` désigne une variété dont la `cropId` désigne l'espèce : le
    // cycle qui interdit un ordre de copie linéaire. Une erreur ici ferait pointer l'espèce
    // copiée vers la variété du modèle.
    await sansPortee(async (db) => {
      const especes = await db.crop.findMany({
        where: { farmId: cibleId, defaultVarietyId: { not: null } },
        include: { defaultVariety: true },
      });

      expect(especes.length, 'au moins une espèce a une variété par défaut').toBeGreaterThan(0);
      for (const espece of especes) {
        expect(espece.defaultVariety?.farmId).toBe(cibleId);
        expect(espece.defaultVariety?.cropId, 'et la variété désigne bien son espèce').toBe(
          espece.id,
        );
      }
    });
  });

  it('recopie l’arbre des emplacements, parents d’abord', async () => {
    await sansPortee(async (db) => {
      const emplacements = await db.location.findMany({ where: { farmId: cibleId } });
      const enfants = emplacements.filter((e) => e.parentId != null);

      expect(enfants.length, 'la copie a des planches sous un jardin').toBeGreaterThan(0);
      const ids = new Set(emplacements.map((e) => e.id));
      for (const enfant of enfants) {
        // Un `parentId` resté sur le modèle ferait apparaître les planches de la copie sous
        // le jardin du formateur.
        expect(ids.has(enfant.parentId!), 'le parent appartient à la copie').toBe(true);
      }
    });
  });

  it('laisse la ferme d’origine intacte', async () => {
    // C'est une copie, pas un transfert.
    expect(await compter('planting', source.farmId)).toBeGreaterThan(0);
    expect(await compter('location', source.farmId)).toBe(3);
  });
});

describe('ce qui ne se copie pas', () => {
  it('ne reprend ni l’équipe ni les invitations', async () => {
    // La ferme copiée a ses propres membres : recopier ceux du modèle donnerait au
    // formateur un accès qu'il n'a pas demandé, et à l'apprenant une équipe qu'il ne
    // comprendrait pas.
    await sansPortee(async (db) => {
      expect(await db.farmMembership.count({ where: { farmId: cibleId } })).toBe(0);
      expect(await db.invitation.count({ where: { farmId: cibleId } })).toBe(0);
    });
  });
});
