// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fiche d'une journée lunaire : ce que `moon.ts` calcule, plus ce qui dépend du **lieu**.
//
// Pourquoi un module à part. `moon.ts` rend une année entière en une requête — 365 lignes
// que le service worker garde —, et tout ce qu'on y ajouterait serait multiplié par 365 :
// le poids du calendrier hors ligne est un engagement du brief (§5), pas un détail. Les
// levers et couchers, eux, supposent une position, donc un observateur, donc un calcul que
// seule la journée regardée justifie. D'où deux formes : l'année, légère et sans lieu ; la
// journée, complète et située.
//
// **Ce module s'écarte d'une règle du brief, et il faut le dire ici plutôt que le
// découvrir en revue.** `brief/jardinage-lunaire.md` §7 règle 5 interdit le vocabulaire
// d'efficacité — « favorable », « idéal », « meilleur moment » — et §10 met en garde contre
// l'attente d'un contenu éditorial. La fiche du jour, elle, porte un indice chiffré et un
// créneau conseillé : c'est une demande explicite, tranchée le 20 septembre 2026, et
// consignée au §11 du brief. Les garde-fous qui restent :
//
// 1. l'indice **s'explique** — `reasons` dit ce qui a joué et de combien, et l'interface
//    l'affiche. Un chiffre qu'on ne peut pas ouvrir est un argument d'autorité ;
// 2. il ne mesure **aucun effet sur les plantes** : il agrège les journées que la tradition
//    dit singulières, rien de plus, et la fiche le répète en toutes lettres ;
// 3. il ne commande rien — aucune date refusée, aucune tâche déplacée (§7 règles 1 à 3) ;
// 4. il n'existe que **calendrier allumé**, qui reste éteint par défaut.

import { Body, Observer, SearchMoonPhase, SearchRiseSet } from 'astronomy-engine';
import { addDays, daysBetween, toIsoDate } from './dates.js';
import {
  DEFAUTS,
  decalageMinutes,
  heureLocale,
  instantLocal,
  moonDay,
  pointsSinguliers,
  type MoonDay,
  type MoonDayType,
  type MoonOptions,
} from './moon.js';
import type { IsoDate } from './types.js';

/**
 * La phase à huit noms, celle que les calendriers impriment.
 *
 * `MoonDay.phase` n'en distingue que quatre, ce qui suffit à qualifier une journée mais
 * pas à la nommer : « croissante » couvre aussi bien un filet de lumière qu'un disque aux
 * neuf dixièmes plein. Les deux coexistent — l'année garde la forme courte, la fiche du
 * jour porte la longue.
 */
export type MoonPhaseDetail =
  | 'nouvelle'
  | 'premier-croissant'
  | 'premier-quartier'
  | 'gibbeuse-croissante'
  | 'pleine'
  | 'gibbeuse-decroissante'
  | 'dernier-quartier'
  | 'dernier-croissant';

/** L'élément du type de jour : feu → fruit, terre → racine, air → fleur, eau → feuille. */
export type MoonElement = 'feu' | 'terre' | 'air' | 'eau';

/** Moment de la journée où tombe le créneau, pour le nommer sans donner deux heures. */
export type DayPart = 'matin' | 'milieu-de-journee' | 'apres-midi' | 'fin-d-apres-midi' | 'soiree';

/** Les cinq crans de l'indice. Des étiquettes, pas des mesures : voir l'en-tête. */
export type MoonIndexLabel = 'exceptionnel' | 'tres-favorable' | 'favorable' | 'moyen' | 'a-eviter';

/** Ce qui a retiré des points, nommé pour que le chiffre s'ouvre. */
export type MoonIndexReason =
  'noeud' | 'perigee' | 'apogee' | 'journee-partagee' | 'lune-absente-du-jour';

export interface MoonIndex {
  /** De 0 à 100. Agrégat des journées dites singulières, rien d'autre. */
  score: number;
  label: MoonIndexLabel;
  /**
   * Heures où la lune est au-dessus de l'horizon **et** où il fait jour, heure locale.
   * Nul quand les deux ne se croisent pas — ce qui arrive, et qu'il vaut mieux dire que
   * combler par une plage inventée.
   */
  window: { from: string; to: string; part: DayPart } | null;
  /** Le détail du calcul, affiché sous l'indice. Vide quand rien n'a été retiré. */
  reasons: { code: MoonIndexReason; delta: number }[];
}

