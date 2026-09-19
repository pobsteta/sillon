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
  SUGGESTED_PROVIDERS,
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
  // Le fournisseur par défaut reste le générique : c'est lui qui accueille les variétés
  // dont on ne sait pas encore d'où elles viennent.
  await db.farm.update({ where: { id: farmId }, data: { defaultProviderId: provider.id } });

  await ajouterSemenciersProposes(db, farmId, locale);

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
 * Ajoute les semenciers proposés qui manquent, et renvoie ceux qui ont été créés.
 *
 * Idempotent par construction : `@@unique([farmId, name, type])` interdit le doublon, et on
 * ne recrée pas ce qui existe. C'est ce qui permet d'offrir le même geste à une ferme
 * ancienne sans risquer d'abîmer un référentiel déjà rangé — et une maison que la ferme a
 * renommée n'est pas rétablie sous son ancien nom, ce qui reviendrait à défaire son choix.
 */
export async function ajouterSemenciersProposes(
  db: Tx,
  farmId: number,
  locale = 'fr',
): Promise<{ id: number; name: string }[]> {
  const english = locale.startsWith('en');
  const crees: { id: number; name: string }[] = [];

  for (const semencier of SUGGESTED_PROVIDERS) {
    // Reconnue au nom **ou à l'adresse**. C'est l'adresse qui identifie la maison ; le nom
    // n'est que l'étiquette que la ferme lui donne, et elle a le droit de la changer —
    // « Kokopelli (commande groupée) » reste Kokopelli. Sans cette seconde clause, le
    // geste ferait réapparaître l'ancien nom à côté du sien, c'est-à-dire défairait son
    // choix en croyant l'aider.
    // `{ url: undefined }` n'est pas « adresse inconnue » pour Prisma : c'est une clause
    // **vide**, qui accepte n'importe quelle ligne. Glissée dans un `OR`, elle ferait
    // considérer comme déjà présente la première maison venue — et une maison sans site ne
    // serait jamais ajoutée, sans erreur ni message. D'où la clause construite à la main.
    const reconnaissance: { name?: string; url?: string }[] = [{ name: semencier.name }];
    if (semencier.url) reconnaissance.push({ url: semencier.url });

    const existe = await db.provider.findFirst({
      where: { farmId, type: semencier.type, OR: reconnaissance },
    });
    if (existe) continue;
    const cree = await db.provider.create({
      data: {
        farmId,
        name: semencier.name,
        type: semencier.type,
        url: semencier.url,
        notes: english ? semencier.notesEn : semencier.notes,
      },
      select: { id: true, name: true },
    });
    crees.push(cree);
  }
  return crees;
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
