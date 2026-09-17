// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Worker des files de fond. Processus distinct de l'API : un envoi qui traîne n'occupe
// plus un serveur qui a des requêtes à servir, et on peut en lancer plusieurs sans
// multiplier les serveurs web.
//
//   node dist/worker.js        (en développement : npm run dev:worker -w @sillon/api)
//
// Il ne traite pour l'instant que les courriels. Les exports volumineux et la régénération
// massive des tâches, prévus au brief, viendront s'ajouter ici.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, type Job } from 'bullmq';
import { loadEnv } from './env.js';
import { createMailer, type Mailer, type MailMessage } from './mail.js';
import { createRedis, MAIL_QUEUE } from './queue.js';
import { initSupervision, signaler, viderSupervision } from './observability.js';

/**
 * Traitement d'un courriel. Isolé du câblage BullMQ pour être joué tel quel dans les
 * tests : une erreur relancée ici, c'est une tentative de plus côté file.
 */
export function deliverMail(mailer: Mailer) {
  return async (job: Job<MailMessage>): Promise<void> => {
    await mailer.send(job.data);
  };
}

function horodatage(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  const env = loadEnv();
  // Le worker est un processus sans requête HTTP : sans supervision, un envoi qui échoue
  // cinq fois de suite ne laisse qu'une ligne dans un journal que personne ne lit.
  initSupervision(env);
  if (!env.REDIS_URL) {
    console.error(
      'REDIS_URL est absent : le worker n’a pas de file à vider.\n' +
        'Sans lui, l’API envoie les courriels directement et ce processus est inutile.',
    );
    process.exit(1);
  }

  // Connexion patiente : le worker n'a personne à faire attendre, il traverse une coupure
  // de Redis plutôt que d'abandonner. L'écouteur évite qu'une erreur de connexion remonte
  // en exception non capturée.
  const connection = createRedis(env.REDIS_URL);
  connection.on('error', (error) => console.error(`${horodatage()} Redis :`, error.message));

  const worker = new Worker<MailMessage>(MAIL_QUEUE, deliverMail(createMailer(env)), {
    connection,
    concurrency: env.MAIL_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    console.info(`${horodatage()} courriel envoyé à ${job.data.to} (travail ${job.id})`);
  });
  worker.on('failed', (job, error) => {
    // Seul l'échec définitif est un incident : les tentatives intermédiaires sont le
    // fonctionnement normal d'une file qui réessaie.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) signaler(error);
    // `attemptsMade` sur le total dit tout de suite s'il reste de l'espoir.
    const reste = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?';
    console.error(
      `${horodatage()} échec d’envoi à ${job?.data.to ?? '?'} (tentative ${reste}) : ${error.message}`,
    );
  });
  worker.on('error', (error) => {
    console.error(`${horodatage()} file des courriels :`, error);
  });

  console.info(
    `${horodatage()} worker démarré sur la file « ${MAIL_QUEUE} » ` +
      `(${env.MAIL_CONCURRENCY} envois de front)`,
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void (async () => {
        console.info(`${horodatage()} arrêt demandé (${signal})`);
        // `close()` laisse finir les envois en cours avant de rendre la main : un courriel
        // à moitié parti serait réessayé, donc envoyé deux fois.
        await worker.close();
        connection.disconnect();
        await viderSupervision();
        process.exit(0);
      })();
    });
  }
}

// Le module est aussi importé par les tests, qui n'ont que faire d'un worker : on ne
// démarre que lancé directement. La comparaison passe par un chemin résolu, parce que
// `file://${argv[1]}` ne correspond pas à `import.meta.url` sous Windows.
const lancéDirectement =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (lancéDirectement) {
  await main();
}