export interface MoonDayDetail extends MoonDay {
  phaseDetail: MoonPhaseDetail;
  element: MoonElement;
  /**
   * Lever et coucher, heure locale `HHhMM`. Nuls quand l'astre ne franchit pas l'horizon
   * dans la journée : la lune saute un jour sur trente environ, et le soleil des semaines
   * entières au-delà des cercles polaires. Un `null` est une réponse, pas une panne.
   */
  moonrise: string | null;
  moonset: string | null;
  sunrise: string | null;
  sunset: string | null;
  /** Prochaine pleine lune, et nombre de jours qui l'en séparent (0 = aujourd'hui). */
  nextFullMoon: { date: IsoDate; inDays: number };
  nextNewMoon: { date: IsoDate; inDays: number };
  index: MoonIndex;
  /** Position retenue pour les levers et couchers ; nulle si la ferme n'en a pas. */
  observer: { latitude: number; longitude: number } | null;
}

export interface MoonDetailOptions extends MoonOptions {
  /** Position de la ferme, en degrés décimaux. Sans elle, pas de lever ni de coucher. */
  latitude?: number | null;
  longitude?: number | null;
}

const ELEMENT_PAR_TYPE: Record<MoonDayType, MoonElement> = {
  fruit: 'feu',
  racine: 'terre',
  fleur: 'air',
  feuille: 'eau',
};

/** L'élément que la tradition attache à ce type de jour. */
export function elementOf(dayType: MoonDayType): MoonElement {
  return ELEMENT_PAR_TYPE[dayType];
}

/**
 * Nomme la phase à partir de la part éclairée et du sens du cycle.
 *
 * Les bornes sont celles de l'usage : « nouvelle » et « pleine » ne désignent pas un
 * instant mais les jours où l'œil ne voit plus la différence ; les quartiers encadrent la
 * moitié éclairée. Un seuil à 0 pour la nouvelle lune ne serait vrai qu'une minute par
 * mois et ferait disparaître le mot du calendrier.
 */
export function phaseDetailFrom(illumination: number, croissante: boolean): MoonPhaseDetail {
  const part = illumination / 1000;
  if (part < 0.02) return 'nouvelle';
  if (part > 0.98) return 'pleine';
  if (part < 0.45) return croissante ? 'premier-croissant' : 'dernier-croissant';
  if (part <= 0.55) return croissante ? 'premier-quartier' : 'dernier-quartier';
  return croissante ? 'gibbeuse-croissante' : 'gibbeuse-decroissante';
}

/**
 * L'indice du jour, et ce qui l'a fait.
 *
 * **Une convention, pas une mesure.** Cent moins ce que la tradition retranche : le nœud
 * lunaire, que les calendriers marquent comme journée d'abstention, coûte le plus ; le
 * périgée et l'apogée, tenus pour perturbés, coûtent moitié moins ; une journée coupée en
 * deux types coûte peu, parce qu'elle gêne l'organisation du travail plus qu'elle ne
 * qualifie le ciel. Rien ici ne prétend prédire une levée ou un rendement.
 *
 * Les pénalités s'additionnent et le total est borné à zéro : un jour de nœud au périgée
 * pendant un changement de constellation descend au plancher, ce qui est le résultat
 * voulu — ce jour-là, la tradition dit de s'abstenir, et l'indice le dit aussi.
 */
export function moonIndex(
  jour: MoonDay,
  window: MoonIndex['window'],
  lunePresente: boolean,
): MoonIndex {
  const reasons: { code: MoonIndexReason; delta: number }[] = [];

  if (jour.singularities.includes('noeud')) reasons.push({ code: 'noeud', delta: -45 });
  if (jour.singularities.includes('perigee')) reasons.push({ code: 'perigee', delta: -20 });
  if (jour.singularities.includes('apogee')) reasons.push({ code: 'apogee', delta: -20 });

  // Deux changements coûtent autant qu'un : au-delà, la journée est « partagée », et
  // l'empiler n'ajoute aucune information.
  if (jour.dayTypeChanges.length > 0) reasons.push({ code: 'journee-partagee', delta: -10 });

  // La lune n'est pas au-dessus de l'horizon pendant les heures ouvrables : un fait, qui
  // coûte peu, et qui explique l'absence de créneau affiché juste à côté.
  if (!lunePresente) reasons.push({ code: 'lune-absente-du-jour', delta: -5 });

  const score = Math.max(0, Math.min(100, 100 + reasons.reduce((t, r) => t + r.delta, 0)));

  return { score, label: labelDe(score), window, reasons };
}

function labelDe(score: number): MoonIndexLabel {
  if (score >= 90) return 'exceptionnel';
  if (score >= 70) return 'tres-favorable';
  if (score >= 50) return 'favorable';
  if (score >= 30) return 'moyen';
  return 'a-eviter';
}

