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
  /** Droit d'écrire sur la ferme, absent des déploiements sans politique d'accès. */
  access?: {
    canWrite: boolean;
    reason: 'ouverte' | 'essai' | 'essai_expire' | 'abonnement' | 'abonnement_expire' | 'suspendue';
    until: string | null;
  };
  /** La ferme est un centre de formation : la navigation en dépend. */
  trainingCenter?: boolean;
  /** Calendrier lunaire allumé. Éteint, l'interface n'en dit pas un mot. */
  moonCalendar?: boolean;
  /** La ferme est une ferme d'apprenant, et si la formation court encore. */
  training?: { ended: boolean } | null;
}

/** Une ferme modèle d'un centre, telle que `GET /training-center` la renvoie. */
export interface TrainingTemplate {
  id: number;
  name: string;
  slug: string;
  label: string | null;
  isDefault: boolean;
}

export interface TrainingCenter {
  farmId: number;
  defaultTemplateFarmId: number;
  defaultTrainingDuration: number;
  maximumTrainingDuration: number;
  templates: TrainingTemplate[];
  studentCount: number;
  activeStudentCount: number;
}

export interface StudentFarm {
  farmId: number;
  templateFarmId: number | null;
  endedAt: string | null;
  insertedAt: string;
  farm: {
    id: number;
    name: string;
    slug: string;
    trialExpiryDate: string;
    owner: { id: number; email: string } | null;
  };
  templateFarm: { id: number; name: string } | null;
  /** Adresse invitée, tant que la personne n'a pas de compte. */
  pendingEmail: string | null;
}

/** Qualification lunaire d'une journée, telle que `GET /moon/:year` la renvoie. */
export interface MoonDay {
  date: IsoDate;
  declination: number;
  trend: 'montante' | 'descendante';
  illumination: number;
  phase: 'nouvelle' | 'croissante' | 'pleine' | 'decroissante';
  eclipticLongitude: number;
  dayType: 'racine' | 'feuille' | 'fleur' | 'fruit';
  dayStartType: 'racine' | 'feuille' | 'fleur' | 'fruit';
  dayTypeChanges: { at: string; to: 'racine' | 'feuille' | 'fleur' | 'fruit' }[];
  singularities: ('perigee' | 'apogee' | 'noeud')[];
}

export type MoonPhaseDetail =
  | 'nouvelle'
  | 'premier-croissant'
  | 'premier-quartier'
  | 'gibbeuse-croissante'
  | 'pleine'
  | 'gibbeuse-decroissante'
  | 'dernier-quartier'
  | 'dernier-croissant';

export type MoonElement = 'feu' | 'terre' | 'air' | 'eau';

export type MoonIndexReason =
  'noeud' | 'perigee' | 'apogee' | 'journee-partagee' | 'lune-absente-du-jour';

/**
 * Fiche d'une journée, telle que `GET /moon/day/:date` la renvoie.
 *
 * Elle porte un indice chiffré, ce que le calendrier de l'année ne fait pas : c'est une
 * entorse assumée à la règle 5 du brief lunaire, consignée à son §11. L'interface doit
 * afficher `index.reasons` avec le chiffre — un indice qu'on ne peut pas ouvrir n'est
 * qu'un argument d'autorité.
 */
export interface MoonDayDetail extends MoonDay {
  phaseDetail: MoonPhaseDetail;
  element: MoonElement;
  /** Heures locales `HHhMM` ; nulles quand l'astre ne franchit pas l'horizon ce jour-là. */
  moonrise: string | null;
  moonset: string | null;
  sunrise: string | null;
  sunset: string | null;
  nextFullMoon: { date: IsoDate; inDays: number };
  nextNewMoon: { date: IsoDate; inDays: number };
  index: {
    score: number;
    label: 'exceptionnel' | 'tres-favorable' | 'favorable' | 'moyen' | 'a-eviter';
    window: {
      from: string;
      to: string;
      part: 'matin' | 'milieu-de-journee' | 'apres-midi' | 'fin-d-apres-midi' | 'soiree';
    } | null;
    reasons: { code: MoonIndexReason; delta: number }[];
  };
  observer: { latitude: number; longitude: number } | null;
}

/**
 * Météo d'une journée. `null` en entier quand le déploiement l'a éteinte, que la ferme
 * n'a pas de position ou que la date sort de la fenêtre couverte — trois façons de n'avoir
 * pas de météo, dont aucune n'est une panne.
 *
 * Températures en **dixièmes de degré**, hauteurs d'eau en dixièmes de millimètre,
 * vitesses en dixièmes de km/h : des entiers, comme tout le reste.
 */
export interface Weather {
  date: string;
  /** Code WMO 4677. */
  weatherCode: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  temperatureNow: number | null;
  precipitation: number | null;
  windMax: number | null;
}

/** Une fourchette de référence, aux unités de stockage. `null` quand la source se tait. */
export interface ReferenceRange {
  low: number | null;
  median: number;
  high: number | null;
}

/**
 * Une valeur de référence publiée, telle que `GET /references` la renvoie.
 *
 * Elle ne remplace jamais une donnée de la ferme : elle se **propose**, et l'interface
 * doit toujours afficher d'où elle vient. Les unités sont celles du dépôt — millièmes de
 * kg/m², secondes pour 100 m², centimes par kg.
 */
export interface ReferenceValue {
  id: number;
  cropKey: string;
  context: { abri: boolean | null; systeme: string; conduite: string | null };
  yield: ReferenceRange | null;
  labor: ReferenceRange | null;
  price: ReferenceRange | null;
  /** Effectif de l'échantillon ; nul pour une base compilée, et non un zéro. */
  n: number | null;
  pageRef: string;
  notes: string;
  source: {
    id: string;
    titre: string;
    auteurs: string[];
    annee: number;
    url: string;
    licence: string;
  };
}

/**
 * Réponse de la route des références.
 *
 * `matched` dit s'il y a des valeurs ; `cropKeys` dit si l'espèce était **rattachée**. Les
 * deux vides n'appellent pas le même message : sans clé, l'espèce est inconnue du
 * vocabulaire des sources et l'écran propose un rattachement ; avec des clés mais sans
 * valeur, elle est connue mais aucune source ne la couvre.
 */
export interface ReferenceAnswer {
  matched: boolean;
  cropKeys: string[];
  values: ReferenceValue[];
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
  /** Fond de carte supplémentaire du déploiement. Nul : Sillon n'en livre qu'un, OSM. */
  map?: { url: string; attribution: string; name: string } | null;
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
  /** Ce qu'on récolte, pour le calendrier lunaire. Nul tant que personne ne l'a renseigné. */
  harvestedPart?: 'root' | 'leaf' | 'flower' | 'fruit' | null;
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

/** Un fournisseur : un nom, un type, et de quoi le joindre. */
export interface Provider extends Named {
  type: 'seed' | 'transplant';
  /** Le site où l'on commande ; rend le nom cliquable sur la feuille de commande. */
  url?: string | null;
  /** Ce que la ferme sait de lui : délai, minimum de commande, date de clôture. */
  notes?: string | null;
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
  /** Contour dessiné sur la carte, GeoJSON Polygon. Nul tant que personne ne l'a tracé. */
  geometry?: unknown;
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
  /** Surcharge de `crop.harvestedPart` pour cette série : une carotte porte-graine se mène
   *  en jour fruit. Nulle, c'est l'espèce qui répond. */
  harvestedPart?: 'root' | 'leaf' | 'flower' | 'fruit' | null;
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
  /** Site du fournisseur : la feuille de commande y mène, quand il est renseigné. */
  providerUrl?: string | null;
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
