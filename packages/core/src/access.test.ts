// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Droit d'écrire sur une ferme. Ce qui compte ici n'est pas d'accorder mais de refuser
// proprement : qui perd le droit d'écrire, quand, et ce qu'il garde malgré tout.

import { describe, expect, it } from 'vitest';
import { ecritureHttp, farmAccess, type FarmAccessInput } from './access.js';

const base: FarmAccessInput = {
  policy: 'ouverte',
  locked: false,
  trialExpiryDate: '2026-06-30',
  paidUntil: null,
  on: '2026-09-17',
};

describe('politique ouverte', () => {
  it('laisse écrire, essai expiré ou non', () => {
    // Le défaut : auto-hébergement, lycée, usage associatif. Aucune échéance ne s'applique.
    expect(farmAccess(base)).toEqual({ canWrite: true, reason: 'ouverte', until: null });
  });
});

describe('politique essai', () => {
  const essai = { ...base, policy: 'essai' as const };

  it('laisse écrire pendant l’essai', () => {
    expect(farmAccess({ ...essai, on: '2026-05-01' })).toEqual({
      canWrite: true,
      reason: 'essai',
      until: '2026-06-30',
    });
  });

  it('laisse écrire le dernier jour', () => {
    // L'échéance est incluse : on ne coupe pas quelqu'un le jour qu'on lui avait promis.
    expect(farmAccess({ ...essai, on: '2026-06-30' }).canWrite).toBe(true);
  });

  it('passe en lecture seule le lendemain', () => {
    expect(farmAccess({ ...essai, on: '2026-07-01' })).toEqual({
      canWrite: false,
      reason: 'essai_expire',
      until: '2026-06-30',
    });
  });
});

describe('politique abonnement', () => {
  const abonnement = { ...base, policy: 'abonnement' as const };

  it('laisse écrire tant que l’abonnement court', () => {
    expect(farmAccess({ ...abonnement, paidUntil: '2027-03-31' })).toEqual({
      canWrite: true,
      reason: 'abonnement',
      until: '2027-03-31',
    });
  });

  it('garde l’essai acquis avant tout abonnement', () => {
    // Une ferme s'inscrit, essaie, puis paie. Entre les deux, elle écrit.
    expect(farmAccess({ ...abonnement, paidUntil: null, on: '2026-05-01' })).toEqual({
      canWrite: true,
      reason: 'essai',
      until: '2026-06-30',
    });
  });

  it('ne reprend pas un essai encore en cours quand l’abonnement s’arrête', () => {
    // Le cas qui mérite d'être nommé : abonnement échu, essai pas encore fini. On garde ce
    // qu'on avait donné plutôt que de le retirer parce qu'un paiement a cessé.
    expect(farmAccess({ ...abonnement, paidUntil: '2026-04-30', on: '2026-05-15' })).toEqual({
      canWrite: true,
      reason: 'essai',
      until: '2026-06-30',
    });
  });

  it('passe en lecture seule quand tout est échu', () => {
    expect(farmAccess({ ...abonnement, paidUntil: '2026-04-30', on: '2026-09-17' })).toEqual({
      canWrite: false,
      reason: 'abonnement_expire',
      until: '2026-04-30',
    });
  });
});

describe('suspension administrative', () => {
  it('prime sur toutes les politiques', () => {
    // C'est une décision d'exploitant, pas de commerce : elle ne se discute pas avec un
    // abonnement à jour.
    for (const policy of ['ouverte', 'essai', 'abonnement'] as const) {
      expect(farmAccess({ ...base, policy, locked: true, paidUntil: '2099-01-01' })).toEqual({
        canWrite: false,
        reason: 'suspendue',
        until: null,
      });
    }
  });
});

describe('ce qui compte comme une écriture', () => {
  it('reconnaît les méthodes qui modifient', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(ecritureHttp(method), method).toBe(true);
    }
  });

  it('laisse passer les lectures', () => {
    // L'export est un GET : il reste accessible d'une ferme en lecture seule, ce qui est
    // tout l'objet du choix « lecture seule » plutôt que « accès refusé ».
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(ecritureHttp(method), method).toBe(false);
    }
  });
});
