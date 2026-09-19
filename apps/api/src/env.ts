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

  /**
   * Redis des files de fond, par exemple `redis://localhost:6379`. Absent, les courriels
   * partent dans la requête qui les déclenche : pratique en développement, à éviter en
   * production où un serveur SMTP lent se paie sur le temps de réponse.
   */
  REDIS_URL: z.string().min(1).optional(),
  /** Courriels traités de front par le worker. Un SMTP domestique n'aime pas les rafales. */
  MAIL_CONCURRENCY: z.coerce.number().int().positive().default(4),

  /**
   * Qui décide du droit d'écrire sur une ferme. `ouverte` par défaut : sans configuration,
   * la réponse est toujours oui, et aucun code de facturation n'entre en jeu. C'est ce qui
   * permet à ce dépôt AGPL d'être auto-hébergé sans porter une logique commerciale dont
   * personne n'a l'usage. Voir `brief/abonnements-et-centres-de-formation.md`.
   */
  ACCESS_POLICY: z.enum(['ouverte', 'essai', 'abonnement']).default('ouverte'),

  /**
   * Requêtes admises par minute et par adresse. La valeur par défaut protège d'un abus
   * sans gêner personne — un poste seul ne s'en approche pas.
   *
   * Elle se règle parce qu'**une adresse n'est pas une personne** : derrière un routeur ou
   * un proxy inverse, une ferme entière partage la même adresse publique, et un lycée
   * agricole avec vingt apprenants sur le même réseau encore davantage. Sans ce réglage,
   * la seule réponse serait de retirer la protection.
   */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().max(1_000_000).default(600),

  /**
   * Service de recherche d'adresse, pour situer une ferme sur la carte.
   *
   * `ban` — la Base Adresse Nationale française, libre et sans clé. `none` éteint la
   * recherche : on saisit alors ses coordonnées à la main, et **rien ne sort de Sillon**.
   *
   * Ce réglage existe parce que chercher une adresse envoie celle de la ferme à un tiers.
   * Pour une exploitation individuelle, c'est une donnée personnelle — et c'est le seul
   * endroit où Sillon parle à l'extérieur. Il faut pouvoir dire non.
   */
  GEOCODING: z.enum(['ban', 'none']).default('ban'),
  /** Adresse du service, pour pointer une instance à soi plutôt que la publique. */
  GEOCODING_URL: z.string().default('https://api-adresse.data.gouv.fr/search/'),

  /**
   * Fond de carte supplémentaire, à la charge du déploiement. Sillon ne livre
   * qu'OpenStreetMap : les imageries aériennes gratuites d'Esri ou de Google interdisent
   * la redistribution, et les inscrire ici ferait porter à chaque auto-hébergeur une
   * violation qu'il n'a pas choisie. L'attribution est **obligatoire**, pas décorative.
   */
  MAP_TILE_URL: z.string().optional(),
  MAP_TILE_ATTRIBUTION: z.string().optional(),

  /**
   * Dossier du build de l'interface, pour la servir **depuis l'API**. Absent, l'API ne rend
   * que du JSON et l'interface est servie à part (Nginx, comme dans `docker-compose.yml`).
   *
   * Cette option existe pour les hébergements gratuits, qui n'accordent qu'un seul service
   * web : voir la section « Déployer » du README.
   */
  WEB_DIST: z.string().min(1).optional(),

  /**
   * Dossier des photos quand aucun stockage objet n'est configuré. Relatif au processus,
   * donc à préciser dès qu'on dépasse le développement.
   */
  UPLOAD_DIR: z.string().min(1).optional(),
  /**
   * Stockage objet des photos. `S3_BUCKET` commande : sans lui, les photos restent sur
   * disque. Le brief veut un hébergement européen, donc un service compatible S3
   * (Scaleway, OVH, Hetzner) plutôt qu'AWS — d'où `S3_ENDPOINT`.
   */
  S3_BUCKET: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_REGION: z.string().default('fr-par'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Préfixe des clés, pour partager un seau entre plusieurs déploiements. */
  S3_PREFIX: z.string().min(1).optional(),
  /** Voir `S3Storage` : MinIO et plusieurs services européens exigent la forme chemin. */
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),

  /**
   * Supervision des erreurs (§6 du brief). Absent, rien n'est envoyé nulle part et le
   * module de supervision reste inerte : un déploiement auto-hébergé n'a rien à configurer,
   * et rien ne sort de la machine sans qu'on l'ait demandé.
   */
  SENTRY_DSN: z.string().min(1).optional(),
  /** Nom de l'environnement dans Sentry : « production », « recette »… */
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  /** Part des transactions tracées, entre 0 et 1. Zéro par défaut : seules les erreurs partent. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
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
