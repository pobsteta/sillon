// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Centres de formation.
//
// La duplication elle-même est éprouvée dans `farm-copy.test.ts`. Ce qui se vérifie ici est
// ce que le brief promet à trois personnes différentes : au centre, des modèles multiples ;
// au formateur, un accès **ordinaire et visible** ; à l'apprenant, sa ferme après la
// formation. Chacune de ces promesses se trahirait en silence.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  mailbox,
  registerAccount,
  resetDatabase,
  urlFromMail,
  type TestAccount,
} from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

let app: FastifyInstance;
let centre: TestAccount;
let modeleId: number;

const sansPortee = withoutFarmScope;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  centre = await registerAccount(app, { email: 'cfppa@example.org', farmName: 'CFPPA du Val' });

  // La ferme du centre sert elle-même de modèle : c'est le cas du jardin pédagogique de
  // l'établissement, et cela suffit à exercer la duplication.
  modeleId = centre.farmId;
  await peuplerLeModele();

  const declaration = await app.inject({
    method: 'PUT',
    url: `/api/farms/${centre.farmId}/training-center`,
    headers: { cookie: centre.cookie },
    payload: { defaultTemplateFarmId: modeleId, defaultTrainingDuration: 300 },
  });
  expect(declaration.statusCode, declaration.body).toBe(200);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

async function peuplerLeModele(): Promise<void> {
  const jardin = await app
    .inject({
      method: 'POST',
      url: `/api/farms/${modeleId}/locations`,
      headers: { cookie: centre.cookie },
      payload: { name: 'Jardin pédagogique', parentId: null, bedLength: 0, greenhouse: false },
    })
    .then((r) => r.json());
  await app.inject({
    method: 'POST',
    url: `/api/farms/${modeleId}/locations`,
    headers: { cookie: centre.cookie },
    payload: { name: 'Planche 1', parentId: jardin.id, bedLength: 30_000, greenhouse: false },
  });
}

