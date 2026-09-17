// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Files de fond (BullMQ + Redis). Aujourd'hui une seule file, les courriels ; le brief
// prévoit d'y faire passer aussi les exports volumineux et la régénération massive des
// tâches, d'où un module à part plutôt qu'un bout de code dans le plugin des courriels.
//
// Deux choix de connexion méritent une explication :
//
//   * `maxRetriesPerRequest: null` est une exigence de BullMQ. Le worker tient une
//     commande bloquante ouverte en permanence ; avec un plafond de tentatives, ioredis
//     la déclare en échec au premier hoquet du réseau et le worker s'arrête.
//   * `lazyConnect: true` n'ouvre rien à la construction : l'API démarre même si Redis est
//     momentanément absent, et le plugin lance la connexion en tâche de fond.
//
// Le producteur (l'API) et le consommateur (le worker) n'attendent pas la même chose d'une
// panne de Redis, d'où deux réglages distincts :
//
//   * côté API, `enableOfflineQueue: false` : une commande impossible échoue au lieu
//     d'attendre son tour derrière `maxRetriesPerRequest: null`, qui la ferait patienter
//     sans fin. Ce réglage seul ne suffit pourtant pas — `Queue.add()` attend d'abord que
//     la connexion soit prête, avant même d'émettre une commande. C'est `QueuedMailer` qui
//     tranche, en interrogeant `connection.status` et en bornant l'attente.
//   * côté worker, la file d'attente locale reste active : lui n'a personne à faire
//     patienter, et mieux vaut qu'il traverse une coupure sans rien perdre.

import { Queue } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';
import type { MailMessage } from './mail.js';

/** Nom de la file des courriels. Il est écrit en toutes lettres dans Redis : il ne bouge plus. */
export const MAIL_QUEUE = 'courriels';

/**
 * Ce que `QueuedMailer` attend d'une file : de quoi la remplacer par un double dans les
 * tests sans lancer Redis.
 */
export interface JobQueue<T> {
  add(name: string, data: T): Promise<unknown>;
  close(): Promise<void>;
}

export function createRedis(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true, ...options });
}

/** Connexion du producteur : une commande impossible échoue au lieu d'attendre son tour. */
export function createProducerRedis(url: string): Redis {
  return createRedis(url, { enableOfflineQueue: false });
}

/**
 * Cinq tentatives espacées exponentiellement à partir de dix secondes, soit un peu plus de
 * deux minutes et demie de patience : de quoi traverser un redémarrage de serveur SMTP.
 * Les travaux réussis disparaissent vite, les échoués restent une semaine — c'est la trace
 * qui permet de répondre à « je n'ai jamais reçu l'invitation ».
 */
export const MAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
};

export function createMailQueue(connection: Redis): Queue<MailMessage> {
  return new Queue<MailMessage>(MAIL_QUEUE, {
    connection,
    defaultJobOptions: MAIL_JOB_OPTIONS,
  });
}
