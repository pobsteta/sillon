// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Duplication d'une ferme entière.
//
// C'est l'inverse de l'export (`export.ts`), à une différence près qui fait tout le
// travail : l'export **lit**, la duplication doit **réécrire les références**. Chaque ligne
// copiée reçoit un nouvel identifiant, et toutes celles qui la désignent doivent pointer
// vers le nouveau, jamais vers l'ancien — sans quoi la ferme copiée serait branchée sur les
// données de l'originale, ce qui est le pire résultat possible : silencieux et faux.
//
// Les colonnes sont lues dans le schéma plutôt qu'énumérées ici. Une colonne ajoutée au
// modèle est donc copiée d'office, là où une liste écrite à la main aurait été oubliée à la
// prochaine migration — c'est déjà arrivé deux fois cette semaine sur d'autres listes.
//
// L'ordre, en revanche, est écrit noir sur blanc. Il découle des clés étrangères, un ordre
// faux échoue bruyamment (violation de contrainte) plutôt que de corrompre, et le lire
// permet de vérifier qu'aucune table n'a été oubliée.
//
// Deux cycles empêchent un ordre purement linéaire, et sont traités à part :
//
//   * `Crop.defaultVarietyId` désigne une variété, dont la `cropId` désigne l'espèce. On
//     crée les espèces sans variété par défaut, puis les variétés, puis on referme ;
//   * `Location.parentId` désigne un autre emplacement. On copie l'arbre par niveaux, les
//     parents d'abord — le trigger `ltree` recalcule les chemins au passage.

import { Prisma } from '@prisma/client';
import type { Tx } from './db.js';

/** Colonnes à recopier : les scalaires du modèle, sans l'identifiant qui sera réattribué. */
function colonnes(model: string): string[] {
  const found = Prisma.dmmf.datamodel.models.find((entry) => entry.name === model);
  if (!found) throw new Error(`Modèle Prisma inconnu : ${model}`);
  return found.fields
    .filter((field) => (field.kind === 'scalar' || field.kind === 'enum') && field.name !== 'id')
    .map((field) => field.name);
}

/** Correspondance ancien identifiant → nouveau, par modèle. */
type Correspondances = Map<string, Map<number, number>>;

function nouveau(maps: Correspondances, model: string, ancien: number): number {
  const trouve = maps.get(model)?.get(ancien);
  if (trouve === undefined) {
    // Un identifiant introuvable signale un ordre de copie fautif : mieux vaut s'arrêter
    // que d'écrire une référence vers la ferme d'origine.
    throw new Error(`Duplication : ${model} #${ancien} n'a pas encore été copié`);
  }
  return trouve;
}

function remplacer(
  ligne: Record<string, unknown>,
  maps: Correspondances,
  liens: Record<string, string>,
): Record<string, unknown> {
  const sortie: Record<string, unknown> = { ...ligne };
  for (const [champ, model] of Object.entries(liens)) {
    const valeur = ligne[champ];
    sortie[champ] = typeof valeur === 'number' ? nouveau(maps, model, valeur) : null;
  }
  return sortie;
}

/** Ne garde que les colonnes du modèle, et y applique le remplacement des références. */
function preparer(
  model: string,
  ligne: Record<string, unknown>,
  farmId: number,
  maps: Correspondances,
  liens: Record<string, string>,
): Record<string, unknown> {
  const retenues = new Set(colonnes(model));
  const brut: Record<string, unknown> = {};
  for (const [clef, valeur] of Object.entries(ligne)) {
    if (retenues.has(clef)) brut[clef] = valeur;
  }
  if (retenues.has('farmId')) brut.farmId = farmId;
  return remplacer(brut, maps, liens);
}

export interface CopieResultat {
  farmId: number;
  /** Nombre de lignes copiées par table, pour le journal et les essais. */
  lignes: Record<string, number>;
}

/**
 * Copie toutes les données d'une ferme vers une autre, déjà créée et **vide**.
 *
 * Ce qui n'est **pas** copié, et pourquoi : l'équipe et les invitations (la ferme copiée a
 * ses propres membres), l'abonnement et la facturation (ils appartiennent à qui paie), et
 * le rattachement à un centre de formation (c'est l'appelant qui le pose).
 *
 * **À appeler dans `withoutFarmScope`**, et non dans une transaction ordinaire : la copie
 * lit une ferme et écrit dans une autre, ce qu'aucune portée de ferme ne permet. Sous la
 * RLS, une transaction posée sur la ferme source ne verrait tout simplement pas la cible —
 * et les écritures échoueraient sans rien dire d'utile.
 *
 * Cela tient aussi lieu de transaction : une ferme à moitié copiée serait pire qu'une ferme
 * non copiée, parce qu'elle aurait l'air utilisable.
 */