/** Le moment de la journée où tombe un instant, pour le nommer d'un mot. */
export function dayPartOf(minutesDepuisMinuit: number): DayPart {
  const heure = minutesDepuisMinuit / 60;
  if (heure < 10) return 'matin';
  if (heure < 14) return 'milieu-de-journee';
  if (heure < 17) return 'apres-midi';
  if (heure < 20) return 'fin-d-apres-midi';
  return 'soiree';
}

/**
 * Cherche un lever ou un coucher dans la journée locale.
 *
 * La recherche part de minuit local et ne dépasse pas la journée : `SearchRiseSet` rendrait
 * volontiers l'événement du lendemain, et une heure de lendemain affichée comme celle du
 * jour est exactement le genre d'erreur qui ne se voit pas. Rend `null` quand l'événement
 * n'a pas lieu ce jour-là, ce qui arrive vraiment.
 */
function evenement(
  corps: Body,
  observateur: Observer,
  sens: 1 | -1,
  debut: Date,
  fin: Date,
): Date | null {
  const limite = (fin.getTime() - debut.getTime()) / 86_400_000;
  const trouve = SearchRiseSet(corps, observateur, sens, debut, limite);
  if (!trouve) return null;
  const instant = trouve.date;
  return instant >= debut && instant < fin ? instant : null;
}

/**
 * Le créneau : les heures où la lune est au-dessus de l'horizon et où il fait jour.
 *
 * C'est une **intersection de deux faits**, et rien d'autre : aucune règle de tradition ne
 * fixe d'heure dans la journée, et en inventer une serait ajouter une affirmation à une
 * fonctionnalité qui en porte déjà. Ce que le créneau dit est vérifiable en levant la tête.
 */
function creneau(
  lever: Date | null,
  coucher: Date | null,
  aube: Date | null,
  crepuscule: Date | null,
  debut: Date,
  fin: Date,
  timeZone: string,
): MoonIndex['window'] {
  // Un astre déjà levé à minuit n'a pas de lever dans la journée : sa présence commence
  // alors au début du jour, et non « jamais ». Le même raisonnement vaut à l'autre bout.
  const lunePleinJour = lever === null && coucher === null;
  const debutLune = lever ?? debut;
  const finLune = coucher ?? fin;
  // Lune levée puis couchée, ou couchée puis levée : dans le second cas elle est présente
  // en début **et** en fin de journée, et retenir [coucher, lever] inverserait tout.
  const luneCoupee = lever !== null && coucher !== null && coucher < lever;

  if (aube === null || crepuscule === null) return null;

  const plages: [number, number][] = lunePleinJour
    ? [[debut.getTime(), fin.getTime()]]
    : luneCoupee
      ? [
          [debut.getTime(), coucher!.getTime()],
          [lever!.getTime(), fin.getTime()],
        ]
      : [[debutLune.getTime(), finLune.getTime()]];

  let meilleure: [number, number] | null = null;
  for (const [ouverture, fermeture] of plages) {
    const de = Math.max(ouverture, aube.getTime());
    const a = Math.min(fermeture, crepuscule.getTime());
    // Moins d'une demi-heure de recouvrement n'est pas un créneau de travail.
    if (a - de < 1_800_000) continue;
    if (!meilleure || a - de > meilleure[1] - meilleure[0]) meilleure = [de, a];
  }
  if (!meilleure) return null;

  const milieu = new Date((meilleure[0] + meilleure[1]) / 2);
  const minutes = (milieu.getTime() + decalageMinutes(milieu, timeZone) * 60_000) % 86_400_000;

  return {
    from: heureLocale(new Date(meilleure[0]), timeZone),
    to: heureLocale(new Date(meilleure[1]), timeZone),
    part: dayPartOf(minutes / 60_000),
  };
}

/** La prochaine occurrence d'une phase, à partir de midi local ce jour-là. */
function prochainePhase(
  longitude: 0 | 180,
  midi: Date,
  date: IsoDate,
  timeZone: string,
): { date: IsoDate; inDays: number } {
  // Un jour de marge en arrière : la pleine lune de ce midi-ci est encore « la
  // prochaine » tant que la journée n'est pas finie, et la chercher à partir de midi la
  // renverrait au mois suivant.
  const depart = new Date(midi.getTime() - 86_400_000);
  const trouve = SearchMoonPhase(longitude, depart, 40);
  if (!trouve) return { date, inDays: 0 };
  const jour = toIsoDate(
    new Date(trouve.date.getTime() + decalageMinutes(trouve.date, timeZone) * 60_000),
  );
  return { date: jour, inDays: Math.max(0, daysBetween(date, jour)) };
}

