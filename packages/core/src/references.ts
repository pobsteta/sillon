// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Valeurs de référence issues de la recherche française sur les microfermes
// (lot 0 de `specs/brief-sillon-references-microfermes.md`).
//
// **Ce que ce module garantit, et ce qu'il ne garantit pas.** Il valide la forme d'un jeu
// de références et le convertit aux unités du dépôt. Il ne dit rien de la justesse des
// chiffres : ceux-là viennent de travaux publiés, ils sont cités, et c'est la citation —
// non le code — qui en répond. D'où l'obligation, portée par le schéma, qu'aucune entrée
// n'existe sans sa source et sa page.
//
// **Le principe directeur du brief tient en une phrase** : les références ne remplacent
// jamais les données de la ferme. Ce module n'écrit donc rien nulle part. Il rend des
// valeurs qu'un écran propose, qu'une personne accepte ou refuse, et le lot A se charge
// de ne jamais les enregistrer en silence.
//
// **La validation vit ailleurs.** `references-schema.ts` porte le schéma Zod et le
// chargeur ; ce module-ci n'a aucune dépendance, et peut donc partir dans le navigateur
// sans y traîner Zod. Voir l'en-tête de l'autre fichier.
//
// **Les unités.** Le brief décrit les entrées telles qu'elles sont publiées — kg/m²,
// heures pour 100 m², euros le kilo, en décimales. Le dépôt, lui, stocke des entiers
// (`CLAUDE.md`). Les deux ne se contredisent pas : le JSON est un **format d'échange**
// qui recopie une source, et la conversion a lieu au bord, ici. Arrondir dans le fichier
// reviendrait à modifier la donnée citée.

/** Système de culture décrit par la source. `tous` quand elle ne distingue pas. */
export const SYSTEMES = ['bio-intensif', 'permaculture', 'mixte', 'tous'] as const;
export type SystemeCulture = (typeof SYSTEMES)[number];

/**
 * Mode de conduite. Distinct de `systeme` : une microferme bio-intensive et un maraîchage
 * diversifié conventionnel sont deux **systèmes**, la certification biologique est une
 * **conduite**. `null` quand la source ne distingue pas.
 */
export const CONDUITES = ['biologique', 'conventionnelle'] as const;
export type Conduite = (typeof CONDUITES)[number];

/**
 * Une fourchette publiée. `median` est seule obligatoire : plusieurs agrégats ne donnent
 * qu'une médiane, et exiger les trois bornes obligerait à en inventer deux.
 */
export interface Fourchette {
  low?: number | undefined;
  median: number;
  high?: number | undefined;
}

/**
 * En-tête de source. Complet, parce qu'une valeur de référence sans provenance
 * vérifiable est une affirmation, pas une référence.
 *
 * `licence` porte un identifiant SPDX (`etalab-2.0`) ou l'une de deux valeurs
 * conventionnelles : `a-verifier`, et `reutilisation-autorisee` — la réutilisation est
 * permise sur décision du projet, faute d'identifiant publié. La seconde est plus faible
 * qu'une licence nommée, et le dit plutôt que de le maquiller.
 */
export interface Source {
  id: string;
  titre: string;
  auteurs: string[];
  annee: number;
  url: string;
  licence: string;
  notes: string;
}

/** Ce qu'une source dit d'une culture, dans un contexte donné. */
export interface Entree {
  source_id: string;
  crop_key: string;
  context: { abri: boolean | null; systeme: SystemeCulture; conduite: Conduite | null };
  yield_kg_m2?: Fourchette | undefined;
  labor_h_100m2?: Fourchette | undefined;
  price_eur_kg?: Fourchette | undefined;
  /** Effectif de l'échantillon, **quand la source en est un**. Nul pour une base compilée. */
  n: number | null;
  page_ref: string;
  notes: string;
}

/**
 * Les grandeurs que les sources publient **à l'échelle de l'exploitation**.
 *
 * Elles ne se ramènent pas à une culture, et c'est tout leur intérêt : « 2 000 à 8 000 m²
 * cultivés par équivalent temps plein en maraîchage biointensif » ne se répartit pas entre
 * carottes et tomates. Les forcer dans une entrée par culture aurait obligé à inventer une
 * clé de culture qui n'existe pas, ou à répartir un agrégat — deux façons de fabriquer un
 * chiffre que personne n'a mesuré.
 *
 * La liste reste courte et fermée : chaque métrique porte une unité de stockage précise
 * (voir `farmMetricToStorage`), et une métrique ajoutée sans son unité serait un nombre
 * sans sens.
 */
