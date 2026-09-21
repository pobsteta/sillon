// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Qualification lunaire du temps (lot 1 de `brief/jardinage-lunaire.md`).
//
// Ce module **calcule** une position de la lune et en tire une qualification du jour. Il ne
// recopie aucune table publiée : les calendriers de Maria Thun, de Rustica et consorts sont
// des œuvres protégées. Il n'affirme rien non plus — « jour fruit », « lune descendante »
// décrivent un état du ciel, ce sont des faits ; « favorable » ou « meilleur moment » sont
// des affirmations, et n'ont pas leur place ici.
//
// **Le piège que ce module existe pour éviter** : montante ≠ croissante. Ce sont deux cycles
// différents — la déclinaison (27,3 j) et la phase (29,5 j) — et l'essentiel des conseils de
// jardinage lunaire repose sur le premier. Une implémentation qui ne calculerait que la
// phase aurait l'air de marcher tout en manquant l'essentiel.

import {
  Body,
  Constellation,
  EclipticGeoMoon,
  EquatorFromVector,
  GeoVector,
  Illumination,
  MakeTime,
  MoonPhase,
  NextLunarApsis,
  NextMoonNode,
  RotateVector,
  Rotation_EQJ_EQD,
  SearchLunarApsis,
  SearchMoonNode,
} from 'astronomy-engine';
import { addDays, parseIsoDate, toIsoDate } from './dates.js';
import type { IsoDate } from './types.js';

/** La lune monte ou descend dans le ciel : la **déclinaison**, cycle de 27,3 jours. */
export type MoonTrend = 'montante' | 'descendante';

/** La part éclairée vue de la Terre : la **phase**, cycle de 29,5 jours. */
export type MoonPhaseName = 'nouvelle' | 'croissante' | 'pleine' | 'decroissante';

/** Le type de jour, tiré de la position de la lune sur l'écliptique. */
export type MoonDayType = 'racine' | 'feuille' | 'fleur' | 'fruit';

/**
 * Deux conventions coexistent et **ne donnent pas les mêmes dates** — elles divergent
 * aujourd'hui d'environ 24°, près d'un signe entier :
 *
 * - `tropical` : douze secteurs égaux de 30° depuis le point vernal, convention de la
 *   plupart des calendriers de presse ;
 * - `constellations` : les constellations réelles aux bornes de l'Union astronomique
 *   internationale, convention du calendrier biodynamique.
 *
 * Il faut choisir et le dire, sans quoi les dates ne correspondent à aucun calendrier connu
 * et personne ne sait pourquoi.
 */
export type ZodiacConvention = 'tropical' | 'constellations';

/** Journées dites défavorables par la tradition : on se contente de les signaler. */
export type MoonSingularity = 'perigee' | 'apogee' | 'noeud';

export interface MoonDay {
  date: IsoDate;
  /** Déclinaison géocentrique à l'heure de référence, en **dixièmes de degré**. */
  declination: number;
  trend: MoonTrend;
  /** Part éclairée, en **millièmes** (0 à 1000). */
  illumination: number;
  phase: MoonPhaseName;
  /** Longitude écliptique à l'heure de référence, en **dixièmes de degré**. */
  eclipticLongitude: number;
  dayType: MoonDayType;
  /** Type porté à minuit, heure locale. Avec `dayTypeChanges`, il décrit la journée entière. */
  dayStartType: MoonDayType;
  /**
   * Changements de type en cours de journée, heure locale. Les calendriers imprimés les
   * donnent — « jour fleur jusqu'à 14 h, puis jour racine » — et les omettre reviendrait à
   * affirmer qu'une journée porte un seul type, ce qui est faux une fois sur deux.
   *
   * Une **liste**, et non un changement unique : la lune traverse parfois deux
   * constellations dans la même journée, les bornes de l'UAI étant de largeurs très
   * inégales. Une dichotomie qui supposerait un passage unique tomberait juste presque
   * toujours, et faux sans rien dire le reste du temps.
   */
  dayTypeChanges: { at: string; to: MoonDayType }[];
  singularities: MoonSingularity[];
}

export interface MoonOptions {
  convention?: ZodiacConvention;
  /**
   * Fuseau où la journée civile est découpée. La qualification est lue à midi local : une
   * heure de référence au milieu du jour évite qu'une frontière de fuseau ne décale tout le
   * calendrier d'un jour — le risque principal de cette fonctionnalité.
   */
  timeZone?: string;
}

