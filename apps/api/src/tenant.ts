// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Isolation multi-ferme. Chaque requête métier s'exécute dans une transaction où
// `app.farm_id` est posé : les politiques RLS (migration 20260915120100) n'y laissent
// voir que les lignes de cette ferme, même si une requête oublie son `where farmId`.

import { getPrisma, type Tx } from './db.js';

const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const;

/** Exécute `fn` dans le contexte d'une ferme. Tout ce qui sort de `fn` est déjà filtré. */
export async function withFarm<T>(farmId: number, fn: (db: Tx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    // `true` en troisième argument : le réglage est local à la transaction.
    await tx.$executeRaw`SELECT set_config('app.farm_id', ${String(farmId)}, true)`;
    return fn(tx);
  }, TRANSACTION_OPTIONS);
}

/**
 * Exécute `fn` sans isolation : réservé aux opérations transverses (création d'une ferme,
 * duplication d'une ferme modèle, amorçage du référentiel, comptes utilisateurs).
 */
export async function withoutFarmScope<T>(fn: (db: Tx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  }, TRANSACTION_OPTIONS);
}
