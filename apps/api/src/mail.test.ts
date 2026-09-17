// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// File de fond des courriels. Ces essais ne lancent pas Redis : ce qu'on vérifie ici,
// c'est la décision — mettre en file, retomber sur l'envoi direct, livrer le message —
// et non le fonctionnement de BullMQ, qui a ses propres essais.

import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { CaptureMailer, QueuedMailer, type MailMessage } from './mail.js';
import { deliverMail } from './worker.js';
import { createProducerRedis, createRedis, type JobQueue } from './queue.js';

const message: MailMessage = {
  to: 'maraichere@example.org',
  subject: 'Confirmez votre adresse Sillon',
  text: 'https://sillon.example/confirmation/abc',
  html: '<p>https://sillon.example/confirmation/abc</p>',
};

/** File de substitution : garde ce qu'on lui confie, refuse, ou ne répond jamais. */
class FakeQueue implements JobQueue<MailMessage> {
  readonly jobs: { name: string; data: MailMessage }[] = [];
  closed = false;

  constructor(private readonly comportement: Error | 'sans réponse' | undefined = undefined) {}

  async add(name: string, data: MailMessage): Promise<unknown> {
    if (this.comportement === 'sans réponse') return new Promise(() => undefined);
    if (this.comportement) throw this.comportement;
    this.jobs.push({ name, data });
    return { id: String(this.jobs.length) };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe('QueuedMailer', () => {
  it('met le message en file au lieu de l’envoyer', async () => {
    const queue = new FakeQueue();
    const transport = new CaptureMailer();

    await new QueuedMailer(queue, transport).send(message);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]!.data).toEqual(message);
    // Rien n'est parti dans la requête : c'est tout l'objet de la file.
    expect(transport.sent).toHaveLength(0);
  });

  it('envoie quand même, et le journalise, si la file refuse', async () => {
    const queue = new FakeQueue(new Error('Redis arrêté'));
    const transport = new CaptureMailer();
    const journal: unknown[] = [];

    await new QueuedMailer(queue, transport, { log: (error) => journal.push(error) }).send(message);

    // Perdre une invitation serait pire que rendre la main une seconde plus tard.
    expect(transport.sent).toEqual([message]);
    expect(journal).toHaveLength(1);
    expect((journal[0] as Error).message).toBe('Redis arrêté');
  });

  it('n’appelle même pas une file qu’on sait injoignable', async () => {
    const queue = new FakeQueue('sans réponse');
    const transport = new CaptureMailer();

    await new QueuedMailer(queue, transport, {
      joignable: () => false,
      log: () => undefined,
    }).send(message);

    // Aucune commande émise, donc rien qui puisse repartir en double au retour de Redis.
    expect(queue.jobs).toHaveLength(0);
    expect(transport.sent).toEqual([message]);
  });

  it('ne reste pas suspendu sur une file qui ne répond pas', async () => {
    // Le cas qui a motivé le délai : `Queue.add()` attend que la connexion soit prête, et
    // cette attente n'a pas de fin. Sans échéance, c'est la requête HTTP qui se fige.
    const queue = new FakeQueue('sans réponse');
    const transport = new CaptureMailer();
    const journal: unknown[] = [];

    await new QueuedMailer(queue, transport, {
      delaiMs: 20,
      log: (error) => journal.push(error),
    }).send(message);

    expect(transport.sent).toEqual([message]);
    expect((journal[0] as Error).message).toMatch(/sans réponse au bout de 20 ms/);
  });
});

describe('worker', () => {
  it('livre au transport le message porté par le travail', async () => {
    const transport = new CaptureMailer();

    await deliverMail(transport)({ data: message } as Parameters<
      ReturnType<typeof deliverMail>
    >[0]);

    expect(transport.sent).toEqual([message]);
  });

  it('laisse remonter l’échec, pour que la file réessaie', async () => {
    const transport: { send: () => Promise<void> } = {
      send: () => Promise.reject(new Error('550 boîte pleine')),
    };

    await expect(
      deliverMail(transport)({ data: message } as Parameters<ReturnType<typeof deliverMail>>[0]),
    ).rejects.toThrow('550 boîte pleine');
  });
});

describe('connexions Redis', () => {
  it('refuse tout de suite côté API, patiente côté worker', () => {
    // Réglages discrets, et assez ressemblants pour qu'on les uniformise par mégarde : côté
    // API une commande impossible doit échouer plutôt que d'attendre son tour derrière
    // `maxRetriesPerRequest: null` ; côté worker, qui n'a personne à faire patienter,
    // attendre est exactement ce qu'on veut.
    const producteur = createProducerRedis('redis://127.0.0.1:6379');
    const consommateur = createRedis('redis://127.0.0.1:6379');

    expect(producteur.options.enableOfflineQueue).toBe(false);
    expect(consommateur.options.enableOfflineQueue).not.toBe(false);
    // Les deux exigences de BullMQ, communes aux deux bouts.
    for (const connexion of [producteur, consommateur]) {
      expect(connexion.options.maxRetriesPerRequest).toBeNull();
      expect(connexion.options.lazyConnect).toBe(true);
    }

    producteur.disconnect();
    consommateur.disconnect();
  });
});

describe('câblage du transport', () => {
  const apps: FastifyInstance[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('sans REDIS_URL, l’API envoie dans la requête', async () => {
    const app = await buildApp({ NODE_ENV: 'test' });
    apps.push(app);
    expect(app.mailer).not.toBeInstanceOf(QueuedMailer);
  });

  it('avec REDIS_URL, l’API met en file', async () => {
    // Aucun Redis n'écoute sur ce port pendant les essais, et c'est le sujet : la connexion
    // s'ouvre en tâche de fond, le démarrage ne l'attend pas. Une API qui refuserait de
    // démarrer faute de Redis serait une panne bien pire que des courriels ralentis.
    const app = await buildApp({ NODE_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:6379' });
    apps.push(app);
    expect(app.mailer).toBeInstanceOf(QueuedMailer);
  });
});