/**
 * Défaut : **les constellations réelles**. Ce n'est pas un goût mais une confrontation —
 * le calendrier de gerbeaud.com, l'un des plus consultés en France, annonce explicitement
 * « le passage devant les constellations », et c'est aussi la convention du calendrier
 * biodynamique. Les dates de Sillon coïncident donc avec celles que les gens ont sur leur
 * mur. La convention tropicale reste disponible, et donne d'autres dates : voir
 * `moon.test.ts`, où les deux divergent d'un type entier le même jour.
 */
export const DEFAUTS = {
  convention: 'constellations' as ZodiacConvention,
  timeZone: 'Europe/Paris',
};

/**
 * Élément des douze signes, dans l'ordre à partir du Bélier, puis le type de jour qui s'y
 * rattache : feu → fruit, terre → racine, air → fleur, eau → feuille.
 */
const TYPE_PAR_SIGNE: MoonDayType[] = [
  'fruit', // Bélier — feu
  'racine', // Taureau — terre
  'fleur', // Gémeaux — air
  'feuille', // Cancer — eau
  'fruit', // Lion — feu
  'racine', // Vierge — terre
  'fleur', // Balance — air
  'feuille', // Scorpion — eau
  'fruit', // Sagittaire — feu
  'racine', // Capricorne — terre
  'fleur', // Verseau — air
  'feuille', // Poissons — eau
];

/**
 * Constellations réelles de l'écliptique, aux bornes de l'UAI.
 *
 * **Ophiuchus est rabattu sur le Scorpion.** L'UAI compte treize constellations sur
 * l'écliptique ; le zodiaque sidéral de Maria Thun n'en connaît que douze et ne nomme pas
 * le Serpentaire. Le rabattre sur son voisin est une approximation — elle est ici pour
 * qu'on la voie, pas pour qu'on l'ignore.
 */
const TYPE_PAR_CONSTELLATION: Record<string, MoonDayType> = {
  Ari: 'fruit',
  Tau: 'racine',
  Gem: 'fleur',
  Cnc: 'feuille',
  Leo: 'fruit',
  Vir: 'racine',
  Lib: 'fleur',
  Sco: 'feuille',
  Oph: 'feuille',
  Sgr: 'fruit',
  Cap: 'racine',
  Aqr: 'fleur',
  Psc: 'feuille',
};

/**
 * Décalage du fuseau à cet instant, en minutes.
 *
 * Exporté pour `moon-detail.ts` : la fiche du jour range des instants dans la journée
 * civile locale, et refaire ce calcul ailleurs est le plus sûr moyen d'obtenir deux
 * frontières de journée qui divergent d'une heure deux fois l'an.
 */
export function decalageMinutes(instant: Date, timeZone: string): number {
  // `Intl` donne l'heure locale ; la différence avec l'heure UTC lue au même instant donne
  // le décalage, changements d'heure compris.
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? '0');
  const heure = valeur('hour') % 24;
  const local = Date.UTC(
    valeur('year'),
    valeur('month') - 1,
    valeur('day'),
    heure,
    valeur('minute'),
    valeur('second'),
  );
  return Math.round((local - instant.getTime()) / 60_000);
}

/**
 * Instant correspondant à `heure` locale (fraction d'heure acceptée) le jour `date`.
 * Exporté pour `moon-detail.ts`, qui borne la journée exactement de la même façon.
 */
export function instantLocal(date: IsoDate, heure: number, timeZone: string): Date {
  const approximatif = new Date(parseIsoDate(date).getTime() + heure * 3_600_000);
  // Deux passes : le décalage se lit à un instant, et l'instant dépend du décalage. La
  // seconde passe suffit, sauf à viser l'heure même d'un changement d'heure.
  const premier = decalageMinutes(approximatif, timeZone);
  const corrige = new Date(approximatif.getTime() - premier * 60_000);
  const second = decalageMinutes(corrige, timeZone);
  return new Date(approximatif.getTime() - second * 60_000);
}

/** Déclinaison géocentrique de la lune, équateur de la date, en degrés. */
function declinaison(instant: Date): number {
  const eqj = GeoVector(Body.Moon, instant, true);
  const eqd = RotateVector(Rotation_EQJ_EQD(instant), eqj);
  return EquatorFromVector(eqd).dec;
}

/** Longitude écliptique géocentrique vraie, en degrés (0 à 360). */
function longitudeEcliptique(instant: Date): number {
  const lon = EclipticGeoMoon(instant).lon % 360;
  return lon < 0 ? lon + 360 : lon;
}

