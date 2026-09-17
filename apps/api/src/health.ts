// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sondes de supervision (§8 du brief : page d'état publique, objectif 99,9 %).
//
// Deux sondes, parce qu'on répond à deux questions différentes :
//
//   * `/health` dit « ce processus est vivant ». Un répartiteur de charge l'interroge
//     plusieurs fois par minute ; elle ne doit toucher à rien et répondre tout de suite.
//   * `/ready` dit « le service peut travailler ». Elle interroge la base, la file et le
//     stockage. C'est celle qu'une page d'état publique surveille.
//
// Toutes les dépendances ne pèsent pas pareil, et c'est le cœur de ce fichier. Sans
// PostgreSQL, il n'y a pas de service. Sans Redis, les courriels partent quand même, en
// direct — `QueuedMailer` est fait pour ça. Sans stockage objet, les photos ne s'affichent
// plus mais le plan de culture, les tâches et les récoltes continuent. Répondre « en
// panne » dans les trois cas ferait sonner une astreinte la nuit pour une photo.

/** Une dépendance vérifiée, et le temps qu'elle a mis à répondre. */
export interface Sonde {
  name: string;
  status: 'ok' | 'ko';
  /** Cause de l'échec, en clair et sans détail d'implémentation. */
  detail?: string;
  ms: number;
  /** Le service peut-il rendre un service utile sans elle ? */
  essential: boolean;
}

export type EtatGlobal = 'ok' | 'degraded' | 'ko';

/**
 * État d'ensemble. Une dépendance essentielle à terre, c'est une panne ; une dépendance
 * secondaire à terre, c'est un service dégradé — qui mérite une alerte, mais pas la même.
 */
export function agreger(sondes: readonly Sonde[]): EtatGlobal {
  if (sondes.some((sonde) => sonde.status === 'ko' && sonde.essential)) return 'ko';
  if (sondes.some((sonde) => sonde.status === 'ko')) return 'degraded';
  return 'ok';
}

/** Code HTTP correspondant : seule une panne franche sort du 200. */
export function statutHttp(etat: EtatGlobal): number {
  return etat === 'ko' ? 503 : 200;
}

/**
 * Première ligne du message, écourtée. Une page d'état est publique, et les messages des
 * pilotes sont bavards : celui de Prisma tient sur cinq lignes et cite la requête. On garde
 * de quoi reconnaître la panne, pas de quoi décrire l'intérieur de la maison.
 */
function resumerErreur(error: unknown): string {
  if (!(error instanceof Error)) return 'échec';
  const premiere = error.message.split('\n')[0]?.trim() ?? '';
  if (!premiere) return 'échec';
  return premiere.length > 120 ? `${premiere.slice(0, 117)}…` : premiere;
}

/**
 * Exécute une vérification en la bornant dans le temps. Sans cette borne, une dépendance
 * qui ne répond plus — le cas le plus courant, bien avant le refus franc — ferait pendre la
 * sonde elle-même, et la page d'état afficherait un point d'interrogation au lieu d'une
 * panne.
 */
export async function sonder(
  name: string,
  essential: boolean,
  delaiMs: number,
  verifier: () => Promise<unknown>,
): Promise<Sonde> {
  const debut = Date.now();
  let minuteur: NodeJS.Timeout | undefined;
  try {
    const echeance = new Promise<never>((_, rejette) => {
      minuteur = setTimeout(() => rejette(new Error(`pas de réponse en ${delaiMs} ms`)), delaiMs);
    });
    await Promise.race([verifier(), echeance]);
    return { name, status: 'ok', ms: Date.now() - debut, essential };
  } catch (error) {
    return {
      name,
      status: 'ko',
      detail: resumerErreur(error),
      ms: Date.now() - debut,
      essential,
    };
  } finally {
    clearTimeout(minuteur);
  }
}
