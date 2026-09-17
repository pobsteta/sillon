// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./src/test-globals.ts'],
    setupFiles: ['./src/test-env.ts'],
    // Les tests d'intégration partagent UNE base et la vident (`TRUNCATE`) avant chaque
    // essai : deux fichiers qui tourneraient de front se videraient la base l'un l'autre.
    //
    // `fileParallelism` ne se règle qu'à la racine et se perd quand Vitest exécute des
    // projets ; `singleFork` tient au niveau du projet, et c'est bien ici que la
    // contrainte appartient — sans ralentir `core` et `web`, eux sans base.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