export async function copierFerme(
  db: Tx,
  sourceId: number,
  cibleId: number,
): Promise<CopieResultat> {
  const maps: Correspondances = new Map();
  const lignes: Record<string, number> = {};

  /** Copie un modèle à identifiant propre, en mémorisant la correspondance. */
  const copier = async (
    model: string,
    delegue: {
      findMany: (a: unknown) => Promise<unknown[]>;
      create: (a: unknown) => Promise<unknown>;
    },
    where: Record<string, unknown>,
    liens: Record<string, string> = {},
    orderBy: Record<string, unknown> = { id: 'asc' },
  ) => {
    const sources = (await delegue.findMany({ where, orderBy })) as Record<string, unknown>[];
    const map = new Map<number, number>();
    for (const source of sources) {
      const cree = (await delegue.create({
        data: preparer(model, source, cibleId, maps, liens),
      })) as { id: number };
      map.set(source.id as number, cree.id);
    }
    maps.set(model, map);
    lignes[model] = sources.length;
    return sources;
  };

  /** Copie un modèle sans identifiant propre : rien à mémoriser, tout à remapper. */
  const copierLiaison = async (
    model: string,
    delegue: {
      findMany: (a: unknown) => Promise<unknown[]>;
      createMany: (a: unknown) => Promise<unknown>;
    },
    where: Record<string, unknown>,
    liens: Record<string, string>,
  ) => {
    const sources = (await delegue.findMany({ where })) as Record<string, unknown>[];
    if (sources.length > 0) {
      await delegue.createMany({
        data: sources.map((source) => preparer(model, source, cibleId, maps, liens)),
      });
    }
    lignes[model] = sources.length;
  };

  const deLaFerme = { farmId: sourceId };

  // ── Référentiel : rien ne dépend d'autre chose que de la ferme ──
  await copier('Family', db.family as never, deLaFerme);
  await copier('Provider', db.provider as never, deLaFerme);
  await copier('Unit', db.unit as never, deLaFerme);
  await copier('Container', db.container as never, deLaFerme);
  await copier('Tag', db.tag as never, deLaFerme);
  await copier('TaskType', db.taskType as never, deLaFerme);
  await copier('TaskTemplate', db.taskTemplate as never, deLaFerme);
  await copier('Note', db.note as never, deLaFerme);
  await copier('Photo', db.photo as never, deLaFerme);

  // ── Espèces et variétés : le premier cycle ──
  // Les espèces d'abord, sans variété par défaut ; les variétés ensuite, qui les désignent ;
  // puis on referme la boucle.
  const especes = await copier(
    'Crop',
    db.crop as never,
    deLaFerme,
    { familyId: 'Family' },
    { id: 'asc' },
  );
  for (const espece of especes) {
    await db.crop.update({
      where: { id: nouveau(maps, 'Crop', espece.id as number) },
      data: { defaultVarietyId: null },
    });
  }
  await copier('Variety', db.variety as never, deLaFerme, {
    cropId: 'Crop',
    providerId: 'Provider',
  });
  for (const espece of especes) {
    if (espece.defaultVarietyId == null) continue;
    await db.crop.update({
      where: { id: nouveau(maps, 'Crop', espece.id as number) },
      data: { defaultVarietyId: nouveau(maps, 'Variety', espece.defaultVarietyId as number) },
    });
  }

  // ── Emplacements : le second cycle, un arbre ──
  // Par niveaux, les parents d'abord. Le chemin `ltree` est recalculé par le trigger, donc
  // il ne faut surtout pas le recopier tel quel : il désignerait l'arbre d'origine.
  await copierArbreEmplacements(db, sourceId, cibleId, maps, lignes);

  // ── Ce qui dépend du référentiel ──
  await copier('TaskMethod', db.taskMethod as never, deLaFerme, { typeId: 'TaskType' });
  await copier('TaskImplement', db.taskImplement as never, deLaFerme, { methodId: 'TaskMethod' });
  await copier(
    'TemplateTask',
    db.templateTask as never,
    // La relation s'appelle `template`, pas `taskTemplateId` : c'est le nom du champ de
    // relation qui filtre, pas celui de la clé étrangère.
    { template: { farmId: sourceId } },
    {
      taskTemplateId: 'TaskTemplate',
      typeId: 'TaskType',
      methodId: 'TaskMethod',
      implementId: 'TaskImplement',
    },
  );
  await copier('Planting', db.planting as never, deLaFerme, {
    cropId: 'Crop',
    varietyId: 'Variety',
    unitId: 'Unit',
    containerId: 'Container',
  });
  await copier('Task', db.task as never, deLaFerme, {
    typeId: 'TaskType',
    methodId: 'TaskMethod',
    implementId: 'TaskImplement',
  });
  await copier('HarvestPeriod', db.harvestPeriod as never, {
    planting: { farmId: sourceId },
  });
  await copier('Harvest', db.harvest as never, deLaFerme, { plantingId: 'Planting' });

  // ── Tables de liaison : aucune n'a de `farm_id`, leur cloisonnement tient à ces clauses ──
  const dUneSerie = { planting: { farmId: sourceId } };
  await copierLiaison('PlantingDate', db.plantingDate as never, dUneSerie, {
    plantingId: 'Planting',
  });
  await copierLiaison('PlantingDuration', db.plantingDuration as never, dUneSerie, {
    plantingId: 'Planting',
  });
  await copierLiaison('PlantingTag', db.plantingTag as never, dUneSerie, {
    plantingId: 'Planting',
    tagId: 'Tag',
  });
  await copierLiaison('LocationAssignment', db.locationAssignment as never, dUneSerie, {
    plantingId: 'Planting',
    locationId: 'Location',
  });
  await copierLiaison('PlantingTask', db.plantingTask as never, dUneSerie, {
    plantingId: 'Planting',
    taskId: 'Task',
  });
  await copierLiaison(
    'LocationTask',
    db.locationTask as never,
    { location: { farmId: sourceId } },
    { locationId: 'Location', taskId: 'Task' },
  );
  await copierLiaison('PlantingNote', db.plantingNote as never, dUneSerie, {
    plantingId: 'Planting',
    noteId: 'Note',
  });
  await copierLiaison(
    'LocationNote',
    db.locationNote as never,
    { location: { farmId: sourceId } },
    { locationId: 'Location', noteId: 'Note' },
  );
  await copierLiaison(
    'NotePhoto',
    db.notePhoto as never,
    { note: { farmId: sourceId } },
    { noteId: 'Note', photoId: 'Photo' },
  );
  await copierLiaison(
    'TemplateTaskLink',
    db.templateTaskLink as never,
    { task: { farmId: sourceId } },
    { taskId: 'Task', templateTaskId: 'TemplateTask', linkTaskId: 'Task' },
  );

  // ── Réglages et valeur par défaut différée ──
  const reglages = await db.bedSettings.findUnique({ where: { farmId: sourceId } });
  if (reglages) {
    await db.bedSettings.create({
      // Les données sont construites à partir du schéma, donc typées `Record` : Prisma
      // attend une forme nominale qu'on ne peut pas exprimer génériquement.
      data: preparer('BedSettings', reglages as never, cibleId, maps, {}) as never,
    });
    lignes.BedSettings = 1;
  }

  const source = await db.farm.findUniqueOrThrow({ where: { id: sourceId } });
  if (source.defaultProviderId != null) {
    await db.farm.update({
      where: { id: cibleId },
      data: { defaultProviderId: nouveau(maps, 'Provider', source.defaultProviderId) },
    });
  }

  return { farmId: cibleId, lignes };
}