/**
 * La fiche complète d'une journée.
 *
 * Coûteuse par rapport à `moonDay` — une poignée de recherches d'événements — et c'est
 * assumé : elle ne se calcule que pour la journée qu'on regarde, jamais pour une année.
 */
export function moonDayDetail(date: IsoDate, options: MoonDetailOptions = {}): MoonDayDetail {
  const timeZone = options.timeZone ?? DEFAUTS.timeZone;
  const jour = moonDay(date, options);

  // Les points singuliers ne se déduisent pas d'une journée isolée : `moonDay` les laisse
  // vides, et seule la recherche à l'échelle de l'année les trouve. La fiche en a besoin —
  // ils font l'essentiel de son indice —, d'où ce détour par une table gardée.
  jour.singularities = singularitesAutour(date, timeZone);

  const midi = instantLocal(date, 12, timeZone);
  const debut = instantLocal(date, 0, timeZone);
  const fin = instantLocal(addDays(date, 1), 0, timeZone);

  // Aux deux extrémités du cycle, `phaseDetailFrom` ne regarde que la part éclairée :
  // « pleine » et « nouvelle » n'ont pas de sens de marche. Entre les deux, la phase courte
  // suffit à le donner.
  const croissante = jour.phase === 'croissante';
  const situe =
    typeof options.latitude === 'number' && typeof options.longitude === 'number'
      ? new Observer(options.latitude, options.longitude, 0)
      : null;

  const lever = situe ? evenement(Body.Moon, situe, 1, debut, fin) : null;
  const coucher = situe ? evenement(Body.Moon, situe, -1, debut, fin) : null;
  const aube = situe ? evenement(Body.Sun, situe, 1, debut, fin) : null;
  const crepuscule = situe ? evenement(Body.Sun, situe, -1, debut, fin) : null;

  const window = situe ? creneau(lever, coucher, aube, crepuscule, debut, fin, timeZone) : null;

  return {
    ...jour,
    phaseDetail: phaseDetailFrom(jour.illumination, croissante),
    element: elementOf(jour.dayType),
    moonrise: lever ? heureLocale(lever, timeZone) : null,
    moonset: coucher ? heureLocale(coucher, timeZone) : null,
    sunrise: aube ? heureLocale(aube, timeZone) : null,
    sunset: crepuscule ? heureLocale(crepuscule, timeZone) : null,
    nextFullMoon: prochainePhase(180, midi, date, timeZone),
    nextNewMoon: prochainePhase(0, midi, date, timeZone),
    // Sans position, pas de créneau : l'indice le dit plutôt que de faire comme si la lune
    // était absente. `situe === null` n'est pas « la lune ne se lève pas ».
    index: moonIndex(jour, window, situe === null ? true : window !== null),
    observer: situe ? { latitude: options.latitude!, longitude: options.longitude! } : null,
  };
}

/**
 * Les points singuliers qui tombent sur cette date.
 *
 * L'année entière est cherchée d'un coup puis **gardée** : une recherche d'apsides et de
 * nœuds coûte une centaine de millisecondes, et une fiche de jour la referait à chaque
 * appel — trente fois pour un mois parcouru jour après jour. La table tient dans quelques
 * kilo-octets et vit le temps du processus.
 *
 * Une fenêtre courte autour de la date suffirait en théorie, mais repasser par
 * `pointsSinguliers` garde **une seule** définition de ces instants : deux implémentations
 * de la même recherche finiraient par ne plus donner les mêmes jours.
 */
const CACHE_SINGULARITES = new Map<string, Map<string, MoonDay['singularities']>>();

function singularitesAutour(date: IsoDate, timeZone: string): MoonDay['singularities'] {
  const annee = Number(date.slice(0, 4));
  const cle = `${annee}|${timeZone}`;

  let table = CACHE_SINGULARITES.get(cle);
  if (!table) {
    table = new Map<string, MoonDay['singularities']>();
    for (const [jour, nature] of pointsSinguliers(annee, timeZone)) {
      const deja = table.get(jour);
      if (deja) deja.push(nature);
      else table.set(jour, [nature]);
    }
    CACHE_SINGULARITES.set(cle, table);
  }

  // Une copie : l'appelant repart avec le tableau dans sa fiche, et une fiche qui muterait
  // le cache contaminerait toutes les suivantes.
  return [...(table.get(date) ?? [])];
}
