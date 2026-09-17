// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (fonction d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Export complet des données d'une ferme (§3.6 du brief) : une archive ZIP contenant un
// CSV par table, les photos, et une notice qui donne les unités de stockage.
//
// Brinjel obtient le même résultat par `COPY schema.table TO STDOUT`, parce qu'il isole
// chaque ferme dans son propre schéma PostgreSQL. Sillon partage les tables et sépare
// par `farm_id` : un `COPY` brut exporterait donc **toutes** les fermes. Chaque table est
// ici lue par Prisma avec sa clause de filtrage explicite — et la RLS, quand elle couvre
// la table, forme une seconde barrière.

import { Prisma } from '@prisma/client';
import { toIsoDate } from '@sillon/core';
import type { Tx } from './db.js';

/** Colonnes d'un modèle, dans l'ordre du schéma : les relations n'en font pas partie. */
function scalarFields(model: string): string[] {
  const found = Prisma.dmmf.datamodel.models.find((entry) => entry.name === model);
  if (!found) throw new Error(`Modèle Prisma inconnu : ${model}`);
  return found.fields
    .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
    .map((field) => field.name);
}

/** Colonnes `@db.Date` : à écrire en date seule, sans heure ni fuseau. */
function dateOnlyFields(model: string): Set<string> {
  const found = Prisma.dmmf.datamodel.models.find((entry) => entry.name === model);
  return new Set(
    (found?.fields ?? [])
      .filter((field) => Array.isArray(field.nativeType) && field.nativeType[0] === 'Date')
      .map((field) => field.name),
  );
}

export interface ExportTable {
  /** Nom du fichier dans l'archive, sans extension : celui de la table SQL. */
  file: string;
  /** Modèle Prisma dont les colonnes décrivent l'en-tête. */
  model: string;
  /** Colonnes ajoutées après celles du modèle (jointures lisibles). */
  extraColumns?: string[];
  rows: (db: Tx, farmId: number) => Promise<Record<string, unknown>[]>;
}

/**
 * Les tables de l'export, dans l'ordre où on les lit.
 *
 * Chaque entrée porte **son propre filtrage** : les tables de liaison n'ont pas de
 * `farm_id`, donc pas de politique RLS non plus — leur cloisonnement tient entièrement
 * à la clause écrite ici. C'est ce que vérifie l'essai « aucune donnée d'une autre ferme ».
 */
