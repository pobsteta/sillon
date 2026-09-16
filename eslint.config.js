// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Configuration ESLint « à plat » (ESLint 9). Les dépendances étaient déclarées depuis
// l'échafaudage initial, mais le fichier manquait : `npm run lint` échouait donc depuis
// le premier jour.
//
// Le parti pris : peu de règles, mais qui attrapent de vraies fautes. Le style est
// l'affaire de Prettier, pas d'ESLint — aucune règle de mise en forme ici.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/dev-dist/**',
      'apps/api/prisma/migrations/**',
      'playwright-report/**',
      'test-results/**',
      'specs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Une variable inutilisée signale souvent un oubli ; le préfixe `_` dit
      // « c'est volontaire », ce qui suffit à lever le doute.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Une promesse oubliée avale ses erreurs en silence : le cas s'est déjà produit ici.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // `any` reste possible, mais doit se voir en relecture. Le script `lint` fige le
      // compte actuel avec `--max-warnings` : la dette existante ne bloque personne,
      // mais elle ne grandit pas sans qu'on s'en aperçoive.
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Les fichiers hors de tout tsconfig — configurations, scripts, et les tests, que les
  // tsconfig de compilation excluent — ne peuvent pas être analysés avec les types. On
  // les vérifie sans, plutôt que de ne pas les vérifier du tout.
  {
    files: [
      '*.config.{js,ts}',
      '**/*.config.{js,ts}',
      'scripts/**/*.mjs',
      'eslint.config.js',
      '**/*.test.{ts,tsx}',
      'e2e/**/*.ts',
      'apps/api/prisma/seed.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // Les règles des hooks : elles attrapent des fautes que le typage ne voit pas.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Les tests et les scripts d'outillage parlent à la console et jonglent avec des
  // valeurs peu typées : on y desserre ce qui n'a pas de sens à cet endroit.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**', 'scripts/**', 'apps/api/prisma/seed.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
