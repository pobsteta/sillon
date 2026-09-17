// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Comptes : inscription (avec création de la première ferme), connexion, déconnexion.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CONFIRM_CONTEXT,
  RESET_CONTEXT,
  SESSION_COOKIE,
  SESSION_CONTEXT,
  consumeUserToken,
  createSession,
  createUserToken,
  deleteSession,
  forgetUserTokens,
  hashPassword,
  verifyPassword,
} from '../auth.js';
import { confirmationMail, passwordResetMail } from '../mail-templates.js';
import { badRequest, conflict, unauthorized } from '../errors.js';
import {
  normaliserCodeSecours,
  nouveauSecret,
  nouveauxCodesSecours,
  uriOtpauth,
  verifierCode,
  versBase32,
} from '../totp.js';
import { withoutFarmScope } from '../tenant.js';
import type { Tx } from '../db.js';
import { createFarm } from '../farm-setup.js';
import type { Env } from '../env.js';

const password = z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères').max(200);
const email = z.email().transform((value) => value.trim().toLowerCase());

// Haché une fois puis réutilisé : vérifier ce leurre quand l'adresse est inconnue donne
// à l'échec le même temps de réponse qu'un mot de passe faux, sans révéler les inscrits.
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword('utilisateur-inexistant');
  return decoyHash;
}

/**
 * Consomme un code de secours s'il correspond. Un code de secours sert **une fois** : il
 * est effacé dès qu'il a servi, sans quoi le papier qu'on garde dans un tiroir vaudrait
 * mot de passe permanent.
 *
 * Les codes sont hachés comme des mots de passe : une copie de la base ne doit pas donner
 * de quoi se connecter. Il faut donc tous les essayer — ils sont dix, et cette route est
 * limitée en débit.
 */
async function consommerCodeSecours(
  db: Tx,
  codes: readonly { id: number; hashedCode: Uint8Array }[],
  propose: string,
): Promise<boolean> {
  const normalise = normaliserCodeSecours(propose);
  for (const code of codes) {
    if (await verifyPassword(Buffer.from(code.hashedCode).toString('utf8'), normalise)) {
      await db.totpRecoveryCode.delete({ where: { id: code.id } });
      return true;
    }
  }
  return false;
}