/**
 * Copie l'arbre des emplacements par niveaux. Les racines d'abord, puis leurs enfants : un
 * enfant créé avant son parent violerait la clé étrangère, et le trigger `ltree`
 * recalculerait un chemin contre un arbre incomplet.
 */
async function copierArbreEmplacements(
  db: Tx,
  sourceId: number,
  cibleId: number,
  maps: Correspondances,
  lignes: Record<string, number>,
): Promise<void> {
  const tous = await db.location.findMany({
    where: { farmId: sourceId },
    orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
  });
  const map = new Map<number, number>();
  maps.set('Location', map);

  let restants = [...tous];
  while (restants.length > 0) {
    // Un niveau : tout ce dont le parent est déjà copié (ou qui n'en a pas).
    const prets = restants.filter((l) => l.parentId == null || map.has(l.parentId));
    if (prets.length === 0) {
      throw new Error('Duplication : cycle ou parent manquant dans l’arbre des emplacements');
    }
    for (const emplacement of prets) {
      const cree = await db.location.create({
        data: preparer('Location', emplacement as never, cibleId, maps, {
          ...(emplacement.parentId == null ? {} : { parentId: 'Location' }),
        }) as never,
      });
      map.set(emplacement.id, cree.id);
    }
    restants = restants.filter((l) => !map.has(l.id));
  }
  lignes.Location = tous.length;
}
