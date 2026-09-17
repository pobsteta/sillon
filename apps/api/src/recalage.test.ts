// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Recalage des tâches après un décalage de dates.
//
// Le cas réel : une gelée tardive, on repousse tout le printemps d'une semaine. Le plan de
// culture suit — c'est ce que fait le traitement par lot. Encore faut-il que la feuille de
// tâches suive aussi, sans quoi on se retrouve à semer aux anciennes dates.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerAccount, resetDatabase, type TestAccount } from './test-support.js';

let app: FastifyInstance;
let compte: TestAccount;

const url = (chemin: string) => `/api/farms/${compte.farmId}${chemin}`;
const entetes = () => ({ cookie: compte.cookie });

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'recalage@example.org' });
});

afterAll(async () => {
  await app?.close();
});

/** Série de tomates semée le 1er mars, plantée le 5 avril. */
async function creerSerie(sowingDate = '2026-03-01') {
  const especes = await app.inject({ method: 'GET', url: url('/crops'), headers: entetes() });
  const crop = especes.json()[0];

  const reponse = await app.inject({
    method: 'POST',
    url: url('/plantings'),
    headers: entetes(),
    payload: {
      cropId: crop.id,
      plantingType: 'transplant_raised',
      length: 30_000,
      rows: 2,
      spacingPlants: 5_000,
      sowingDate,
      durations: { days_to_transplant: 35, days_to_maturity: 60, harvest_window: 45 },
    },
  });
  expect(reponse.statusCode).toBe(201);
  return reponse.json();
}

/** Engendre les tâches de semis et de plantation, et rend leurs dates prévues. */
async function genererEtLire(plantingId: number): Promise<Record<string, string>> {
  const generation = await app.inject({
    method: 'POST',
    url: url(`/plantings/${plantingId}/generate-tasks`),
    headers: entetes(),
    payload: { replace: true },
  });
  expect(generation.statusCode).toBeLessThan(300);
  return datesDesTaches(plantingId);
}

async function datesDesTaches(plantingId: number): Promise<Record<string, string>> {
  const fiche = await app.inject({
    method: 'GET',
    url: url(`/plantings/${plantingId}`),
    headers: entetes(),
  });
  expect(fiche.statusCode).toBe(200);
  const dates: Record<string, string> = {};
  for (const lien of fiche.json().tasks ?? []) {
    const tache = lien.task ?? lien;
    // `plannedDate` revient en horodatage complet ; seule la date nous intéresse.
    if (tache.defaultType) dates[tache.defaultType] = String(tache.plannedDate).slice(0, 10);
  }
  return dates;
}

describe('décalage par lot', () => {
  it('emmène les tâches avec les dates de la série', async () => {
    const serie = await creerSerie();
    const avant = await genererEtLire(serie.id);

    // Les tâches engendrées suivent le semis et la mise en place.
    expect(avant.greenhouse_sow).toBe('2026-03-01');
    expect(avant.transplant).toBe('2026-04-05');

    const lot = await app.inject({
      method: 'PATCH',
      url: url('/plantings'),
      headers: entetes(),
      payload: { ids: [serie.id], shiftDays: 7 },
    });
    expect(lot.statusCode).toBe(200);

    // Le plan a bougé…
    const fiche = await app.inject({
      method: 'GET',
      url: url(`/plantings/${serie.id}`),
      headers: entetes(),
    });
    expect(fiche.json().dates.sowing.planned, 'le semis se décale').toBe('2026-03-08');

    // …et la feuille de tâches doit avoir bougé avec lui. Sans quoi le plan dit une chose
    // et le travail du jour en dit une autre.
    const apres = await datesDesTaches(serie.id);
    expect(apres.greenhouse_sow, 'la tâche de semis suit').toBe('2026-03-08');
    expect(apres.transplant, 'la tâche de plantation suit').toBe('2026-04-12');
  });

  it('ne touche pas aux tâches déjà faites', async () => {
    // Le travail réalisé est un fait : il s'est passé le jour où il s'est passé, et
    // repousser le plan ne le déplace pas dans le passé.
    const serie = await creerSerie('2026-05-01');
    await genererEtLire(serie.id);

    const fiche = await app.inject({
      method: 'GET',
      url: url(`/plantings/${serie.id}`),
      headers: entetes(),
    });
    const lien = (fiche.json().tasks ?? [])[0];
    const tache = lien.task ?? lien;
    const typeFait = tache.defaultType as string;
    const dateAvant = String(tache.plannedDate).slice(0, 10);

    const validation = await app.inject({
      method: 'PATCH',
      url: url(`/tasks/${tache.id}`),
      headers: entetes(),
      payload: { done: true },
    });
    expect(validation.statusCode, 'la tâche est bien validée').toBeLessThan(300);

    await app.inject({
      method: 'PATCH',
      url: url('/plantings'),
      headers: entetes(),
      payload: { ids: [serie.id], shiftDays: 14 },
    });

    // On interroge précisément la tâche validée, pas la première venue.
    const apres = await datesDesTaches(serie.id);
    expect(apres[typeFait], 'la tâche faite reste à sa date').toBe(dateAvant);
  });
});
