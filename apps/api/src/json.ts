// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Le modèle reprend les `bigint` de Brinjel (longueurs, prix). `JSON.stringify` refuse
// les BigInt : on les sérialise en nombres. Les valeurs manipulées (centimètres, centimes)
// restent très en deçà de Number.MAX_SAFE_INTEGER.

declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint): number {
  return Number(this);
};

export {};
