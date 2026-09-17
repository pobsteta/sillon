// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Droit d'écrire sur une ferme.
//
// Sillon sert trois modèles — auto-hébergement, gratuit, service payant — et l'AGPL
// garantit qu'il sera auto-hébergé, que le service existe ou non. La facturation est donc
// une propriété d'un **déploiement**, pas du produit : l'application pose une seule
// question, « cette ferme peut-elle écrire ? », et la politique qui répond est
// interchangeable. Sans configuration, la réponse est toujours oui.
//
// Deux principes gouvernent ce fichier, et ils ne sont pas techniques :
//
//   * **on ne refuse jamais la lecture.** Une échéance dépassée fait passer la ferme en
//     lecture seule, export compris : c'est une saison entière de travail, l'export en
//     libre-service est promis par le brief, et couper l'accès aux données de quelqu'un
//     pour un défaut de paiement est le meilleur moyen de se faire détester ;
//   * **l'essai reste acquis.** Sous la politique `abonnement`, un abonnement échu ne
//     reprend pas un essai encore en cours — la personne garde ce qu'on lui avait donné.

import type { IsoDate } from './types.js';

/** Qui décide du droit d'écrire. */
export type AccessPolicy =
  /** Toujours oui. Le défaut : auto-hébergement, lycée, usage associatif. */
  | 'ouverte'
  /** Oui jusqu'à la fin de l'essai. */
  | 'essai'
  /** Oui tant que l'abonnement court, l'essai restant acquis. */
  | 'abonnement';

/** Pourquoi la réponse est celle-là. C'est ce que l'interface affiche. */
export type AccessReason =
  'ouverte' | 'essai' | 'essai_expire' | 'abonnement' | 'abonnement_expire' | 'suspendue';

export interface FarmAccessInput {
  policy: AccessPolicy;
  /** Suspension administrative, rare et manuelle. Elle prime sur tout. */
  locked: boolean;
  trialExpiryDate: IsoDate;
  /** Échéance de l'abonnement. Posée à la main, ou par l'outil de facturation. */
  paidUntil?: IsoDate | null;
  /** Jour considéré, pour que la règle soit une fonction et non une horloge. */
  on: IsoDate;
}

export interface FarmAccess {
  canWrite: boolean;
  reason: AccessReason;
  /** Jusqu'à quand l'écriture est acquise, quand cela a un sens. */
  until: IsoDate | null;
}

/**
 * Le droit d'écrire sur une ferme, un jour donné.
 *
 * Les dates sont comparées en ISO, donc lexicographiquement : `2026-09-17` vient bien après
 * `2026-08-31`. L'échéance est **incluse** — on écrit encore le dernier jour.
 */
export function farmAccess(input: FarmAccessInput): FarmAccess {
  const { policy, locked, trialExpiryDate, paidUntil, on } = input;

  // La suspension prime sur la politique : c'est une décision d'exploitant, pas de commerce.
  if (locked) return { canWrite: false, reason: 'suspendue', until: null };

  if (policy === 'ouverte') return { canWrite: true, reason: 'ouverte', until: null };

  const abonnementCourt = policy === 'abonnement' && paidUntil != null && on <= paidUntil;
  if (abonnementCourt) return { canWrite: true, reason: 'abonnement', until: paidUntil! };

  // L'essai vaut sous les deux politiques : sous `abonnement`, il est ce qui précède le
  // premier paiement, et un abonnement échu ne doit pas le reprendre.
  if (on <= trialExpiryDate) return { canWrite: true, reason: 'essai', until: trialExpiryDate };

  return policy === 'abonnement'
    ? { canWrite: false, reason: 'abonnement_expire', until: paidUntil ?? trialExpiryDate }
    : { canWrite: false, reason: 'essai_expire', until: trialExpiryDate };
}

/**
 * Une requête écrit-elle ? La méthode HTTP suffit à le dire, et c'est ce qui permet de tenir
 * le verrou en **un seul endroit** plutôt que de qualifier route par route — une liste qu'on
 * oublierait de compléter à la prochaine route ajoutée.
 */
export function ecritureHttp(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
