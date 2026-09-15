// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Types du domaine, indépendants de l'ORM : le noyau métier se teste sans base.
// Les noms et valeurs reprennent ceux du schéma Prisma (donc des migrations Brinjel).

/** Mode d'implantation d'une série. */
export const PlantingType = {
  /** Semis direct en place. */
  directSeed: 'direct_seed',
  /** Plant produit en pépinière puis repiqué. */
  transplantRaised: 'transplant_raised',
  /** Plant acheté puis repiqué. */
  transplantBought: 'transplant_bought',
} as const;
export type PlantingType = (typeof PlantingType)[keyof typeof PlantingType];

/** Types de dates portées par une série (prévu + réalisé pour chacune). */
export const PlantingDateType = {
  greenhouseSowing: 'greenhouse_sowing',
  sowingPlanting: 'sowing_planting',
  harvestBegin: 'harvest_begin',
  harvestEnd: 'harvest_end',
} as const;
export type PlantingDateType = (typeof PlantingDateType)[keyof typeof PlantingDateType];

/** Durées paramétrables d'une série, en jours. */
export const PlantingDurationType = {
  greenhouse: 'greenhouse',
  toHarvest: 'to_harvest',
  harvest: 'harvest',
} as const;
export type PlantingDurationType = (typeof PlantingDurationType)[keyof typeof PlantingDurationType];

/** Origine d'une tâche : générée par le plan de culture, ou libre. */
export const TaskDefaultType = {
  sowing: 'sowing',
  planting: 'planting',
  other: 'other',
} as const;
export type TaskDefaultType = (typeof TaskDefaultType)[keyof typeof TaskDefaultType];

/** Rôles sur une ferme, du plus au moins capable. */
export const FarmRole = {
  owner: 'owner',
  manager: 'manager',
  member: 'member',
} as const;
export type FarmRole = (typeof FarmRole)[keyof typeof FarmRole];

export const OverdueUnit = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
} as const;
export type OverdueUnit = (typeof OverdueUnit)[keyof typeof OverdueUnit];

/** Date civile sans heure, au format ISO `YYYY-MM-DD`. Évite tout décalage de fuseau. */
export type IsoDate = string;

/** Jeu de dates d'une série : prévu obligatoire, réalisé optionnel. */
export type PlannedDate = { planned: IsoDate; effective?: IsoDate | null };
export type PlantingDates = Partial<Record<PlantingDateType, PlannedDate>>;
export type PlantingDurations = Partial<Record<PlantingDurationType, number>>;

/**
 * Paramètres d'une série utiles aux calculs (sous-ensemble de la table `plantings`).
 * Toutes les mesures sont des entiers : longueurs en cm, prix en centimes.
 */
export interface PlantingSpec {
  plantingType: PlantingType;
  /** Longueur de planche occupée, en centimètres. */
  length: number;
  /** Nombre de rangs sur la planche. */
  rows: number;
  /** Espacement sur le rang, en centimètres. */
  spacingPlants: number;
  /** Rendement escompté par mètre de planche, dans l'unité de la série. */
  yieldPerBedMeter?: number | null;
  /** Prix de vente unitaire, en centimes. */
  pricePerUnit?: number | null;
  seedsPerGram?: number | null;
  seedsPerHoleSeedling?: number | null;
  seedsPerHoleDirect?: number | null;
  /** Marge de sécurité sur la quantité de semences, en pourcentage. */
  seedsExtraPercentage?: number | null;
  /** Perte estimée en pépinière, en pourcentage. */
  estimatedGreenhouseLoss?: number | null;
  /** Nombre d'alvéoles de la plaque de semis utilisée. */
  containerSize?: number | null;
}

/** Intervalle de dates inclusif. */
export interface DateRange {
  begin: IsoDate;
  end: IsoDate;
}
