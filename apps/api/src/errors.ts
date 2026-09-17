// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { signaler } from './observability.js';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentification requise', code = 'unauthorized') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'Droits insuffisants') =>
  new HttpError(403, 'forbidden', message);
/**
 * La ferme est en lecture seule : essai fini, abonnement échu, ou suspension. Ce n'est pas
 * un manque de droits — c'est l'état de la ferme, pas celui de la personne — d'où un code
 * nommé que l'interface distingue d'un `forbidden` ordinaire.
 */
export const readOnly = (message: string, details?: unknown) =>
  new HttpError(403, 'farm_read_only', message, details);

export const notFound = (message = 'Ressource introuvable') =>
  new HttpError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'conflict', message, details);

export function registerErrorHandler(
  app: FastifyInstance,
  options: { serveWeb?: boolean } = {},
): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message, details: error.details });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(422).send({
        error: 'validation_failed',
        message: 'Requête invalide',
        details: error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        })),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 : violation d'unicité (par exemple deux espèces du même nom dans une ferme).
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: 'conflict',
          message: 'Cette valeur existe déjà',
          details: error.meta?.target,
        });
      }
      // P2003 : clé étrangère ; P2025 : enregistrement absent.
      if (error.code === 'P2003') {
        return reply
          .status(409)
          .send({ error: 'conflict', message: 'Référence liée invalide ou encore utilisée' });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'not_found', message: 'Ressource introuvable' });
      }
    }

    // Erreurs levées par Fastify lui-même (charge trop lourde, limite de débit…).
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        error: fastifyError.code ?? 'error',
        message: fastifyError.message ?? 'Requête refusée',
      });
    }

    // Seul ce point remonte à la supervision : tout ce qui précède est une réponse prévue
    // — droits insuffisants, validation, conflit — et n'a rien d'un incident. Y envoyer les
    // 4xx noierait les vraies pannes sous le bruit des requêtes mal formées.
    request.log.error({ err: error }, 'erreur non gérée');
    signaler(error);
    return reply.status(500).send({ error: 'internal_error', message: 'Erreur interne' });
  });

  app.setNotFoundHandler((request, reply) => {
    // Quand l'API sert aussi l'interface (déploiement en un seul service), une URL inconnue
    // qui n'est pas une route d'API est une route du navigateur : c'est `index.html` qu'il
    // faut rendre, à charge pour le routeur côté client de s'y retrouver. Sans cela, un
    // rechargement sur `/plan/12` renverrait un 404 JSON.
    const versApi = request.url.startsWith('/api') || request.url.startsWith('/docs');
    if (options.serveWeb && !versApi && request.method === 'GET') {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.status(404).send({ error: 'not_found', message: 'Route inconnue' });
  });
}