/** Type de jour à un instant donné, selon la convention retenue. */
export function typeDeJour(instant: Date, convention: ZodiacConvention): MoonDayType {
  if (convention === 'tropical') {
    return TYPE_PAR_SIGNE[Math.floor(longitudeEcliptique(instant) / 30) % 12]!;
  }
  // Les bornes de l'UAI sont définies en coordonnées équatoriales J2000 : on interroge la
  // position de la lune dans ce repère, et non en écliptique.
  const { ra, dec } = EquatorFromVector(GeoVector(Body.Moon, instant, true));
  const symbole = Constellation(ra, dec).symbol;
  // La lune sort parfois de la bande zodiacale des constellations tabulées ; on retombe
  // alors sur le secteur tropical plutôt que d'inventer un type.
  return (
    TYPE_PAR_CONSTELLATION[symbole] ??
    TYPE_PAR_SIGNE[Math.floor(longitudeEcliptique(instant) / 30) % 12]!
  );
}

function nommerPhase(fraction: number, angle: number): MoonPhaseName {
  if (fraction < 0.02) return 'nouvelle';
  if (fraction > 0.98) return 'pleine';
  // `MoonPhase` croît de 0° (nouvelle lune) à 360° : la lune croît jusqu'à 180°.
  return angle < 180 ? 'croissante' : 'decroissante';
}

/** Heure locale `HHhMM` d'un instant. Exporté pour `moon-detail.ts`. */
export function heureLocale(instant: Date, timeZone: string): string {
  const texte = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
  return texte.replace(':', 'h').replace(/^24/, '00');
}

/**
 * Tous les changements de type de la journée, à la minute.
 *
 * Balayage horaire puis affinage par dichotomie sur chaque transition repérée. Le balayage
 * n'est pas une précaution de style : la lune peut traverser deux constellations le même
 * jour, et une dichotomie posée d'emblée sur la journée entière en manquerait une — sans
 * erreur, avec un résultat plausible.
 */
function changementsDuJour(
  debut: Date,
  fin: Date,
  convention: ZodiacConvention,
  timeZone: string,
): { at: string; to: MoonDayType }[] {
  const pas = 3_600_000;
  const changements: { at: string; to: MoonDayType }[] = [];

  let precedentInstant = debut.getTime();
  let precedentType = typeDeJour(debut, convention);

  for (let t = debut.getTime() + pas; t <= fin.getTime(); t += pas) {
    const instant = Math.min(t, fin.getTime());
    const type = typeDeJour(new Date(instant), convention);
    if (type === precedentType) {
      precedentInstant = instant;
      precedentType = type;
      continue;
    }

    // Transition dans cette heure : on la resserre à la minute.
    let bas = precedentInstant;
    let haut = instant;
    while (haut - bas > 60_000) {
      const milieu = (bas + haut) / 2;
      if (typeDeJour(new Date(milieu), convention) === precedentType) bas = milieu;
      else haut = milieu;
    }
    changements.push({ at: heureLocale(new Date(haut), timeZone), to: type });

    precedentInstant = instant;
    precedentType = type;
  }

  return changements;
}

/** Qualification d'une journée civile. */
export function moonDay(date: IsoDate, options: MoonOptions = {}): MoonDay {
  const convention = options.convention ?? DEFAUTS.convention;
  const timeZone = options.timeZone ?? DEFAUTS.timeZone;

  const midi = instantLocal(date, 12, timeZone);
  const debut = instantLocal(date, 0, timeZone);
  const fin = instantLocal(addDays(date, 1), 0, timeZone);

  const dec = declinaison(midi);
  // La tendance se lit sur la variation, pas sur la valeur : une déclinaison négative et
  // croissante est une lune **montante**. Confondre les deux est l'erreur classique.
  const avant = declinaison(new Date(midi.getTime() - 12 * 3_600_000));
  const apres = declinaison(new Date(midi.getTime() + 12 * 3_600_000));

  const eclairee = Illumination(Body.Moon, midi).phase_fraction;
  const angle = MoonPhase(midi);

  return {
    date,
    declination: Math.round(dec * 10),
    trend: apres - avant >= 0 ? 'montante' : 'descendante',
    illumination: Math.round(eclairee * 1000),
    phase: nommerPhase(eclairee, angle),
    eclipticLongitude: Math.round(longitudeEcliptique(midi) * 10),
    dayType: typeDeJour(midi, convention),
    dayStartType: typeDeJour(debut, convention),
    dayTypeChanges: changementsDuJour(debut, fin, convention, timeZone),
    singularities: [],
  };
}

