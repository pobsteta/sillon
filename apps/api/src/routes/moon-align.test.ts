// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calage lunaire du plan de culture (lot 3 de `brief/jardinage-lunaire.md`).
//
// Trois des cinq règles de conception du brief se vérifient ici, et aucune ne tient toute
// seule dans le code :
//
// - **le décalage proposé est borné** à trois jours — au-delà, c'est l'agronomie qui
//   commande, et une série de printemps ne se décale pas d'une semaine pour attendre un
//   jour fruit ;
// - **la lune ne commande rien** : une série qu'aucun jour ne satisfait dans la fenêtre
//   n'est pas touchée, et l'appel ne refuse rien ;
// - **le plan reste maître** : c'est un décalage demandé, jamais un décalage automatique.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { moonYear, type MoonDay } from '@sillon/core';
import {
  createTestApp,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

let app: FastifyInstance;
let compte: TestAccount;
let calendrier: Map<string, MoonDay>;

const entetes = () => ({ cookie: compte.cookie });
const url = (chemin: string) => `/api/farms/${compte.farmId}${chemin}`;

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'calage@example.org' });
  // Mêmes réglages que la ferme : sans cela, l'essai comparerait deux calendriers.
  calendrier = new Map(moonYear(2027).map((jour) => [jour.date, jour]));
}, 120_000);

afterAll(async () => {
  await app?.close();
});

/** Crée une série de l'espèce nommée, semée à la date donnée. */
async function semer(espece: string, date: string): Promise<{ id: number; part: string }> {
  const reponseCrops = await app.inject({
    method: 'GET',
    url: url('/crops'),
    headers: entetes(),
  });
  const crops = reponseCrops.json();
  // Le référentiel est le socle de tout ce fichier : sans lui, chaque essai échoue sur
  // « crops.find n'est pas une fonction », qui ne dit rien de la cause. On montre le
  // statut et le corps — c'est ainsi qu'on voit qu'une autre suite a vidé la base sous
  // nos pieds, ou qu'une session a expiré.
  expect(
    Array.isArray(crops),
    `GET /crops → ${reponseCrops.statusCode} ${reponseCrops.body.slice(0, 200)}`,
  ).toBe(true);
  const crop = crops.find((c: { name: string }) => c.name === espece);
  expect(crop, `${espece} doit exister au référentiel`).toBeDefined();
  expect(crop.harvestedPart, `${espece} doit être qualifiée`).toBeTruthy();

  const serie = await app
    .inject({
      method: 'POST',
      url: url('/plantings'),
      headers: entetes(),
      payload: {
        cropId: crop.id,
        plantingType: 'direct_seeded',
        length: 30_000,
        rows: 2,
        spacingPlants: 5_000,
        sowingDate: date,
        durations: { days_to_transplant: 0, days_to_maturity: 60, harvest_window: 30 },
      },
    })
    .then((r) => r.json());
  return { id: serie.id, part: crop.harvestedPart };
}

const semis = async (id: number): Promise<string> => {
  const serie = await app
    .inject({ method: 'GET', url: url(`/plantings/${id}`), headers: entetes() })
    .then((r) => r.json());
  return serie.dates.sowing.planned;
};

/**
 * Une date qui n'est pas du type voulu mais qui en a un à trois jours au plus — ou
 * l'inverse si `identique` est vrai. Sans cela, l'essai dépendrait du calendrier de
 * l'année choisie.
 */
function dateAvecVoisin(type: MoonDay['dayType'], identique: boolean): string {
  const jours = [...calendrier.values()].filter((jour) => jour.date > '2027-02-01');
  for (const jour of jours) {
    if ((jour.dayType === type) !== identique) continue;
    const voisin = jours.some((autre) => {
      const ecart = Math.abs((Date.parse(autre.date) - Date.parse(jour.date)) / 86_400_000);
      return ecart > 0 && ecart <= 3 && autre.dayType === type;
    });
    if (voisin) return jour.date;
  }
  throw new Error(`Aucune date de départ utilisable pour un jour ${type}`);
}

const caler = (ids: number[], maxShift?: number) =>
  app.inject({
    method: 'PATCH',
    url: url('/plantings'),
    headers: entetes(),
    payload: { ids, alignToMoonDay: maxShift === undefined ? {} : { maxShift } },
  });

