// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  /** Durée de vie d'une session, en jours. */
  SESSION_DAYS: z.coerce.number().int().positive().default(60),

  /**
   * Serveur SMTP, par exemple `smtps://utilisateur:motdepasse@serveur:465`. Absent, les
   * courriels s'affichent dans la console : de quoi dérouler un parcours en
   * développement sans rien configurer.
   */
  SMTP_URL: z.string().min(1).optional(),
  /** Expéditeur des courriels transactionnels. */
  MAIL_FROM: z.string().default('Sillon <ne-pas-repondre@localhost>'),
  /** Adresse publique de l'interface, pour fabriquer les liens des courriels. */
  APP_URL: z.string().default('http://localhost:5173'),
  /** Validité des liens de confirmation et de réinitialisation, en heures. */
  TOKEN_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // En développement et en test, un secret par défaut évite d'imposer un .env pour démarrer.
  const relaxed =
    source.NODE_ENV !== 'production' && !source.SESSION_SECRET
      ? { ...source, SESSION_SECRET: 'sillon-developpement-secret-non-securise' }
      : source;

  const parsed = EnvSchema.safeParse(relaxed);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${details.join('\n')}`);
  }
  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
