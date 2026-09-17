// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sondes de supervision. Ce qui se joue ici n'est pas « la base répond-elle » — ça, c'est
// l'affaire de la base — mais la lecture qu'on en fait : quelle panne réveille quelqu'un,
// quelle panne attend le matin, et une sonde qui ne répond pas doit-elle bloquer.

import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { agreger, sonder, statutHttp, type Sonde } from './health.js';
import { createTestApp, resetDatabase } from './test-support.js';

const ok = (name: string, essential: boolean): Sonde => ({ name, status: 'ok', ms: 1, essential });
const ko = (name: string, essential: boolean): Sonde => ({ name, status: 'ko', ms: 1, essential });

describe('lecture de l’état d’ensemble', () => {
  it('tout debout : en service', () => {
    expect(agreger([ok('postgresql', true), ok('redis', false)])).toBe('ok');
  });

  it('une dépendance essentielle à terre : en panne', () => {
    expect(agreger([ko('postgresql', true), ok('redis', false)])).toBe('ko');
  });

  it('une dépendance secondaire à terre : dégradé, pas en panne', () => {
    // Sans Redis, les courriels partent en direct et le reste de l'application fonctionne.
    // Annoncer une panne ferait sonner une astreinte la nuit pour un service qui rend
    // encore service.
    expect(agreger([ok('postgresql', true), ko('redis', false), ko('stockage', false)])).toBe(
      'degraded',
    );
  });

  it('l’essentiel l’emporte sur le secondaire', () => {
    expect(agreger([ko('postgresql', true), ko('redis', false)])).toBe('ko');
  });

  it('seule une panne franche sort du 200', () => {
    // Une page d'état lit le corps ; un réveil automatique lit le code. Un service dégradé
    // ne doit pas déclencher de bascule chez un répartiteur de charge.
    expect(statutHttp('ok')).toBe(200);
    expect(statutHttp('degraded')).toBe(200);
    expect(statutHttp('ko')).toBe(503);
  });
});

describe('sonde individuelle', () => {
  it('rend la main quand la vérification passe', async () => {
    const sonde = await sonder('postgresql', true, 500, async () => 1);

    expect(sonde.status).toBe('ok');
    expect(sonde.essential).toBe(true);
    expect(sonde.detail).toBeUndefined();
  });

  it('retient la cause, en clair', async () => {
    const sonde = await sonder('redis', false, 500, async () => {
      throw new Error('connexion refusée');
    });

    expect(sonde.status).toBe('ko');
    expect(sonde.detail).toBe('connexion refusée');
  });

  it('écourte un message bavard à sa première ligne', async () => {
    // Celui de Prisma tient sur cinq lignes et recopie la requête. Une page d'état est
    // publique : on garde de quoi reconnaître la panne, pas de quoi décrire la maison.
    const sonde = await sonder('postgresql', true, 500, async () => {
      throw new Error(
        'Invalid `prisma.$queryRaw()` invocation:\n\nServer has closed the connection.\n  at Object.<anonymous>',
      );
    });

    expect(sonde.detail).toBe('Invalid `prisma.$queryRaw()` invocation:');
  });

  it('borne la longueur du détail', async () => {
    const sonde = await sonder('stockage', false, 500, async () => {
      throw new Error('x'.repeat(400));
    });

    expect(sonde.detail!.length).toBeLessThanOrEqual(120);
    expect(sonde.detail!.endsWith('…')).toBe(true);
  });

  it('n’attend pas indéfiniment une dépendance muette', async () => {
    // Le cas le plus courant, bien avant le refus franc : la dépendance ne répond plus.
    // Sans échéance, c'est la sonde qui pend, et la page d'état n'affiche plus rien.
    const debut = Date.now();
    const sonde = await sonder('stockage', false, 30, () => new Promise(() => undefined));

    expect(sonde.status).toBe('ko');
    expect(sonde.detail).toMatch(/pas de réponse en 30 ms/);
    expect(Date.now() - debut).toBeLessThan(2_000);
  });
});

describe('routes de supervision', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    await app?.close();
  });

  it('sépare « vivant » de « prêt »', async () => {
    await resetDatabase();
    app = await createTestApp();

    // `/health` ne touche à rien : c'est ce qui permet de l'interroger toutes les secondes.
    const vivant = await app.inject({ method: 'GET', url: '/health' });
    expect(vivant.statusCode).toBe(200);
    expect(vivant.json().status).toBe('ok');

    // `/ready` interroge les dépendances. La base de test est debout, le stockage local
    // aussi ; Redis n'est pas configuré en essai, donc il n'est pas sondé.
    const pret = await app.inject({ method: 'GET', url: '/ready' });
    expect(pret.statusCode).toBe(200);
    const corps = pret.json();
    expect(corps.status).toBe('ok');
    expect(corps.sondes.map((sonde: Sonde) => sonde.name)).toEqual(['postgresql', 'stockage']);
    expect(corps.sondes.every((sonde: Sonde) => sonde.status === 'ok')).toBe(true);
  });

  it('ne publie aucun détail d’infrastructure', async () => {
    // La page d'état est publique : ni chaîne de connexion, ni chemin, ni trace d'appels.
    const pret = await app.inject({ method: 'GET', url: '/ready' });

    expect(pret.body).not.toMatch(/postgresql:\/\/|password|sillon_app|\/repo|at Object\./);
  });
});