describe('caler une série sur le jour de sa culture', () => {
  it('déplace le semis sur un jour du bon type, à trois jours au plus', async () => {
    // La date de départ se **calcule** : il lui faut un jour racine à portée, sans en être
    // un. Une date choisie à la main tomberait un jour où rien n'est possible dans la
    // fenêtre, et l'essai passerait alors sans rien prouver.
    const semisChoisi = dateAvecVoisin('racine', false);
    const { id, part } = await semer('Carotte', semisChoisi);
    const avant = await semis(id);
    expect(avant).toBe(semisChoisi);

    const reponse = await caler([id]);
    expect(reponse.statusCode, reponse.body).toBe(200);

    const apres = await semis(id);
    const attendu = { root: 'racine', leaf: 'feuille', flower: 'fleur', fruit: 'fruit' }[part]!;

    expect(calendrier.get(apres)!.dayType, `${avant} → ${apres}`).toBe(attendu);
    const ecart = Math.abs((Date.parse(apres) - Date.parse(avant)) / 86_400_000);
    expect(ecart, 'la borne de trois jours').toBeLessThanOrEqual(3);
  });

  it('ne bouge pas une série déjà sur le bon jour', async () => {
    // On cherche une date de semis qui tombe déjà un jour racine.
    const jourRacine = [...calendrier.values()].find(
      (jour) => jour.date > '2027-04-01' && jour.dayType === 'racine',
    )!;
    const { id } = await semer('Navet', jourRacine.date);

    await caler([id]);

    expect(await semis(id), 'rien à faire, donc rien de fait').toBe(jourRacine.date);
  });

  it('ne touche pas une série qu’aucun jour ne satisfait dans la fenêtre', async () => {
    // Avec une fenêtre d'un seul jour, la plupart des séries n'ont nulle part où aller.
    // La règle du brief est alors « le plan reste maître » : on ne force rien, et on ne
    // refuse rien non plus.
    const { id } = await semer('Betterave', '2027-05-12');
    const avant = await semis(id);

    const reponse = await caler([id], 1);
    expect(reponse.statusCode).toBe(200);

    const apres = await semis(id);
    const bouge = apres !== avant;
    if (bouge) {
      expect(Math.abs((Date.parse(apres) - Date.parse(avant)) / 86_400_000)).toBeLessThanOrEqual(1);
    } else {
      expect(reponse.json().aligned).toHaveLength(0);
    }
  });

  it('laisse tranquille une espèce non qualifiée', async () => {
    // Le champ est nul tant que personne ne l'a renseigné : le calendrier se tait alors
    // pour cette culture plutôt que d'inventer un type de jour.
    const crops = (
      await app.inject({ method: 'GET', url: url('/crops'), headers: entetes() })
    ).json();
    const crop = crops[0];
    await withoutFarmScope((db) =>
      db.crop.update({ where: { id: crop.id }, data: { harvestedPart: null } }),
    );
    const serie = await app
      .inject({
        method: 'POST',
        url: url('/plantings'),
        headers: entetes(),
        payload: {
          cropId: crop.id,
          plantingType: 'direct_seeded',
          sowingDate: '2027-06-01',
          durations: { days_to_transplant: 0, days_to_maturity: 60, harvest_window: 30 },
        },
      })
      .then((r) => r.json());

    const reponse = await caler([serie.id]);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().aligned, 'aucun calage sans partie récoltée').toHaveLength(0);
    expect(await semis(serie.id)).toBe('2027-06-01');
  });

  it('suit la surcharge de la série avant celle de l’espèce', async () => {
    // Une carotte **porte-graine** se mène en jour fruit, pas en jour racine. C'est la
    // raison d'être de la surcharge, et elle ne sert à rien si le calage l'ignore.
    const { id } = await semer('Carotte', '2027-07-05');
    await app.inject({
      method: 'PATCH',
      url: url(`/plantings/${id}`),
      headers: entetes(),
      payload: { harvestedPart: 'fruit' },
    });

    await caler([id]);

    expect(calendrier.get(await semis(id))!.dayType).toBe('fruit');
  });
});

describe('ce que le calage ne fait pas', () => {
  it('refuse d’être combiné à un décalage en jours', async () => {
    // Les deux ensemble donneraient un résultat imprévisible : le calage part de la date
    // de semis, que le décalage vient de déplacer.
    const { id } = await semer('Laitue', '2027-08-01');

    const refus = await app.inject({
      method: 'PATCH',
      url: url('/plantings'),
      headers: entetes(),
      payload: { ids: [id], shiftDays: 7, alignToMoonDay: {} },
    });

    expect(refus.statusCode).toBe(400);
  });

  it('refuse une fenêtre plus large que trois jours', async () => {
    // La borne n'est pas un réglage d'interface : elle tient dans le schéma de la route,
    // là où personne ne peut la contourner.
    const { id } = await semer('Épinard', '2027-09-01');
    expect((await caler([id], 7)).statusCode).toBe(422);
  });

  it('emmène les tâches avec les dates', async () => {
    // Sans recalage, le plan dirait une chose et la feuille de tâches une autre.
    const { id } = await semer('Radis', '2027-10-05');
    await app.inject({
      method: 'POST',
      url: url(`/plantings/${id}/generate-tasks`),
      headers: entetes(),
      payload: { replace: true },
    });

    const reponse = await caler([id]);
    const corps = reponse.json();

    if (corps.aligned.length > 0) {
      expect(corps.rescheduled, 'les tâches ont suivi').toBeGreaterThan(0);
    }
  });
});