export const EXPORT_TABLES: ExportTable[] = [
  {
    file: 'fermes',
    model: 'Farm',
    rows: (db, farmId) => db.farm.findMany({ where: { id: farmId } }),
  },
  {
    file: 'membres',
    model: 'FarmMembership',
    // La table ne porte qu'un `userId` : sans l'adresse, la liste d'équipe exportée ne
    // désignerait personne. Le compte n'a pas d'autre champ d'identité (`User.profile`
    // est un JSON libre, hors de l'export).
    extraColumns: ['userEmail'],
    rows: async (db, farmId) => {
      const rows = await db.farmMembership.findMany({
        where: { farmId },
        include: { user: { select: { email: true } } },
      });
      return rows.map(({ user, ...row }) => ({ ...row, userEmail: user.email }));
    },
  },
  {
    file: 'invitations',
    model: 'Invitation',
    rows: (db, farmId) => db.invitation.findMany({ where: { farmId } }),
  },
  {
    file: 'reglages_planches',
    model: 'BedSettings',
    rows: (db, farmId) => db.bedSettings.findMany({ where: { farmId } }),
  },
  {
    file: 'familles',
    model: 'Family',
    rows: (db, farmId) => db.family.findMany({ where: { farmId } }),
  },
  {
    file: 'especes',
    model: 'Crop',
    rows: (db, farmId) => db.crop.findMany({ where: { farmId } }),
  },
  {
    file: 'varietes',
    model: 'Variety',
    rows: (db, farmId) => db.variety.findMany({ where: { farmId } }),
  },
  {
    file: 'fournisseurs',
    model: 'Provider',
    rows: (db, farmId) => db.provider.findMany({ where: { farmId } }),
  },
  {
    file: 'unites',
    model: 'Unit',
    rows: (db, farmId) => db.unit.findMany({ where: { farmId } }),
  },
  {
    file: 'contenants',
    model: 'Container',
    rows: (db, farmId) => db.container.findMany({ where: { farmId } }),
  },
  {
    file: 'etiquettes',
    model: 'Tag',
    rows: (db, farmId) => db.tag.findMany({ where: { farmId } }),
  },
  {
    file: 'series',
    model: 'Planting',
    rows: (db, farmId) => db.planting.findMany({ where: { farmId } }),
  },
  {
    file: 'series_dates',
    model: 'PlantingDate',
    rows: (db, farmId) => db.plantingDate.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'series_durees',
    model: 'PlantingDuration',
    rows: (db, farmId) => db.plantingDuration.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'periodes_recolte',
    model: 'HarvestPeriod',
    rows: (db, farmId) => db.harvestPeriod.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'series_etiquettes',
    model: 'PlantingTag',
    rows: (db, farmId) => db.plantingTag.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'planches',
    model: 'Location',
    rows: (db, farmId) => db.location.findMany({ where: { farmId } }),
  },
  {
    file: 'placements',
    model: 'LocationAssignment',
    rows: (db, farmId) => db.locationAssignment.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'types_de_taches',
    model: 'TaskType',
    rows: (db, farmId) => db.taskType.findMany({ where: { farmId } }),
  },
  {
    file: 'methodes_de_taches',
    model: 'TaskMethod',
    rows: (db, farmId) => db.taskMethod.findMany({ where: { farmId } }),
  },
  {
    file: 'outils',
    model: 'TaskImplement',
    rows: (db, farmId) => db.taskImplement.findMany({ where: { farmId } }),
  },
  {
    file: 'taches',
    model: 'Task',
    rows: (db, farmId) => db.task.findMany({ where: { farmId } }),
  },
  {
    file: 'taches_series',
    model: 'PlantingTask',
    rows: (db, farmId) => db.plantingTask.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'taches_planches',
    model: 'LocationTask',
    rows: (db, farmId) => db.locationTask.findMany({ where: { location: { farmId } } }),
  },
  {
    file: 'itineraires_techniques',
    model: 'TaskTemplate',
    rows: (db, farmId) => db.taskTemplate.findMany({ where: { farmId } }),
  },
  {
    file: 'itineraires_taches',
    model: 'TemplateTask',
    rows: (db, farmId) => db.templateTask.findMany({ where: { template: { farmId } } }),
  },
  {
    file: 'itineraires_liens',
    model: 'TemplateTaskLink',
    rows: (db, farmId) =>
      db.templateTaskLink.findMany({ where: { templateTask: { template: { farmId } } } }),
  },
  {
    file: 'recoltes',
    model: 'Harvest',
    rows: (db, farmId) => db.harvest.findMany({ where: { farmId } }),
  },
  {
    file: 'notes',
    model: 'Note',
    rows: (db, farmId) => db.note.findMany({ where: { farmId } }),
  },
  {
    file: 'notes_series',
    model: 'PlantingNote',
    rows: (db, farmId) => db.plantingNote.findMany({ where: { planting: { farmId } } }),
  },
  {
    file: 'notes_planches',
    model: 'LocationNote',
    rows: (db, farmId) => db.locationNote.findMany({ where: { location: { farmId } } }),
  },
  {
    file: 'photos',
    model: 'Photo',
    rows: (db, farmId) => db.photo.findMany({ where: { farmId } }),
  },
  {
    file: 'notes_photos',
    model: 'NotePhoto',
    rows: (db, farmId) => db.notePhoto.findMany({ where: { note: { farmId } } }),
  },
];

/**
 * Modèles délibérément absents de l'archive, avec la raison. L'essai de couverture s'y
 * réfère : ajouter un modèle rattaché à une ferme sans l'exporter **ni** l'inscrire ici
 * fait échouer la chaîne de vérification, pour qu'une table ne se perde pas en silence.
 */
