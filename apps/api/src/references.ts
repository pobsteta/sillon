// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Contrôle des références croisées entre fermes.
//
// La Row-Level Security protège les LIGNES : elle vérifie le `farm_id` de la ligne insérée,
// pas celui des lignes citées. Les clés étrangères, elles, sont globales : rien n'empêche
// PostgreSQL d'accepter une espèce de la ferme A rattachée à une famille de la ferme B.
// Chaque identifiant reçu d'un client est donc relu ici, dans la transaction isolée : une
// ligne d'une autre ferme y est invisible, donc simplement « introuvable ».

import { badRequest } from './errors.js';
import type { Tx } from './db.js';

type Finder = (db: Tx, ids: number[]) => Promise<{ id: number }[]>;

const FINDERS = {
  family: (db, ids) => db.family.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  crop: (db, ids) => db.crop.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  variety: (db, ids) => db.variety.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  provider: (db, ids) => db.provider.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  unit: (db, ids) => db.unit.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  container: (db, ids) =>
    db.container.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  tag: (db, ids) => db.tag.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  location: (db, ids) => db.location.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  planting: (db, ids) => db.planting.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  photo: (db, ids) => db.photo.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  taskType: (db, ids) => db.taskType.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  taskMethod: (db, ids) =>
    db.taskMethod.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  taskImplement: (db, ids) =>
    db.taskImplement.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  taskTemplate: (db, ids) =>
    db.taskTemplate.findMany({ where: { id: { in: ids } }, select: { id: true } }),
} as const satisfies Record<string, Finder>;

export type ReferenceKind = keyof typeof FINDERS;

const LABELS: Record<ReferenceKind, string> = {
  family: 'Famille botanique',
  crop: 'Espèce',
  variety: 'Variété',
  provider: 'Fournisseur',
  unit: 'Unité',
  container: 'Plaque de semis',
  tag: 'Étiquette',
  location: 'Emplacement',
  planting: 'Série',
  photo: 'Photo',
  taskType: 'Type de tâche',
  taskMethod: 'Méthode',
  taskImplement: 'Outil',
  taskTemplate: 'Itinéraire technique',
};

type Referenced = readonly (number | null | undefined)[] | number | null | undefined;

/**
 * Vérifie que chaque identifiant cité existe dans la ferme courante.
 * À appeler dans une transaction ouverte par `withFarm` : c'est l'isolation PostgreSQL
 * qui fait le tri, la requête n'a pas besoin de filtrer elle-même sur `farm_id`.
 */
export async function assertReferences(
  db: Tx,
  references: Partial<Record<ReferenceKind, Referenced>>,
): Promise<void> {
  for (const [kind, value] of Object.entries(references) as [ReferenceKind, Referenced][]) {
    const candidates = Array.isArray(value) ? value : [value];
    const ids = [...new Set(candidates.filter((id): id is number => typeof id === 'number'))];
    if (ids.length === 0) continue;

    const found = await (FINDERS[kind] as Finder)(db, ids);
    if (found.length === ids.length) continue;

    const missing = ids.filter((id) => !found.some((row) => row.id === id));
    throw badRequest(`${LABELS[kind]} introuvable dans cette ferme : ${missing.join(', ')}`, {
      kind,
      missing,
    });
  }
}
