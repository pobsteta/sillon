// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Le verrou d'écriture, sur une vraie base. La règle elle-même est éprouvée dans le noyau
// (`access.test.ts`) ; ce qui se vérifie ici est le câblage : le verrou tient-il en un seul
// point, laisse-t-il passer ce qu'il doit, et l'export reste-t-il atteignable ?

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { getPrisma } from './db.js';
import { registerAccount, resetDatabase, type TestAccount } from './test-support.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** Application sous une politique donnée, avec un compte et sa ferme. */
async function monter(policy: 'ouverte' | 'essai' | 'abonnement') {
  await resetDatabase();
  const app = await buildApp({ NODE_ENV: 'test', ACCESS_POLICY: policy });
  await app.ready();
  apps.push(app);
  const compte = await registerAccount(app, { email: `acces-${policy}@example.org` });
  return { app, compte };
}

/** Repousse ou avance l'essai de la ferme, pour se placer de part et d'autre de l'échéance. */
async function fixerEcheances(
  farmId: number,
  { essai, paye }: { essai: string; paye?: string | null },
) {
  await getPrisma().farm.update({
    where: { id: farmId },
    data: { trialExpiryDate: new Date(essai), paidUntil: paye ? new Date(paye) : null },
  });
}

const creerSerie = (app: FastifyInstance, compte: TestAccount) =>
  app.inject({
    method: 'POST',
    url: `/api/farms/${compte.farmId}/tags`,
    headers: { cookie: compte.cookie },
    payload: { name: 'Étiquette', color: '#336633' },
  });

const lireFerme = (app: FastifyInstance, compte: TestAccount) =>
  app.inject({
    method: 'GET',
    url: `/api/farms/${compte.farmId}`,
    headers: { cookie: compte.cookie },
  });

describe('politique par défaut', () => {
  it('laisse tout écrire, essai expiré ou non', async () => {
    // Le cas de l'auto-hébergement : sans configuration, rien ne change. C'est ce qui
    // permet à ce dépôt de ne pas imposer une logique commerciale à qui l'installe.
    const { app, compte } = await monter('ouverte');
    await fixerEcheances(compte.farmId, { essai: '2020-01-01' });

    expect((await creerSerie(app, compte)).statusCode).toBe(201);
    expect(lireFerme(app, compte).then((r) => r.json().access.reason)).resolves.toBe('ouverte');
  });
});

describe('politique essai', () => {
  it('laisse écrire tant que l’essai court', async () => {
    const { app, compte } = await monter('essai');
    await fixerEcheances(compte.farmId, { essai: '2099-12-31' });

    expect((await creerSerie(app, compte)).statusCode).toBe(201);
  });

  it('refuse l’écriture une fois l’essai fini, avec un code nommé', async () => {
    const { app, compte } = await monter('essai');
    await fixerEcheances(compte.farmId, { essai: '2020-01-01' });

    const refus = await creerSerie(app, compte);

    expect(refus.statusCode).toBe(403);
    // Un code distinct d'un `forbidden` ordinaire : ce n'est pas la personne qui manque de
    // droits, c'est la ferme qui est en lecture seule. L'interface doit savoir le dire.
    expect(refus.json().error).toBe('farm_read_only');
    expect(refus.json().details.reason).toBe('essai_expire');
  });

  it('laisse lire, et laisse exporter', async () => {
    // Le cœur du parti pris : jamais d'accès refusé. Une saison de travail reste lisible et
    // récupérable, ce que l'export RGPD en libre-service promet par ailleurs.
    const { app, compte } = await monter('essai');
    await fixerEcheances(compte.farmId, { essai: '2020-01-01' });

    const lecture = await lireFerme(app, compte);
    expect(lecture.statusCode, 'la ferme reste lisible').toBe(200);
    expect(lecture.json().access).toEqual({
      canWrite: false,
      reason: 'essai_expire',
      until: '2020-01-01',
    });

    const archive = await app.inject({
      method: 'GET',
      url: `/api/farms/${compte.farmId}/export.zip`,
      headers: { cookie: compte.cookie },
    });
    expect(archive.statusCode, 'et exportable').toBe(200);
  });
});

describe('politique abonnement', () => {
  it('laisse écrire tant que l’échéance court', async () => {
    const { app, compte } = await monter('abonnement');
    await fixerEcheances(compte.farmId, { essai: '2020-01-01', paye: '2099-12-31' });

    expect((await creerSerie(app, compte)).statusCode).toBe(201);
  });

  it('refuse quand l’échéance et l’essai sont passés', async () => {
    const { app, compte } = await monter('abonnement');
    await fixerEcheances(compte.farmId, { essai: '2020-01-01', paye: '2020-06-30' });

    const refus = await creerSerie(app, compte);

    expect(refus.statusCode).toBe(403);
    expect(refus.json().details.reason).toBe('abonnement_expire');
  });
});

describe('suspension', () => {
  it('prime sur une échéance à jour', async () => {
    const { app, compte } = await monter('abonnement');
    await fixerEcheances(compte.farmId, { essai: '2099-01-01', paye: '2099-12-31' });
    await getPrisma().farm.update({ where: { id: compte.farmId }, data: { locked: true } });

    const refus = await creerSerie(app, compte);

    expect(refus.statusCode).toBe(403);
    expect(refus.json().details.reason).toBe('suspendue');
  });
});