export const EXPORT_EXCLUSIONS: Record<string, string> = {
  // Données du prestataire de paiement, que la ferme n'a pas saisies et qui ne servent à
  // aucun autre outil. L'archive se transmet (au conseiller, au repreneur) : l'identifiant
  // client chez le prestataire n'a pas à voyager avec le plan de culture.
  Subscription: 'abonnement — identifiants du prestataire de paiement',
  BillingDetails: 'facturation — identifiants du prestataire de paiement',
  // Relation pédagogique entre deux fermes : elle appartient autant au centre de formation
  // qu'à la ferme, et l'exporter d'un seul côté livrerait les identifiants de l'autre.
  TrainingCenter: 'centre de formation — donnée partagée avec une autre ferme',
  StudentFarm: 'ferme apprenante — donnée partagée avec une autre ferme',
};

/** Convertit une valeur Prisma en cellule CSV. */
function cell(value: unknown, dateOnly: boolean): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dateOnly ? toIsoDate(value) : value.toISOString();
  if (typeof value === 'boolean') return value ? 'vrai' : 'faux';
  return String(value);
}

function escape(text: string, delimiter: string): string {
  return /["\n\r]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Sérialise une table. L'en-tête vient du schéma, pas des lignes : une table vide garde
 * donc ses colonnes, ce qui dit au lecteur que la table existe et qu'elle est vide.
 */
export function tableToCsv(
  table: ExportTable,
  rows: Record<string, unknown>[],
  delimiter = ';',
): string {
  const columns = [...scalarFields(table.model), ...(table.extraColumns ?? [])];
  const dates = dateOnlyFields(table.model);
  const lines = [columns.map((column) => escape(column, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => escape(cell(row[column], dates.has(column)), delimiter))
        .join(delimiter),
    );
  }
  // BOM : sans lui, Excel ouvre les accents en mojibake.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * Notice jointe à l'archive. Sans elle, les entiers sont indéchiffrables : une longueur
 * de planche vaut 30000 et non 30, un rendement 4500 et non 4,5.
 */
export function readme(farmName: string, generatedAt: Date, tables: string[]): string {
  return [
    `Export des données de la ferme « ${farmName} »`,
    `Généré le ${generatedAt.toISOString()} par Sillon.`,
    '',
    'FORMAT',
    '  Un fichier CSV par table, encodé en UTF-8 (avec BOM), séparateur « ; »,',
    '  fins de ligne CRLF. Les dates sont en ISO 8601 (AAAA-MM-JJ), les horodatages',
    '  en UTC. Les booléens valent « vrai » ou « faux ».',
    '',
    'UNITÉS DE STOCKAGE',
    '  Toutes les mesures sont des entiers, aux unités héritées de Brinjel :',
    '    - longueurs de planche ............ millimètres      (30000 = 30 m)',
    '    - espacements .................... dixièmes de mm    (500 = 5 cm)',
    '    - rendements, quantités récoltées . millièmes d’unité (4500 = 4,5 kg)',
    '    - densité de semences ............ graines par kilogramme',
    '    - montants ....................... centimes          (250 = 2,50 €)',
    '    - durées de culture .............. jours',
    '    - temps de travail ............... secondes          (5400 = 1 h 30)',
    '',
    'PHOTOS',
    '  Les images sont dans le dossier « photos/ », nommées d’après la colonne « id »',
    '  du fichier photos.csv. Une image manquante au stockage est signalée ici même.',
    '',
    'TABLES',
    ...tables.map((name) => `  - ${name}.csv`),
    '',
    'LICENCE',
    '  Ces données vous appartiennent. Sillon est un logiciel libre sous AGPL-3.0-or-later,',
    '  réécriture de Brinjel (© André Hoarau) — https://framagit.org/brinjel/brinjel',
    '',
  ].join('\n');
}

/** Nom de fichier proposé au navigateur ; sans caractère qui gênerait un système de fichiers. */
export function archiveName(farmName: string, generatedAt: Date): string {
  const slug =
    farmName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'ferme';
  const stamp = generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `sillon-${slug}-${stamp}.zip`;
}