export const METRIQUES_FERME = [
  /** Surface cultivée par équivalent temps plein, en **mètres carrés**. */
  'surface-cultivee-par-etp',
  /** Chiffre d'affaires par mètre carré cultivé, en **centimes**. */
  'chiffre-affaires-par-m2',
  /** Temps de travail annuel, en **secondes**. */
  'heures-par-an',
  /** Revenu net mensuel par personne, en **centimes**. */
  'revenu-mensuel-par-personne',
] as const;
export type MetriqueFerme = (typeof METRIQUES_FERME)[number];

/** Un repère d'exploitation : une grandeur, un contexte, une fourchette. */
export interface EntreeFerme {
  source_id: string;
  metric: MetriqueFerme;
  context: { systeme: SystemeCulture; conduite: Conduite | null };
  range: Fourchette;
  n: number | null;
  page_ref: string;
  notes: string;
}

export interface FichierReferences {
  source: Source;
  values: Entree[];
  /**
   * Repères d'exploitation. Vide dans la plupart des jeux : une base de planification
   * décrit des cultures, une enquête décrit des fermes, et peu font les deux.
   */
  farm_values: EntreeFerme[];
}

/** La source annonce-t-elle une licence encore à vérifier ? */
export const licenceAVerifier = (source: Source): boolean => source.licence === 'a-verifier';

/** La réutilisation repose-t-elle sur une décision du projet, et non sur une licence nommée ? */
export const reutilisationSurDecision = (source: Source): boolean =>
  source.licence === 'reutilisation-autorisee';

// ───────────────────────── Unités de stockage ─────────────────────────

/** Rendement en **millièmes de kilogramme par mètre carré**. */
export const yieldToStorage = (kgParM2: number): number => Math.round(kgParM2 * 1000);

/** Temps de travail en **secondes pour cent mètres carrés**. */
export const laborToStorage = (heuresPour100m2: number): number =>
  Math.round(heuresPour100m2 * 3600);

/** Prix en **centimes par kilogramme**. */
export const priceToStorage = (eurosParKg: number): number => Math.round(eurosParKg * 100);

/**
 * Convertit une valeur de repère d'exploitation dans son unité de stockage.
 *
 * **Chaque métrique a la sienne**, et c'est pour cela que la liste est fermée : 8 000 m²
 * par ETP, 6,10 € du mètre carré et 2 700 heures par an ne se stockent pas de la même
 * façon, et une conversion unique les aurait tous abîmés. La table ci-dessous est
 * exhaustive par construction — TypeScript refuse d'oublier une métrique.
 */
const VERS_STOCKAGE_FERME: Record<MetriqueFerme, (valeur: number) => number> = {
  // Déjà en mètres carrés : on arrondit, on ne convertit pas.
  'surface-cultivee-par-etp': (m2) => Math.round(m2),
  'chiffre-affaires-par-m2': (euros) => Math.round(euros * 100),
  'heures-par-an': (heures) => Math.round(heures * 3600),
  'revenu-mensuel-par-personne': (euros) => Math.round(euros * 100),
};

export const farmMetricToStorage = (metric: MetriqueFerme, valeur: number): number =>
  VERS_STOCKAGE_FERME[metric](valeur);

/** Une fourchette convertie, bornes comprises. */
export interface FourchetteStockee {
  low: number | null;
  median: number;
  high: number | null;
}

const convertir = (
  plage: Fourchette | undefined,
  versStockage: (valeur: number) => number,
): FourchetteStockee | null =>
  plage
    ? {
        low: plage.low === undefined ? null : versStockage(plage.low),
        median: versStockage(plage.median),
        high: plage.high === undefined ? null : versStockage(plage.high),
      }
    : null;

/** Une entrée aux unités du dépôt : des entiers, comme tout le reste. */
export interface ReferenceStockee {
  sourceId: string;
  cropKey: string;
  context: { abri: boolean | null; systeme: SystemeCulture; conduite: Conduite | null };
  /** Millièmes de kg/m². */
  yield: FourchetteStockee | null;
  /** Secondes pour 100 m². */
  labor: FourchetteStockee | null;
  /** Centimes par kg. */
  price: FourchetteStockee | null;
  n: number | null;
  pageRef: string;
  notes: string;
}

/** Un repère d'exploitation aux unités du dépôt. */
export interface ReferenceFermeStockee {
  sourceId: string;
  metric: MetriqueFerme;
  context: { systeme: SystemeCulture; conduite: Conduite | null };
  range: FourchetteStockee;
  n: number | null;
  pageRef: string;
  notes: string;
}

export function farmToStorage(entree: EntreeFerme): ReferenceFermeStockee {
  const convertirValeur = (valeur: number) => farmMetricToStorage(entree.metric, valeur);
  return {
    sourceId: entree.source_id,
    metric: entree.metric,
    context: entree.context,
    range: {
      low: entree.range.low === undefined ? null : convertirValeur(entree.range.low),
      median: convertirValeur(entree.range.median),
      high: entree.range.high === undefined ? null : convertirValeur(entree.range.high),
    },
    n: entree.n,
    pageRef: entree.page_ref,
    notes: entree.notes,
  };
}

