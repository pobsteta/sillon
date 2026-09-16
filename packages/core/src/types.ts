// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Types du domaine, indépendants de l'ORM : le noyau métier se teste sans base.
// Les noms et les valeurs reprennent ceux du code Brinjel (`lib/brinjel/`), vérifiés
// sur la source ; les entiers en commentaire sont ceux de la base d'origine, utiles
// pour un import.

/**
 * Mode d'implantation d'une série (`Planting.@planting_types`).
 * `seedling` désigne une série menée jusqu'au plant vendu ou repiqué ailleurs :
 * elle n'occupe pas de planche au champ.
 */
export const PlantingType = {
  /** 1 — semis direct en place. */
  directSeeded: 'direct_seeded',
  /** 2 — plant acheté puis repiqué. */
  transplantBought: 'transplant_bought',
  /** 3 — plant produit en pépinière puis repiqué. */
  transplantRaised: 'transplant_raised',
  /** 4 — production de plants, sans mise en place au champ. */
  seedling: 'seedling',
} as const;
export type PlantingType = (typeof PlantingType)[keyof typeof PlantingType];

/** Raison de clôture d'une série (`Planting.@finish_reasons`). */
export const FinishReason = {
  /** 1 — récolte terminée. */
  harvestingFinished: 'harvesting_finished',
  /** 2 — culture ratée. */
  cropFailure: 'crop_failure',
  /** 3 — jamais semée. */
  cropNeverSeeded: 'crop_never_seeded',
  /** 4 — jamais plantée. */
  cropNeverPlanted: 'crop_never_planted',
} as const;
export type FinishReason = (typeof FinishReason)[keyof typeof FinishReason];

/**
 * Dates portées par une série (`PlantingDate.@types`), chacune avec un prévu et un
 * réalisé. Les dates de récolte n'en font pas partie : elles se déduisent des durées
 * et se conservent dans les périodes de récolte.
 */
export const PlantingDateType = {
  /** 1 — semis, en pépinière ou en place selon le mode d'implantation. */
  sowing: 'sowing',
  /** 2 — plantation (repiquage) au champ. */
  planting: 'planting',
  /** 3 — rempotage, entre le semis et la plantation. */
  potting: 'potting',
} as const;
export type PlantingDateType = (typeof PlantingDateType)[keyof typeof PlantingDateType];

/** Durées paramétrables d'une série (`Duration.@types`), en jours. */
export const PlantingDurationType = {
  /** 1 — du semis à la plantation (temps de pépinière). */
  daysToTransplant: 'days_to_transplant',
  /** 2 — de la mise en place à la première récolte. */
  daysToMaturity: 'days_to_maturity',
  /** 3 — durée de la période de récolte. */
  harvestWindow: 'harvest_window',
} as const;
export type PlantingDurationType = (typeof PlantingDurationType)[keyof typeof PlantingDurationType];

/** Nature d'une tâche (`Task.@task_types`) : les trois premières sont engendrées. */
export const TaskDefaultType = {
  /** 1 — semis direct au champ. */
  directSow: 'direct_sow',
  /** 2 — semis en pépinière. */
  greenhouseSow: 'greenhouse_sow',
  /** 3 — plantation. */
  transplant: 'transplant',
  /** 4 — tâche libre. */
  custom: 'custom',
} as const;
export type TaskDefaultType = (typeof TaskDefaultType)[keyof typeof TaskDefaultType];

/** Date de référence d'une étape d'itinéraire (`TemplateTask.@template_date_types`). */
export const TemplateDateType = {
  /** 1 — mise en place au champ (semis direct ou plantation). */
  fieldSowingPlanting: 'field_sowing_planting',
  /** 2 — semis en pépinière. */
  greenhouseSowing: 'greenhouse_sowing',
  /** 3 — première récolte. */
  firstHarvest: 'first_harvest',
  /** 4 — dernière récolte. */
  lastHarvest: 'last_harvest',
} as const;
export type TemplateDateType = (typeof TemplateDateType)[keyof typeof TemplateDateType];

/** Nature d'un fournisseur (`Provider.@provider_types`). */
export const ProviderType = {
  /** 1 — semencier. */
  seed: 'seed',
  /** 2 — fournisseur de plants. */
  transplant: 'transplant',
} as const;
export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

/**
 * Rôles sur une ferme (`Brinjel.Admin.Role`). Ce n'est pas une hiérarchie : le saisonnier
 * saisit des récoltes mais ne voit pas les commandes, le consultant fait l'inverse. La
 * matrice de permissions est dans `roles.ts`.
 */
export const FarmRole = {
  owner: 'owner',
  manager: 'manager',
  employee: 'employee',
  seasonal: 'seasonal',
  consultant: 'consultant',
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

/** Intervalle de dates inclusif. */
export interface DateRange {
  begin: IsoDate;
  end: IsoDate;
}

/** Fenêtre de récolte (`harvest_periods`) : une série peut en compter plusieurs. */
export type HarvestPeriod = DateRange;

/**
 * Paramètres d'une série utiles aux calculs (sous-ensemble de la table `plantings`).
 * Toutes les mesures sont des entiers, dans les unités de stockage de `units.ts` :
 * longueur en millimètres, espacement en dixièmes de millimètre, rendement en
 * millièmes d'unité, prix en centimes, densité en graines par kilogramme.
 */
export interface PlantingSpec {
  plantingType: PlantingType;
  /** Longueur de planche occupée, en millimètres. */
  length: number;
  /** Nombre de rangs sur la planche. */
  rows: number;
  /** Espacement sur le rang, en dixièmes de millimètre. */
  spacingPlants: number;
  /** Rendement escompté par mètre de planche, en millièmes d'unité. */
  yieldPerBedMeter?: number | null;
  /** Prix de vente unitaire, en centimes. */
  pricePerUnit?: number | null;
  /** Densité de semences, en graines par kilogramme. */
  seedsPerGram?: number | null;
  seedsPerHoleSeedling?: number | null;
  seedsPerHoleDirect?: number | null;
  /** Marge de sécurité à la commande, en pourcentage (semis direct uniquement). */
  seedsExtraPercentage?: number | null;
  /** Perte estimée en pépinière, en pourcentage (séries repiquées uniquement). */
  estimatedGreenhouseLoss?: number | null;
  /** Nombre d'alvéoles de la plaque de semis utilisée. */
  containerSize?: number | null;
}
