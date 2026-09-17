// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (fonction d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// « Export complet des données de la ferme (auto-service, à tout moment) » — §3.6.

import archiver from 'archiver';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inFarm } from '../scope.js';
import { notFound } from '../errors.js';
import { EXPORT_TABLES, archiveName, readme, tableToCsv } from '../export.js';

const FarmParams = z.object({ farmId: z.coerce.number().int().positive() });

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const storage = app.photos;

  typed.get(
    '/api/farms/:farmId/export.zip',
    {
      // Brinjel réserve l'export au propriétaire et au chef de culture
      // (`plug AuthorizeFarmAccess, [:owner, :manager]`). C'est l'un des rares endroits
      // où la hiérarchie dit juste ce qu'il faut, l'archive contenant toute la ferme —
      // y compris l'équipe et les invitations en cours.
      onRequest: app.requireFarm('manager'),
      schema: {
        tags: ['export'],
        summary: 'Archive ZIP de toutes les données de la ferme',
        params: FarmParams,
      },
    },
    async (request, reply) => {
      const generatedAt = new Date();

      // Tout est lu dans une seule transaction de ferme : l'archive est donc cohérente,
      // et non un assemblage de lectures prises à des instants différents.
      const { farm, tables, photos } = await inFarm(request, async (db, { farmId }) => {
        const found = await db.farm.findFirst({ where: { id: farmId } });
        if (!found) throw notFound('Ferme introuvable');

        const collected: { file: string; csv: string }[] = [];
        for (const table of EXPORT_TABLES) {
          collected.push({
            file: table.file,
            csv: tableToCsv(table, await table.rows(db, farmId)),
          });
        }
        const images = await db.photo.findMany({
          where: { farmId },
          select: { id: true, uuid: true, name: true },
        });
        return { farm: found, tables: collected, photos: images };
      });

      const archive = archiver('zip', { zlib: { level: 9 } });
      // Une erreur survenue après le premier octet ne peut plus changer le statut HTTP :
      // on détruit le flux, ce qui casse l'archive côté client plutôt que de lui livrer
      // un ZIP tronqué qu'il croirait complet.
      archive.on('error', (error: Error) => {
        request.log.error({ error }, 'échec de l’archive d’export');
        reply.raw.destroy(error);
      });

      reply.header('content-type', 'application/zip');
      reply.header(
        'content-disposition',
        `attachment; filename="${archiveName(farm.name, generatedAt)}"`,
      );
      // Rien ne doit rester dans un cache partagé : l'archive contient toute la ferme.
      reply.header('cache-control', 'private, no-store');

      const manquantes: string[] = [];
      for (const photo of photos) {
        try {
          const content = await storage.get(`${farm.id}/${photo.uuid}`);
          archive.append(content, { name: `photos/${photo.id}-${photo.name}` });
        } catch {
          // Un fichier absent du stockage ne doit pas priver la ferme du reste de son
          // export : on le note dans la notice et on continue.
          manquantes.push(`${photo.id}-${photo.name}`);
        }
      }

      for (const table of tables) archive.append(table.csv, { name: `${table.file}.csv` });

      const notice =
        readme(
          farm.name,
          generatedAt,
          tables.map((table) => table.file),
        ) +
        (manquantes.length === 0
          ? ''
          : `\nPHOTOS MANQUANTES AU STOCKAGE\n${manquantes.map((name) => `  - ${name}`).join('\n')}\n`);
      archive.append(notice, { name: 'LISEZMOI.txt' });

      void archive.finalize();
      return reply.send(archive);
    },
  );
}