export function toStorage(entree: Entree): ReferenceStockee {
  return {
    sourceId: entree.source_id,
    cropKey: entree.crop_key,
    context: entree.context,
    yield: convertir(entree.yield_kg_m2, yieldToStorage),
    labor: convertir(entree.labor_h_100m2, laborToStorage),
    price: convertir(entree.price_eur_kg, priceToStorage),
    n: entree.n,
    pageRef: entree.page_ref,
    notes: entree.notes,
  };
}

// ───────────────────── Correspondance avec le référentiel ─────────────────────

/**
 * `crop_key` → espèce du référentiel de départ, par son nom français et anglais.
 *
 * **La correspondance est plusieurs-vers-une, et c'est le fait qui commande.** Les sources
 * distinguent ce que Sillon réunit : Pépinière-Mesclun sépare « Carotte conservation » de
 * « Carotte frais », « PDT primeur » de « PDT conservation », et trois tomates. Le
 * référentiel de Sillon n'a qu'une « Carotte ». Une espèce peut donc avoir plusieurs jeux
 * de références, et l'interface les présente côte à côte plutôt que d'en élire un.
 *
 * **La table est volontairement incomplète.** Elle ne porte que les rapprochements dont on
 * est sûr. Cerfeuil tubéreux, crosne, rhubarbe, pourpier n'ont pas d'espèce chez Sillon :
 * leurs références existent et attendent, sans être rattachées à tort. `cropKeysFor` rend
 * une liste vide pour le reste, et le brief prévoit un rattrapage à la main dans
 * l'interface — encore faut-il lui laisser la main plutôt que de deviner.
 */
export const CROP_KEYS: Record<string, { fr: string; en: string }> = {
  // Une clé par ligne de source, même quand plusieurs visent la même espèce.
  ail: { fr: 'Ail', en: 'Garlic' },
  'ail-conservation': { fr: 'Ail', en: 'Garlic' },
  artichaut: { fr: 'Artichaut', en: 'Artichoke' },
  aubergine: { fr: 'Aubergine', en: 'Eggplant' },
  betterave: { fr: 'Betterave', en: 'Beetroot' },
  'betterave-conservation': { fr: 'Betterave', en: 'Beetroot' },
  blette: { fr: 'Blette', en: 'Chard' },
  brocoli: { fr: 'Brocoli', en: 'Broccoli' },
  carotte: { fr: 'Carotte', en: 'Carrot' },
  'carotte-conservation': { fr: 'Carotte', en: 'Carrot' },
  celeri: { fr: 'Céleri', en: 'Celery' },
  // Le céleri-branche est la feuille, le céleri-rave la racine (brief lunaire §4). Sillon
  // n'a qu'une « Céleri » : les deux s'y rattachent, et la distinction se lit à la clé.
  'celeri-branche': { fr: 'Céleri', en: 'Celery' },
  'celeri-rave': { fr: 'Céleri', en: 'Celery' },
  chicoree: { fr: 'Chicorée', en: 'Chicory' },
  chou: { fr: 'Chou', en: 'Cabbage' },
  'chou-chinois': { fr: 'Chou', en: 'Cabbage' },
  'chou-de-bruxelles': { fr: 'Chou', en: 'Cabbage' },
  'chou-fleur': { fr: 'Chou-fleur', en: 'Cauliflower' },
  'chou-kale-frise-non-pomme': { fr: 'Chou', en: 'Cabbage' },
  concombre: { fr: 'Concombre', en: 'Cucumber' },
  courge: { fr: 'Courge', en: 'Winter squash' },
  courgette: { fr: 'Courgette', en: 'Zucchini' },
  echalote: { fr: 'Échalote', en: 'Shallot' },
  epinard: { fr: 'Épinard', en: 'Spinach' },
  'mesclun-epinard': { fr: 'Épinard', en: 'Spinach' },
  fenouil: { fr: 'Fenouil', en: 'Fennel' },
  feve: { fr: 'Fève', en: 'Broad bean' },
  haricot: { fr: 'Haricot', en: 'Bean' },
  'haricot-sec-ou-demi-sec': { fr: 'Haricot', en: 'Bean' },
  'haricot-vert': { fr: 'Haricot', en: 'Bean' },
  laitue: { fr: 'Laitue', en: 'Lettuce' },
  mache: { fr: 'Mâche', en: 'Corn salad' },
  melon: { fr: 'Melon', en: 'Melon' },
  navet: { fr: 'Navet', en: 'Turnip' },
  'navet-conservation': { fr: 'Navet', en: 'Turnip' },
  oignon: { fr: 'Oignon', en: 'Onion' },
  'oignon-conservation': { fr: 'Oignon', en: 'Onion' },
  persil: { fr: 'Persil', en: 'Parsley' },
  poireau: { fr: 'Poireau', en: 'Leek' },
  pois: { fr: 'Pois', en: 'Pea' },
  'petit-pois-et-mange-tout': { fr: 'Pois', en: 'Pea' },
  poivron: { fr: 'Poivron', en: 'Pepper' },
  'pomme-de-terre': { fr: 'Pomme de terre', en: 'Potato' },
  'pdt-conservation': { fr: 'Pomme de terre', en: 'Potato' },
  'pdt-primeur': { fr: 'Pomme de terre', en: 'Potato' },
  radis: { fr: 'Radis', en: 'Radish' },
  'radis-conservation': { fr: 'Radis', en: 'Radish' },
  roquette: { fr: 'Roquette', en: 'Rocket' },
  tomate: { fr: 'Tomate', en: 'Tomato' },
  'tomate-ancienne': { fr: 'Tomate', en: 'Tomato' },
  'tomate-cerise': { fr: 'Tomate', en: 'Tomato' },
  'tomate-classique': { fr: 'Tomate', en: 'Tomato' },
};

