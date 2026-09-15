// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (mécanique d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Comptes et sessions. Comme Brinjel, un jeton opaque est remis au client et seul son
// condensé est stocké : une fuite de la table `users_tokens` ne donne aucune session.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Tx } from './db.js';

export const SESSION_COOKIE = 'sillon_session';
export const SESSION_CONTEXT = 'session';
export const CONFIRM_CONTEXT = 'confirm';
export const RESET_CONTEXT = 'reset_password';

/** Paramètres Argon2id : coût mémoire 19 Mio, 2 passes (recommandation OWASP). */
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hashed, password);
  } catch {
    // Un hachage corrompu ne doit pas distinguer « mot de passe faux » de « compte cassé ».
    return false;
  }
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Condensé SHA-256 du jeton, dans le `Uint8Array` attendu par Prisma pour une colonne `Bytes`. */
export function digestToken(token: string): Uint8Array<ArrayBuffer> {
  const digest = new Uint8Array(32);
  digest.set(createHash('sha256').update(token).digest());
  return digest;
}

export function tokensMatch(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(db: Tx, userId: number): Promise<string> {
  const token = generateToken();
  await db.userToken.create({
    data: { userId, token: digestToken(token), context: SESSION_CONTEXT },
  });
  return token;
}

export interface SessionUser {
  id: number;
  email: string;
  locale: string;
  confirmedAt: Date | null;
}

/** Retrouve l'utilisateur d'un jeton de session, si celui-ci n'a pas expiré. */
export async function userFromSessionToken(
  db: Tx,
  token: string,
  maxAgeDays: number,
): Promise<SessionUser | null> {
  const record = await db.userToken.findFirst({
    where: {
      token: digestToken(token),
      context: SESSION_CONTEXT,
      insertedAt: { gte: new Date(Date.now() - maxAgeDays * 86_400_000) },
    },
    include: { user: true },
  });
  if (!record) return null;
  return {
    id: record.user.id,
    email: record.user.email,
    locale: record.user.locale,
    confirmedAt: record.user.confirmedAt,
  };
}

export async function deleteSession(db: Tx, token: string): Promise<void> {
  await db.userToken.deleteMany({
    where: { token: digestToken(token), context: SESSION_CONTEXT },
  });
}

/** Hiérarchie des rôles : le propriétaire peut tout ce que peut un chef de culture, etc. */
const ROLE_RANK = { member: 1, manager: 2, owner: 3 } as const;
export type Role = keyof typeof ROLE_RANK;

export function roleAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
