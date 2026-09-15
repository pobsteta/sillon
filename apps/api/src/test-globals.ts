// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Chargé une fois avant les tests d'intégration : bascule la connexion sur la base de test
// et y applique les migrations. Une base PostgreSQL 16 avec citext, unaccent et ltree est
// nécessaire (voir le README) ; sans elle, les tests de l'API échouent avec le message ci-dessous.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://sillon:sillon@localhost:5432/sillon_test?schema=public';
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';

  // Vitest peut être lancé depuis la racine du dépôt : Prisma a besoin du dossier de l'API.
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch {
    throw new Error(
      `Impossible d'appliquer les migrations sur ${url}.\n` +
        'Les tests de l’API ont besoin d’une base PostgreSQL de test : voir « Démarrage rapide » dans le README.',
    );
  }
}
