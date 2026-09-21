// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Charge les valeurs de référence dans la base (lot A de
// `specs/brief-sillon-references-microfermes.md`). `npm run db:seed:references -w @sillon/api`.
//
// **Idempotent par remplacement, source par source.** Chaque source est vidée puis
// réécrite en une transaction. C'est plus brutal qu'un `upsert` ligne à ligne, et c'est
// voulu : une entrée retirée d'un jeu doit disparaître de la base. Un `upsert` la
// laisserait en place indéfiniment, et personne ne saurait d'où elle vient — le contraire
// de ce que ce module promet.
//
// **Ce seed est le seul écrivain de ces tables.** Aucune route de Sillon n'y touche : les
// références sont des faits publiés, pas des données de ferme. `references.test.ts` le
// vérifie côté API.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { farmToStorage, toStorage } from '@sillon/core';
import { parseReferenceFile } from '@sillon/core/references-schema';

const prisma = new PrismaClient();

/**
 * Les jeux livrés vivent dans `@sillon/core`, à côté du schéma qui les valide.
 *
 * Le noyau ne lit pas de fichiers — il doit rester utilisable dans un navigateur — donc
 * c'est ici qu'on ouvre le dossier, et là-bas qu'on valide son contenu.
 */
const DOSSIER = new URL('../../../packages/core/data/references/', import.meta.url).pathname;

async function main(): Promise<void> {
  const fichiers = readdirSync(DOSSIER).filter((nom) => nom.endsWith('.json'));
  if (fichiers.length === 0) throw new Error(`Aucun jeu de références dans ${DOSSIER}`);

  let total = 0;
  for (const nom of fichiers) {
    const jeu = parseReferenceFile(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8')), nom);
    const { source, values, farm_values: reperes } = jeu;

    await prisma.$transaction(async (tx) => {
      await tx.referenceSource.upsert({
        where: { id: source.id },
        create: {
          id: source.id,
          titre: source.titre,
          auteurs: source.auteurs,
          annee: source.annee,
          url: source.url,
          licence: source.licence,
          notes: source.notes,
        },
        update: {
          titre: source.titre,
          auteurs: source.auteurs,
          annee: source.annee,
          url: source.url,
          licence: source.licence,
          notes: source.notes,
        },
      });

      // Remplacement complet : voir l'en-tête. La cascade de la clé étrangère ne suffit
      // pas, on ne veut pas effacer la source elle-même.
      await tx.referenceValue.deleteMany({ where: { sourceId: source.id } });
      await tx.referenceFarmValue.deleteMany({ where: { sourceId: source.id } });

      if (values.length > 0) {
        await tx.referenceValue.createMany({
          data: values.map((entree) => {
            const stockee = toStorage(entree);
            return {
              sourceId: source.id,
              cropKey: stockee.cropKey,
              context: stockee.context,
              yieldMilliKgM2: stockee.yield ?? undefined,
              laborSeconds100m2: stockee.labor ?? undefined,
              priceCentsKg: stockee.price ?? undefined,
              n: stockee.n,
              pageRef: stockee.pageRef,
              notes: stockee.notes,
            };
          }),
        });
      }

      if (reperes.length > 0) {
        await tx.referenceFarmValue.createMany({
          data: reperes.map((entree) => {
            const stockee = farmToStorage(entree);
            return {
              sourceId: source.id,
              metric: stockee.metric,
              context: stockee.context,
              range: stockee.range,
              n: stockee.n,
              pageRef: stockee.pageRef,
              notes: stockee.notes,
            };
          }),
        });
      }
    });

    total += values.length + reperes.length;
    const licence = source.licence === 'a-verifier' ? ' — LICENCE À VÉRIFIER' : '';
    const detail = reperes.length > 0 ? ` + ${reperes.length} repères de ferme` : '';
    console.log(
      `${source.id.padEnd(20)} ${String(values.length).padStart(4)} entrées${detail}${licence}`,
    );
  }

  console.log(`\n${total} valeurs de référence chargées depuis ${fichiers.length} sources.`);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
