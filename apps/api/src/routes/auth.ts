// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Comptes : inscription (avec création de la première ferme), connexion, déconnexion.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  hashPassword,
  verifyPassword,
} from '../auth.js';
import { conflict, unauthorized } from '../errors.js';
import { withoutFarmScope } from '../tenant.js';
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

export async function authRoutes(app: FastifyInstance, options: { env: Env }): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['authentification'];

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
        body: z.object({ email, password: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const { email: address, password: secret } = request.body;
      const result = await withoutFarmScope(async (db) => {
        const user = await db.user.findUnique({ where: { email: address } });
        // Un mot de passe est vérifié même sans compte : le temps de réponse ne doit pas
        // révéler quelles adresses sont inscrites.
        const valid = await verifyPassword(user ? user.hashedPassword : await decoy(), secret);
        if (!user || !valid) return null;

        await db.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } });
        return { user, token: await createSession(db, user.id) };
      });

      if (!result) throw unauthorized('Adresse ou mot de passe incorrect');
      setSessionCookie(reply, result.token);
      return { user: { id: result.user.id, email: result.user.email, locale: result.user.locale } };
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
}
