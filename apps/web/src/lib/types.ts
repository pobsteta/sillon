// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Formes renvoyées par l'API, telles que l'interface les consomme.
// Les mesures sont des entiers : centimètres, centimes, jours, minutes.

import type { IsoDate, PlantingDates, PlantingDurations, PlantingType } from '@sillon/core';

export interface Farm {
  id: number;
  name: string;
  slug: string;
  role: 'owner' | 'manager' | 'employee' | 'seasonal' | 'consultant';
  countryCode?: string;
}

export interface CurrentUser {
  id: number;
  email: string;
  locale: string;
  confirmedAt: string | null;
}

export interface Session {
  user: CurrentUser;
  farms: Farm[];
}

export interface Family {
  id: number;
  name: string;
  color: string;
  interval: number;
}

export interface Crop {
  id: number;
  name: string;
  color: string;
  familyId: number;
  family?: Family;
}

export interface Variety {
  id: number;
  name: string;
  cropId: number;
  providerId: number;
  crop?: Crop;
  provider?: Named;
}

export interface Named {
  id: number;
  name: string;
}

export interface Container extends Named {
  size: number;
}

export interface Tag extends Named {
  color: string;
}

export interface TaskType extends Named {
  color: string;
  methods?: TaskMethod[];
}

export interface TaskMethod extends Named {
  typeId: number;
  implements?: Named[];
}

export interface LocationNode {
  id: number;
  name: string;
  parentId: number | null;
  bedLength: number;
  bedWidth: number | null;
  greenhouse: boolean;
  position: number;
  _count?: { children: number; assignments: number };
}

export interface SeedComputation {
  /** Poquets ou alvéoles, valeur non arrondie comme dans Brinjel. */
  holes: number;
  /** Plants attendus en place, pertes de pépinière comprises. */
  seedlings: number;
  /** Plaques de pépinière, à deux décimales. */
  containers: number | null;
  seedsNumber: number;
  /** Masse de semences, en grammes. */
  seedsWeightGrams: number | null;
  /** Rendement escompté, en millièmes d'unité. */
  expectedYield: number;
  /** Produit escompté, en centimes. */
  expectedRevenue: number;
  /** Longueur déjà posée sur l'assolement, en millimètres. */
  assignedLength: number;
}

export interface Planting {
  id: number;
  cropId: number;
  varietyId: number | null;
  unitId: number | null;
  containerId: number | null;
  plantingType: PlantingType;
  inGreenhouse: boolean | null;
  length: number | null;
  rows: number | null;
  spacingPlants: number | null;
  yieldPerBedMeter: number | null;
  pricePerUnit: number | null;
  seedsPerGram: number | null;
  seedsPerHoleSeedling: number | null;
  seedsPerHoleDirect: number | null;
  seedsExtraPercentage: number | null;
  estimatedGreenhouseLoss: number | null;
  finished: boolean;
  crop: Crop;
  variety: Variety | null;
  unit: Named | null;
  container: Container | null;
  tags: Tag[];
  dates: PlantingDates;
  durations: PlantingDurations;
  harvestPeriods: { begin: IsoDate; end: IsoDate }[];
  /** Mise en place au champ ; `null` pour une production de plants. */
  fieldDate: IsoDate | null;
  occupation: { begin: IsoDate; end: IsoDate } | null;
  computed: SeedComputation;
  assignments: { locationId: number; length: number; location: LocationNode }[];
}

export interface GanttBar {
  plantingId: number;
  cropName: string;
  varietyName: string | null;
  color: string;
  familyId: number;
  familyName: string;
  inGreenhouse: boolean;
  placed: boolean;
  nursery: { begin: IsoDate; end: IsoDate } | null;
  growing: { begin: IsoDate; end: IsoDate };
  /** Une série peut compter plusieurs fenêtres de récolte. */
  harvest: { begin: IsoDate; end: IsoDate }[];
}

export interface Task {
  id: number;
  typeId: number | null;
  type: TaskType | null;
  method: Named | null;
  implement: Named | null;
  defaultType: 'direct_sow' | 'greenhouse_sow' | 'transplant' | 'custom';
  plannedDate: IsoDate;
  effectiveDate: IsoDate;
  done: boolean;
  daysInField: number;
  plannedLaborTime: number | null;
  effectiveLaborTime: number | null;
  description: string | null;
  status: 'done' | 'late' | 'today' | 'upcoming';
  plantings: { planting: { id: number; crop: Named; variety: Named | null } }[];
  locations: { location: Named }[];
}

export interface TaskTemplate {
  id: number;
  name: string;
  tasks: {
    id: number;
    typeId: number;
    type?: TaskType;
    linkDays: number;
    templateDateType:
      'field_sowing_planting' | 'greenhouse_sowing' | 'first_harvest' | 'last_harvest';
    daysInField: number;
    plannedLaborTime: number | null;
    description: string | null;
  }[];
}

export interface Harvest {
  id: number;
  plantingId: number;
  date: IsoDate;
  quantity: number;
  laborTime: number | null;
  done: boolean;
  planting?: { crop: Named; variety: Named | null; unit: Named | null };
}

export type Photo = Named;

export interface Note {
  id: number;
  content: string;
  date: IsoDate;
  pinned: boolean;
  archivedAt: string | null;
  photos: { photo: Photo }[];
  /** Séries auxquelles la note est rattachée ; absent des réponses de création. */
  plantings?: { planting: { id: number; crop: Named } }[];
  /** Planches auxquelles la note est rattachée. */
  locations?: { location: Named }[];
}

export interface OrderLine {
  key: string;
  cropName: string;
  varietyName: string | null;
  providerName: string | null;
  plantingCount: number;
  seedsNumber: number;
  /** Masse de semences, en grammes. */
  seedsQuantityGrams: number | null;
  transplantsToBuy: number;
  firstNeededOn: IsoDate | null;
}

export interface Stats {
  year: number;
  plantings: { total: number; placed: number; finished: number; underCover: number };
  tasks: {
    total: number;
    done: number;
    labor: { planned: number; effective: number };
    byType: { name: string; color: string; planned: number; effective: number }[];
  };
  yields: { expected: number; actual: number; expectedRevenue: number };
  crops: {
    /** Clé d'agrégat : une ligne par espèce ET par unité de récolte. */
    key: string;
    cropId: number;
    cropName: string;
    familyName: string;
    color: string;
    unitName: string | null;
    plantingCount: number;
    bedLength: number;
    expectedYield: number;
    actualYield: number;
    expectedRevenue: number;
    yieldPerBedMeter: number;
    comparison: { difference: number; differencePercentage: number | null };
  }[];
}

export interface AvailableLocation {
  bed: { id: number; name: string; bedLength: number; greenhouse: boolean };
  availableLength: number;
  fits: boolean;
  rotation: {
    previousPlantingId: number;
    lastSeenOn: IsoDate;
    availableFrom: IsoDate;
    missingDays: number;
  } | null;
}