/** Compare deux noms d'espèce sans tenir compte de la casse ni des accents. */
const normaliser = (texte: string): string =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Toutes les `crop_key` qui décrivent cette espèce, dans l'ordre de la table.
 *
 * Rend une liste **vide** plutôt qu'une approximation. « Chou-rave » rangé sous « chou »
 * hériterait de rendements qui ne sont pas les siens, et le chiffre resterait crédible :
 * c'est le défaut que ce module existe pour empêcher.
 */
export function cropKeysFor(nomEspece: string): string[] {
  const cible = normaliser(nomEspece);
  if (cible === '') return [];
  return Object.entries(CROP_KEYS)
    .filter(([, noms]) => normaliser(noms.fr) === cible || normaliser(noms.en) === cible)
    .map(([cle]) => cle);
}

/** Les espèces du référentiel que la table sait rattacher, sans doublon. */
export const especesCouvertes = (): string[] => [
  ...new Set(Object.values(CROP_KEYS).map((noms) => noms.fr)),
];

// ───────────────── Du repère publié au champ de saisie ─────────────────

/**
 * Convertit un rendement de référence en **rendement par mètre de planche**, l'unité du
 * champ `yieldPerBedMeter` d'une série.
 *
 * **Les deux unités ne sont pas les mêmes, et l'écart est silencieux.** Les sources
 * publient des kg par mètre **carré** ; Sillon saisit des unités par mètre **de planche**,
 * parce que c'est ainsi qu'on compte au champ. Le passage de l'un à l'autre est une
 * multiplication par la largeur de planche — 0,8 m le plus souvent. Proposer 2,775 là où
 * la ferme attend 2,22 serait faux d'un quart, avec un nombre parfaitement plausible.
 *
 * Rend `null` quand la ferme n'a pas déclaré de largeur de planche : la suggestion se tait
 * alors, plutôt que de supposer 80 cm pour tout le monde.
 *
 * @param milliKgParM2 Rendement de référence, en millièmes de kg/m².
 * @param largeurPlancheMm Largeur de planche de la ferme, en millimètres.
 * @returns Millièmes d'unité par mètre de planche, ou `null`.
 */
export function yieldPerBedMeterFromReference(
  milliKgParM2: number,
  largeurPlancheMm: number | null | undefined,
): number | null {
  if (largeurPlancheMm == null || largeurPlancheMm <= 0) return null;
  return Math.round((milliKgParM2 * largeurPlancheMm) / 1000);
}

/**
 * La valeur à proposer parmi plusieurs références : **la médiane des médianes**.
 *
 * Une espèce peut recevoir plusieurs jeux — conduite biologique et conventionnelle, ou
 * plusieurs lignes de source pour « pomme de terre ». En retenir une au hasard ferait
 * dépendre la suggestion de l'ordre de lecture ; en faire la moyenne laisserait une valeur
 * extrême tirer le résultat. La médiane ne fait ni l'un ni l'autre.
 *
 * Rend `null` sur une liste vide : il n'y a alors rien à proposer, et c'est une réponse.
 */
export function medianeDesReferences(medianes: number[]): number | null {
  const triees = [...medianes].filter((valeur) => Number.isFinite(valeur)).sort((a, b) => a - b);
  if (triees.length === 0) return null;
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1
    ? triees[milieu]!
    : Math.round((triees[milieu - 1]! + triees[milieu]!) / 2);
}