describe('filtrer le plan par ce qu’on récolte', () => {
  // Le pivot du brief §4, vu depuis la liste des séries. Ce filtre alimente les puces du
  // plan de culture **et** le diagramme de Gantt, qui n'affiche que les séries retenues
  // par la requête : une erreur ici ferait montrer deux choses différentes aux deux vues,
  // et le traitement par lot agirait sur une sélection qu'on ne voit pas.

  const lister = async (partie?: string) =>
    app
      .inject({
        method: 'GET',
        url: url(`/plantings?year=2027${partie ? `&harvestedPart=${partie}` : ''}`),
        headers: entetes(),
      })
      .then((r) => r.json());

  it('ne garde que les séries de la partie demandée', async () => {
    const carotte = await semer('Carotte', '2027-04-02');
    const tomate = await semer('Tomate', '2027-04-03');
    expect(carotte.part, 'la carotte est une racine').toBe('root');
    expect(tomate.part, 'la tomate est un fruit').toBe('fruit');

    const racines = await lister('root');
    const identifiants = racines.map((serie: { id: number }) => serie.id);

    expect(identifiants).toContain(carotte.id);
    expect(identifiants).not.toContain(tomate.id);
  }, 120_000);

  it('suit la surcharge de la série avant celle de l’espèce', async () => {
    // « Une carotte porte-graine se mène en jour fruit, pas en jour racine » (§4). La
    // surcharge doit donc faire sortir la série de son filtre d'origine **et** la faire
    // entrer dans l'autre. Ne tester qu'un des deux sens laisserait passer une clause qui
    // ajoute sans retrancher — le défaut le plus probable d'un `OR` mal posé.
    const porteGraine = await semer('Carotte', '2027-04-04');
    await app.inject({
      method: 'PATCH',
      url: url(`/plantings/${porteGraine.id}`),
      headers: entetes(),
      payload: { harvestedPart: 'fruit' },
    });

    const racines = (await lister('root')).map((serie: { id: number }) => serie.id);
    const fruits = (await lister('fruit')).map((serie: { id: number }) => serie.id);

    expect(racines, 'la surcharge la sort des racines').not.toContain(porteGraine.id);
    expect(fruits, 'et la fait entrer dans les fruits').toContain(porteGraine.id);
  }, 120_000);

  it('cohabite avec la recherche textuelle, sans l’écraser', () => {
    // Les deux conditions sont des `OR` : posées toutes deux à la racine de la clause
    // Prisma, la seconde écraserait la première en silence — même clé, même objet. C'est
    // le défaut que le `AND` existe pour éviter, et il ne se verrait pas autrement.
    return app
      .inject({
        method: 'GET',
        url: url('/plantings?year=2027&harvestedPart=root&search=tomate'),
        headers: entetes(),
      })
      .then((reponse) => {
        expect(reponse.statusCode).toBe(200);
        // Aucune série n'est à la fois une racine et une tomate : les deux filtres
        // s'appliquent. Si l'un écrasait l'autre, la liste ne serait pas vide.
        expect(reponse.json()).toHaveLength(0);
      });
  }, 120_000);

  it('laisse de côté les espèces non qualifiées, plutôt que de les ranger d’office', async () => {
    // Une espèce sans partie récoltée ne répond à aucun filtre. La ranger quelque part
    // par défaut serait inventer une donnée que personne n'a saisie.
    const sansPartie = await semer('Carotte', '2027-04-05');
    const crops = (
      await app.inject({ method: 'GET', url: url('/crops'), headers: entetes() })
    ).json();
    const carotte = crops.find((c: { name: string }) => c.name === 'Carotte');
    await withoutFarmScope((db) =>
      db.crop.update({ where: { id: carotte.id }, data: { harvestedPart: null } }),
    );

    for (const partie of ['root', 'leaf', 'flower', 'fruit']) {
      const identifiants = (await lister(partie)).map((serie: { id: number }) => serie.id);
      expect(identifiants, partie).not.toContain(sansPartie.id);
    }
  }, 120_000);
});