export async function authRoutes(app: FastifyInstance, options: { env: Env }): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['authentification'];
  const { TOKEN_HOURS } = options.env;

  /** Lien public vers l'interface, `app.appUrl` faisant foi. */
  const lien = (chemin: string, token: string) =>
    `${app.appUrl}${chemin}/${encodeURIComponent(token)}`;

  /** Fabrique et envoie un lien de confirmation. Silencieux si l'adresse est déjà confirmée. */
  const envoyerConfirmation = async (user: {
    id: number;
    email: string;
    locale: string;
  }): Promise<void> => {
    const token = await withoutFarmScope(async (db) => {
      await forgetUserTokens(db, user.id, CONFIRM_CONTEXT);
      return createUserToken(db, user.id, CONFIRM_CONTEXT, user.email);
    });
    await app.mailer.send(
      confirmationMail({
        to: user.email,
        locale: user.locale,
        url: lien('/confirmation', token),
        validityHours: TOKEN_HOURS,
      }),
    );
  };

  const setSessionCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: options.env.COOKIE_SECURE,
      signed: true,
      maxAge: options.env.SESSION_DAYS * 86_400,
    });
  };

  typed.post(
    '/api/auth/register',
    {
      schema: {
        tags,
        summary: 'Créer un compte et sa première ferme',
        body: z.object({
          email,
          password,
          farmName: z.string().trim().min(1).max(120).default('Ma ferme'),
          locale: z.enum(['fr', 'en']).default('fr'),
        }),
      },
    },
    async (request, reply) => {
      const { email: address, password: secret, farmName, locale } = request.body;
      const result = await withoutFarmScope(async (db) => {
        const existing = await db.user.findUnique({ where: { email: address } });
        if (existing) throw conflict('Un compte existe déjà pour cette adresse');

        const user = await db.user.create({
          data: { email: address, hashedPassword: await hashPassword(secret), locale },
        });
        const farm = await createFarm(db, { name: farmName, ownerId: user.id, locale });
        const token = await createSession(db, user.id);
        return { user, farm, token };
      });

      setSessionCookie(reply, result.token);
      await envoyerConfirmation(result.user);
      return reply.status(201).send({
        user: { id: result.user.id, email: result.user.email, locale: result.user.locale },
        farm: { id: result.farm.id, name: result.farm.name, slug: result.farm.slug },
      });
    },
  );

  typed.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Ouvrir une session',
        body: z.object({
          email,
          password: z.string().min(1),
          /** Code à six chiffres, ou code de secours, si le compte a un second facteur. */
          totpCode: z.string().min(1).max(20).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { email: address, password: secret, totpCode } = request.body;
      const result = await withoutFarmScope(async (db) => {
        const user = await db.user.findUnique({
          where: { email: address },
          include: { totp: true, recoveryCodes: true },
        });
        // Un mot de passe est vérifié même sans compte : le temps de réponse ne doit pas
        // révéler quelles adresses sont inscrites.
        const valid = await verifyPassword(user ? user.hashedPassword : await decoy(), secret);
        if (!user || !valid) return null;

        // Le second facteur se donne dans la **même** requête que le mot de passe. Un
        // jeton intermédiaire « mot de passe accepté, code attendu » serait un second
        // identifiant à émettre, transporter, expirer et révoquer — soit exactement la
        // pièce qu'on ajoute pour renforcer la connexion et qui finit par l'affaiblir.
        if (user.totp?.enabled && user.totp.secret) {
          if (!totpCode) return { user, token: null, besoinCode: true };

          const secretTotp = Buffer.from(user.totp.secret);
          const pas = verifierCode(secretTotp, totpCode);
          if (pas !== null) {
            // Un code reste valable une demi-minute : refuser le pas déjà employé empêche
            // qu'un code intercepté serve une seconde fois.
            const dejaVu =
              user.totp.lastUsedAt !== null &&
              Math.floor(user.totp.lastUsedAt.getTime() / 1000 / 30) >= pas;
            if (dejaVu) return null;
            await db.totpSettings.update({
              where: { userId: user.id },
              data: { lastUsedAt: new Date(pas * 30 * 1000) },
            });
          } else {
            const consomme = await consommerCodeSecours(db, user.recoveryCodes, totpCode);
            if (!consomme) return null;
          }
        }

        await db.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } });
        return { user, token: await createSession(db, user.id), besoinCode: false };
      });

      if (!result) throw unauthorized('Adresse ou mot de passe incorrect');
      if (result.besoinCode) {
        // 401 avec un code d'erreur nommé : l'interface affiche le champ du code, et rien
        // n'est dit à qui n'a pas déjà le mot de passe.
        throw unauthorized('Code de vérification requis', 'totp_required');
      }
      setSessionCookie(reply, result.token!);
      return { user: { id: result.user.id, email: result.user.email, locale: result.user.locale } };
    },
  );

  // ──────────────────────────── Second facteur ────────────────────────────
  const totpTags = ['authentification'];

  /**
   * Prépare un second facteur : un secret est engendré et rangé **désactivé**. Tant qu'un
   * code n'a pas été vérifié, la connexion reste inchangée — sans quoi une application mal
   * configurée enfermerait la personne dehors dès l'enregistrement du secret.
   */
  typed.post(
    '/api/auth/totp/setup',
    {
      onRequest: app.requireUser,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: totpTags, summary: 'Préparer le second facteur' },
    },
    async (request) => {
      const user = request.currentUser!;
      const secret = nouveauSecret();

      await withoutFarmScope(async (db) => {
        const existant = await db.totpSettings.findUnique({ where: { userId: user.id } });
        if (existant?.enabled) throw conflict('Le second facteur est déjà actif');
        await db.totpSettings.upsert({
          where: { userId: user.id },
          // Prisma type ses colonnes `Bytes` en `Uint8Array` : un `Buffer` en est un,
          // mais TypeScript distingue les deux sur le type de tampon sous-jacent.
          create: { userId: user.id, secret: new Uint8Array(secret), enabled: false },
          update: { secret: new Uint8Array(secret), enabled: false, lastUsedAt: null },
        });
      });

      // Le secret est rendu une seule fois, à l'écran qui l'enregistre : ni journalisé, ni
      // relisible ensuite.
      return { uri: uriOtpauth(secret, user.email), secret: versBase32(secret) };
    },
  );

  /** Vérifie un premier code, active le second facteur et remet les codes de secours. */
  typed.post(
    '/api/auth/totp/enable',
    {
      onRequest: app.requireUser,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: totpTags,
        summary: 'Activer le second facteur',
        body: z.object({ code: z.string().min(6).max(10) }),
      },
    },
    async (request) => {
      const user = request.currentUser!;

      return withoutFarmScope(async (db) => {
        const reglages = await db.totpSettings.findUnique({ where: { userId: user.id } });
        if (!reglages?.secret) throw badRequest('Aucun second facteur préparé');
        if (reglages.enabled) throw conflict('Le second facteur est déjà actif');

        const pas = verifierCode(Buffer.from(reglages.secret), request.body.code);
        if (pas === null) throw badRequest('Code incorrect');

        const codes = nouveauxCodesSecours();
        await db.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
        await db.totpRecoveryCode.createMany({
          data: await Promise.all(
            codes.map(async (code) => ({
              userId: user.id,
              hashedCode: new Uint8Array(
                Buffer.from(await hashPassword(normaliserCodeSecours(code))),
              ),
            })),
          ),
        });
        await db.totpSettings.update({
          where: { userId: user.id },
          data: { enabled: true, lastUsedAt: new Date(pas * 30 * 1000) },
        });

        // Les codes de secours ne sont montrés qu'ici : ils sont hachés en base, et
        // personne — support compris — ne pourra les relire.
        return { enabled: true, recoveryCodes: codes };
      });
    },
  );

  /**
   * Désactive le second facteur. Le mot de passe est redemandé : une session ouverte sur un
   * poste laissé sans surveillance ne doit pas suffire à retirer la protection.
   */
  typed.post(
    '/api/auth/totp/disable',
    {
      onRequest: app.requireUser,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: totpTags,
        summary: 'Désactiver le second facteur',
        body: z.object({ password: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const user = request.currentUser!;

      await withoutFarmScope(async (db) => {
        const compte = await db.user.findUniqueOrThrow({ where: { id: user.id } });
        if (!(await verifyPassword(compte.hashedPassword, request.body.password))) {
          throw unauthorized('Mot de passe incorrect');
        }
        await db.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
        await db.totpSettings.deleteMany({ where: { userId: user.id } });
      });

      return reply.status(204).send();
    },
  );

  /** État du second facteur, pour l'écran de réglages. */
  typed.get(
    '/api/auth/totp',
    { onRequest: app.requireUser, schema: { tags: totpTags, summary: 'État du second facteur' } },
    async (request) => {
      const user = request.currentUser!;
      return withoutFarmScope(async (db) => {
        const reglages = await db.totpSettings.findUnique({ where: { userId: user.id } });
        const restants = await db.totpRecoveryCode.count({ where: { userId: user.id } });
        return { enabled: reglages?.enabled ?? false, recoveryCodesLeft: restants };
      });
    },
  );

  typed.post(
    '/api/auth/logout',
    { schema: { tags, summary: 'Fermer la session' } },
    async (request, reply) => {
      const raw = request.cookies[SESSION_COOKIE];
      const unsigned = raw ? request.unsignCookie(raw) : null;
      if (unsigned?.valid && unsigned.value) {
        await withoutFarmScope((db) => deleteSession(db, unsigned.value!));
      }
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.status(204).send();
    },
  );

  typed.get(
    '/api/auth/me',
    {
      onRequest: app.requireUser,
      schema: { tags, summary: 'Compte courant et fermes accessibles' },
    },
    async (request) => {
      const user = request.currentUser!;
      const memberships = await withoutFarmScope((db) =>
        db.farmMembership.findMany({
          where: { userId: user.id },
          include: { farm: { select: { id: true, name: true, slug: true, countryCode: true } } },
          orderBy: { farmId: 'asc' },
        }),
      );
      return {
        user: {
          id: user.id,
          email: user.email,
          locale: user.locale,
          confirmedAt: user.confirmedAt,
        },
        farms: memberships.map((membership) => ({ ...membership.farm, role: membership.role })),
      };
    },
  );

  typed.patch(
    '/api/auth/me',
    {
      onRequest: app.requireUser,
      schema: {
        tags,
        summary: 'Modifier son compte',
        body: z.object({
          locale: z.enum(['fr', 'en']).optional(),
          currentPassword: z.string().optional(),
          newPassword: password.optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = request.currentUser!;
      const { locale, currentPassword, newPassword } = request.body;
      return withoutFarmScope(async (db) => {
        const data: { locale?: string; hashedPassword?: string } = {};
        if (locale) data.locale = locale;
        if (newPassword) {
          const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
          if (!currentPassword || !(await verifyPassword(record.hashedPassword, currentPassword))) {
            throw unauthorized('Mot de passe actuel incorrect');
          }
          data.hashedPassword = await hashPassword(newPassword);
          // Changer de mot de passe ferme toutes les sessions ouvertes, y compris celle-ci :
          // on en rouvre aussitôt une pour ne pas éjecter la personne qui vient de la changer.
          await db.userToken.deleteMany({ where: { userId: user.id, context: 'session' } });
          const updated = await db.user.update({ where: { id: user.id }, data });
          setSessionCookie(reply, await createSession(db, user.id));
          return { id: updated.id, email: updated.email, locale: updated.locale };
        }
        const updated = await db.user.update({ where: { id: user.id }, data });
        return { id: updated.id, email: updated.email, locale: updated.locale };
      });
    },
  );

  // ─────────────────── Confirmation d'adresse ───────────────────

  typed.post(
    '/api/auth/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Confirmer une adresse depuis le lien reçu',
        body: z.object({ token: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const consumed = await withoutFarmScope((db) =>
        consumeUserToken(db, request.body.token, CONFIRM_CONTEXT, TOKEN_HOURS),
      );
      if (!consumed) throw badRequest('Ce lien de confirmation est invalide ou périmé');
      await withoutFarmScope((db) =>
        db.user.update({ where: { id: consumed.userId }, data: { confirmedAt: new Date() } }),
      );
      return reply.status(204).send();
    },
  );

  typed.post(
    '/api/auth/confirm/resend',
    {
      onRequest: app.requireUser,
      config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
      schema: { tags, summary: 'Renvoyer le courriel de confirmation' },
    },
    async (request, reply) => {
      const user = request.currentUser!;
      // Une adresse déjà confirmée ne redemande pas de lien ; la réponse reste la même,
      // pour que l'interface n'ait pas à traiter deux cas.
      if (!user.confirmedAt) await envoyerConfirmation(user);
      return reply.status(204).send();
    },
  );

  // ─────────────────── Mot de passe oublié ───────────────────

  typed.post(
    '/api/auth/password-reset',
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags,
        summary: 'Demander un lien de réinitialisation',
        body: z.object({ email }),
      },
    },
    async (request, reply) => {
      const address = request.body.email;
      const user = await withoutFarmScope((db) =>
        db.user.findUnique({ where: { email: address } }),
      );
      if (user) {
        const token = await withoutFarmScope(async (db) => {
          // Une nouvelle demande annule la précédente : un seul lien vivant à la fois.
          await forgetUserTokens(db, user.id, RESET_CONTEXT);
          return createUserToken(db, user.id, RESET_CONTEXT, user.email);
        });
        await app.mailer.send(
          passwordResetMail({
            to: user.email,
            locale: user.locale,
            url: lien('/mot-de-passe', token),
            validityHours: TOKEN_HOURS,
          }),
        );
      }
      // Toujours 204, compte ou pas : la réponse ne doit pas dire qui est inscrit.
      return reply.status(204).send();
    },
  );

  typed.post(
    '/api/auth/password-reset/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Choisir un nouveau mot de passe depuis le lien reçu',
        body: z.object({ token: z.string().min(1), password }),
      },
    },
    async (request, reply) => {
      const { token, password: secret } = request.body;
      const result = await withoutFarmScope(async (db) => {
        const consumed = await consumeUserToken(db, token, RESET_CONTEXT, TOKEN_HOURS);
        if (!consumed) return null;
        await db.user.update({
          where: { id: consumed.userId },
          data: { hashedPassword: await hashPassword(secret) },
        });
        // Qui reprend la main sur un compte doit déloger celui qui l'occupait : toutes
        // les sessions tombent, y compris celles ouvertes ailleurs.
        await forgetUserTokens(db, consumed.userId, SESSION_CONTEXT);
        return consumed;
      });
      if (!result) throw badRequest('Ce lien de réinitialisation est invalide ou périmé');
      return reply.status(204).send();
    },
  );
}