/**
 * Une année entière, d'un coup. C'est la forme que le brief retient : 365 lignes que le
 * serveur calcule, que l'interface demande une fois et que le service worker garde — le
 * champ n'a pas de réseau, et un calendrier lunaire qui exigerait un appel serait inutile
 * là où il sert.
 */
export function moonYear(year: number, options: MoonOptions = {}): MoonDay[] {
  const timeZone = options.timeZone ?? DEFAUTS.timeZone;
  const debut = `${year}-01-01` as IsoDate;
  const jours: MoonDay[] = [];

  for (let date = debut; date.startsWith(String(year)); date = addDays(date, 1)) {
    jours.push(moonDay(date, options));
  }

  const parDate = new Map(jours.map((jour) => [jour.date, jour]));
  for (const [dateSinguliere, nature] of pointsSinguliers(year, timeZone)) {
    parDate.get(dateSinguliere)?.singularities.push(nature);
  }
  return jours;
}

/**
 * Périgées, apogées et passages aux nœuds de l'année. Ils ne se déduisent pas d'une journée
 * isolée : ce sont des instants qu'on cherche, puis qu'on range dans le jour local qui les
 * contient.
 *
 * Exporté pour `moon-detail.ts` : la fiche d'un jour en a besoin sans vouloir de l'année
 * entière, et en tenir une seconde définition serait en tenir deux qui divergent.
 */
export function pointsSinguliers(year: number, timeZone: string): [IsoDate, MoonSingularity][] {
  const debut = new Date(Date.UTC(year, 0, 1));
  const finUtc = Date.UTC(year + 1, 0, 1);
  const trouves: [IsoDate, MoonSingularity][] = [];

  /** Le jour civil local qui contient cet instant. */
  const jourLocal = (instant: Date): IsoDate =>
    toIsoDate(new Date(instant.getTime() + decalageMinutes(instant, timeZone) * 60_000));

  let apside = SearchLunarApsis(MakeTime(debut));
  while (apside.time.date.getTime() < finUtc) {
    trouves.push([jourLocal(apside.time.date), apside.kind === 0 ? 'perigee' : 'apogee']);
    apside = NextLunarApsis(apside);
  }

  let noeud = SearchMoonNode(MakeTime(debut));
  while (noeud.time.date.getTime() < finUtc) {
    trouves.push([jourLocal(noeud.time.date), 'noeud']);
    noeud = NextMoonNode(noeud);
  }

  return trouves;
}

/** Ce qu'on récolte d'une culture, tel que le porte le plan de culture. */
export type HarvestedPart = 'root' | 'leaf' | 'flower' | 'fruit';

const TYPE_ATTENDU: Record<HarvestedPart, MoonDayType> = {
  root: 'racine',
  leaf: 'feuille',
  flower: 'fleur',
  fruit: 'fruit',
};

/** Le type de jour que la tradition associe à cette partie récoltée. */
export function dayTypeFor(part: HarvestedPart): MoonDayType {
  return TYPE_ATTENDU[part];
}

/**
 * Le jour correspond-il à ce qu'on récolte ? Une question de correspondance, pas de
 * qualité : ce n'est ni « favorable » ni « idéal », c'est « ce jour est un jour racine et
 * cette culture est une racine ».
 */
export function dayMatches(day: MoonDay, part: HarvestedPart | null | undefined): boolean {
  return part != null && day.dayType === TYPE_ATTENDU[part];
}

/**
 * Le jour correspondant le plus proche, à `maxShift` jours au plus.
 *
 * **La borne n'est pas un détail d'implémentation.** Au-delà de trois jours c'est
 * l'agronomie qui commande : une série de printemps ne se décale pas d'une semaine pour
 * attendre un jour fruit. Renvoie `null` quand aucun jour ne convient dans la fenêtre —
 * et le plan reste alors tel qu'il est, en silence.
 */
export function nearestMatchingDay(
  days: MoonDay[],
  from: IsoDate,
  part: HarvestedPart | null | undefined,
  maxShift = 3,
): IsoDate | null {
  if (part == null) return null;
  const parDate = new Map(days.map((jour) => [jour.date, jour]));
  const depart = parDate.get(from);
  if (depart && dayMatches(depart, part)) return from;

  // On cherche en alternant avant et après, à distance croissante : à égalité de
  // distance, avancer plutôt que retarder ne se justifierait par rien.
  for (let ecart = 1; ecart <= maxShift; ecart += 1) {
    for (const candidat of [addDays(from, -ecart), addDays(from, ecart)]) {
      const jour = parDate.get(candidat);
      if (jour && dayMatches(jour, part)) return candidat;
    }
  }
  return null;
}