/** Crée une ferme d'apprenant et renvoie la réponse brute. */
const creerApprenant = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/farms/${centre.farmId}/training-center/students`,
    headers: { cookie: centre.cookie },
    payload,
  });

describe('déclarer un centre', () => {
  it('range le modèle par défaut parmi les modèles', async () => {
    // L'invariant qui permet de lire les modèles d'un centre sur une seule table : sans
    // lui, un centre fraîchement déclaré afficherait « aucun modèle » tout en en ayant un.
    const vue = await app
      .inject({
        method: 'GET',
        url: `/api/farms/${centre.farmId}/training-center`,
        headers: { cookie: centre.cookie },
      })
      .then((r) => r.json());

    expect(vue.templates).toHaveLength(1);
    expect(vue.templates[0]).toMatchObject({ id: modeleId, isDefault: true });
    expect(vue.defaultTrainingDuration).toBe(300);
  });

  it('refuse de prendre pour modèle la ferme d’un tiers', async () => {
    // Le point sensible de tout le lot : un modèle se duplique. Accepter une ferme
    // quelconque donnerait à n'importe quel centre une copie des données d'autrui.
    const etranger = await registerAccount(app, { email: 'voisine@example.org' });

    const refus = await app.inject({
      method: 'POST',
      url: `/api/farms/${centre.farmId}/training-center/templates`,
      headers: { cookie: centre.cookie },
      payload: { templateFarmId: etranger.farmId },
    });

    expect(refus.statusCode).toBe(403);
    expect(refus.json().message).toMatch(/encadrer/i);
  });

  it('retient plusieurs modèles, et garde le défaut inamovible', async () => {
    const autre = await app
      .inject({
        method: 'POST',
        url: '/api/farms',
        headers: { cookie: centre.cookie },
        payload: { name: 'Modèle maraîchage bio' },
      })
      .then((r) => r.json());

    const ajout = await app.inject({
      method: 'POST',
      url: `/api/farms/${centre.farmId}/training-center/templates`,
      headers: { cookie: centre.cookie },
      payload: { templateFarmId: autre.id, label: 'Promotion 2027' },
    });
    expect(ajout.statusCode, ajout.body).toBe(201);

    const refus = await app.inject({
      method: 'DELETE',
      url: `/api/farms/${centre.farmId}/training-center/templates/${modeleId}`,
      headers: { cookie: centre.cookie },
    });
    expect(refus.statusCode, 'le modèle par défaut ne se retire pas').toBe(409);

    const retrait = await app.inject({
      method: 'DELETE',
      url: `/api/farms/${centre.farmId}/training-center/templates/${autre.id}`,
      headers: { cookie: centre.cookie },
    });
    expect(retrait.statusCode).toBe(204);
  });
});

describe('créer une ferme d’apprenant', () => {
  it('duplique le modèle sans rien partager avec lui', async () => {
    const reponse = await creerApprenant({ email: 'eleve1@example.org' });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const apprenant = reponse.json();

    expect(apprenant.copied.Location, 'le parcellaire du modèle est repris').toBeGreaterThan(0);
    await sansPortee(async (db) => {
      const emplacements = await db.location.findMany({ where: { farmId: apprenant.farmId } });
      expect(emplacements.length).toBeGreaterThan(0);
      // Le pire résultat possible serait silencieux : une ferme d'apprenant qui pointe sur
      // le parcellaire du formateur, que l'élève modifierait sans le savoir.
      const ids = new Set(emplacements.map((e) => e.id));
      for (const emplacement of emplacements) {
        if (emplacement.parentId != null) expect(ids.has(emplacement.parentId)).toBe(true);
      }
      const chezLeModele = await db.location.count({ where: { farmId: modeleId } });
      expect(chezLeModele, 'le modèle reste intact').toBe(2);
    });
  });

  it('donne au formateur une adhésion ordinaire, que l’apprenant voit', async () => {
    const eleve = await registerAccount(app, { email: 'eleve2@example.org' });
    const reponse = await creerApprenant({ email: eleve.email });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const fermeEleve = reponse.json().farmId;

    const equipe = await app
      .inject({
        method: 'GET',
        url: `/api/farms/${fermeEleve}/members`,
        headers: { cookie: eleve.cookie },
      })
      .then((r) => r.json());

    // Pas de privilège caché : le formateur figure dans l'équipe, au rôle annoncé.
    const formateur = equipe.find((membre: { userId: number }) => membre.userId === centre.userId);
    expect(formateur, 'le formateur est visible dans l’équipe').toBeDefined();
    expect(formateur.role).toBe('manager');
  });

  it('attend l’apprenant sans compte, et lui remet la propriété à l’acceptation', async () => {
    mailbox.sent.length = 0;
    const reponse = await creerApprenant({ email: 'futur@example.org', name: 'Ferme de Camille' });
    expect(reponse.statusCode, reponse.body).toBe(201);
    const fermeId = reponse.json().farmId;

    await sansPortee(async (db) => {
      const ferme = await db.farm.findUniqueOrThrow({ where: { id: fermeId } });
      expect(ferme.ownerId, 'la ferme attend son propriétaire').toBeNull();
      expect(ferme.name).toBe('Ferme de Camille');
    });

    const courriel = mailbox.sent.find((message) => message.to === 'futur@example.org');
    expect(courriel, 'une invitation part').toBeDefined();
    const jeton = urlFromMail(courriel!.text).split('/').at(-1)!;

    const camille = await registerAccount(app, { email: 'futur@example.org' });
    const acceptation = await app.inject({
      method: 'POST',
      url: `/api/invitations/${jeton}/accept`,
      headers: { cookie: camille.cookie },
    });
    expect(acceptation.statusCode, acceptation.body).toBe(200);

    await sansPortee(async (db) => {
      const ferme = await db.farm.findUniqueOrThrow({ where: { id: fermeId } });
      // Membre propriétaire mais ferme sans propriétaire : l'écran d'équipe et le transfert
      // de propriété liraient deux vérités différentes.
      expect(ferme.ownerId, 'la ferme a désormais un propriétaire').toBe(camille.userId);
    });
  });

  it('refuse une formation plus longue que le maximum du centre', async () => {
    const refus = await creerApprenant({ email: 'trop-long@example.org', trainingDays: 900 });

    expect(refus.statusCode).toBe(400);
    expect(refus.json().message).toMatch(/365/);
  });
});

describe('terminer une formation', () => {
  it('laisse la ferme à l’apprenant et retire les formateurs', async () => {
    const eleve = await registerAccount(app, { email: 'diplome@example.org' });
    const fermeId = (await creerApprenant({ email: eleve.email })).json().farmId;

    const fin = await app.inject({
      method: 'POST',
      url: `/api/farms/${centre.farmId}/training-center/students/${fermeId}/end`,
      headers: { cookie: centre.cookie },
      payload: {},
    });
    expect(fin.statusCode, fin.body).toBe(200);
    expect(fin.json().endedAt).toBeTruthy();

    // Le formateur ne lit plus rien : l'encadrement s'arrête avec la formation. Un 404, et
    // non un 403 : sans adhésion, l'API ne dit pas même que la ferme existe.
    const lectureFormateur = await app.inject({
      method: 'GET',
      url: `/api/farms/${fermeId}`,
      headers: { cookie: centre.cookie },
    });
    expect(lectureFormateur.statusCode).toBe(404);

    // L'apprenant garde tout, y compris le droit d'écrire : c'est sa ferme, pas un prêt.
    const lectureEleve = await app.inject({
      method: 'GET',
      url: `/api/farms/${fermeId}`,
      headers: { cookie: eleve.cookie },
    });
    expect(lectureEleve.statusCode, 'la ferme reste celle de l’apprenant').toBe(200);
    expect(lectureEleve.json().role).toBe('owner');

    const ecriture = await app.inject({
      method: 'POST',
      url: `/api/farms/${fermeId}/tags`,
      headers: { cookie: eleve.cookie },
      payload: { name: 'Après la formation', color: '#336633' },
    });
    expect(ecriture.statusCode).toBe(201);
  });

  it('refuse de supprimer un centre dont des formations courent', async () => {
    const refus = await app.inject({
      method: 'DELETE',
      url: `/api/farms/${centre.farmId}/training-center`,
      headers: { cookie: centre.cookie },
    });

    // Supprimer le centre effacerait en cascade le rattachement des apprenants.
    expect(refus.statusCode).toBe(409);
    expect(refus.json().message).toMatch(/terminez/i);
  });
});
