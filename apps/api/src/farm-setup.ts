// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Création d'une ferme : la ligne `farms`, le propriétaire, les réglages de planches
// et le référentiel de départ. Tout se fait hors isolation RLS (la ferme n'existe pas
// encore quand la transaction commence).

import type { Tx } from './db.js';
import {
  DEFAULT_CONTAINERS,
  DEFAULT_FAMILIES,
  DEFAULT_PROVIDER,
  DEFAULT_TASK_TYPES,
  DEFAULT_UNITS,
} from './reference-data.js';

/** Identifiant d'URL lisible, unique par ferme. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ferme'
  );
}

async function uniqueSlug(db: Tx, base: string): Promise<string> {
  const slug = slugify(base);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const taken = await db.farm.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

export interface CreateFarmInput {
  name: string;
  ownerId: number;
  locale?: string;
  countryCode?: string;
  /** Période d'essai, en jours. */
  trialDays?: number;
}

/**
 * Crée la ligne `farms` seule : ni référentiel, ni réglages de planches, et un propriétaire
 * facultatif. C'est ce dont a besoin une ferme qui va **recevoir une copie**
 * (`farm-copy.ts`), où tout vient du modèle — y compris les réglages de planches, qu'une
 * amorce ici ferait entrer en collision.
 *
 * Un `ownerId` nul est un cas réel et non une négligence : une ferme d'apprenant existe
 * avant que l'apprenant n'ait accepté son invitation.
 */
export async function createEmptyFarm(
  db: Tx,
  input: Omit<CreateFarmInput, 'ownerId' | 'locale'> & { ownerId?: number | null },
) {
  const trialDays = input.trialDays ?? 90;
  return db.farm.create({
    data: {
      name: input.name.trim(),
      slug: await uniqueSlug(db, input.name),
      ownerId: input.ownerId ?? null,
      countryCode: input.countryCode ?? 'FR',
      trialExpiryDate: new Date(Date.now() + trialDays * 86_400_000),
      ...(input.ownerId
        ? { memberships: { create: { userId: input.ownerId, role: 'owner' } } }
        : {}),
    },
  });
}

/** Crée la ferme, son propriétaire et son référentiel. Renvoie la ferme créée. */
export async function createFarm(db: Tx, input: CreateFarmInput) {
  const locale = input.locale ?? 'fr';
  const farm = await createEmptyFarm(db, input);
  // Planches de 30 m sur 80 cm, passe-pied de 40 cm — en millimètres, comme Brinjel.
  await db.bedSettings.create({
    data: { farmId: farm.id, bedLength: 30_000, bedWidth: 800, pathWidth: 400 },
  });

  await seedFarmReference(db, farm.id, locale);
  return farm;
}

/** Amorce le référentiel d'une ferme (familles, espèces, fournisseur, unités, plaques, tâches). */
export async function seedFarmReference(db: Tx, farmId: number, locale = 'fr'): Promise<void> {
  const english = locale.startsWith('en');
  const label = (fr: string, en: string) => (english ? en : fr);

  const provider = await db.provider.create({
    data: { farmId, name: label(DEFAULT_PROVIDER.name, DEFAULT_PROVIDER.nameEn), type: 'seed' },
  });
  await db.farm.update({ where: { id: farmId }, data: { defaultProviderId: provider.id } });

  for (const family of DEFAULT_FAMILIES) {
    await db.family.create({
      data: {
        farmId,
        name: label(family.name, family.nameEn),
        color: family.color,
        interval: family.interval,
        crops: {
          create: family.crops.map((crop) => ({
            farmId,
            name: label(crop.name, crop.nameEn),
            color: family.color,
            harvestedPart: crop.harvestedPart ?? null,
          })),
        },
      },
    });
  }

  for (const unit of DEFAULT_UNITS) {
    await db.unit.create({ data: { farmId, name: label(unit.name, unit.nameEn) } });
  }

  for (const container of DEFAULT_CONTAINERS) {
    await db.container.create({ data: { farmId, name: container.name, size: container.size } });
  }

  for (const type of DEFAULT_TASK_TYPES) {
    const createdType = await db.taskType.create({
      data: { farmId, name: label(type.name, type.nameEn), color: type.color },
    });
    for (const method of type.methods) {
      const createdMethod = await db.taskMethod.create({
        data: { farmId, typeId: createdType.id, name: label(method.name, method.nameEn) },
      });
      for (const implement of method.implements ?? []) {
        await db.taskImplement.create({
          data: {
            farmId,
            methodId: createdMethod.id,
            name: label(implement.name, implement.nameEn),
          },
        });
      }
    }
  }
}

/**
 * Types de tâches employés par la génération depuis le plan de culture. Brinjel
 * distingue le semis en pépinière du semis direct ; le référentiel de départ n'a qu'un
 * type « Semis », qui sert aux deux, et un type « Plantation » pour le repiquage.
 */
export async function defaultTaskTypeIds(
  db: Tx,
  farmId: number,
): Promise<{ greenhouseSow: number | null; directSow: number | null; transplant: number | null }> {
  const types = await db.taskType.findMany({ where: { farmId } });
  const find = (names: string[]) =>
    types.find((type) => names.some((n) => type.name.toLowerCase().normalize('NFD').startsWith(n)))
      ?.id ?? null;
  const sowing = find(['semis', 'sowing']);
  return { greenhouseSow: sowing, directSow: sowing, transplant: find(['plantation', 'planting']) };
}
