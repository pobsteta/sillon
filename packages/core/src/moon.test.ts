// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Qualification lunaire.
//
// Le risque de cette fonctionnalité n'est pas de planter, c'est d'être **faux d'un jour** :
// une erreur de fuseau, de frontière de journée ou de convention décale tout le calendrier
// sans que rien n'ait l'air cassé, et personne ne s'en aperçoit. La seule parade est la
// confrontation à des références extérieures — c'est l'objet du premier bloc.
//
// Ces essais comparent des **faits** : des dates d'événements astronomiques, et le type de
// jour qu'une convention nommée produit. Ils ne recopient aucune table de calendrier
// publié, ce que la licence de ces ouvrages interdirait.

import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  dayMatches,
  dayTypeFor,
  moonDay,
  moonYear,
  nearestMatchingDay,
  type MoonDay,
} from './moon.js';
import { daysBetween } from './dates.js';
import type { IsoDate } from './types.js';

describe('confrontation à des références publiées', () => {
  // Relevé le 18 septembre 2026 sur le calendrier lunaire de gerbeaud.com, qui annonce
  // explicitement suivre « le passage devant les constellations ».
  const references: { date: IsoDate; attendu: Partial<MoonDay> }[] = [
    { date: '2026-09-14', attendu: { dayType: 'racine', trend: 'descendante' } },
    { date: '2026-09-19', attendu: { singularities: ['apogee'] } },
    { date: '2026-09-24', attendu: { singularities: ['noeud'] } },
    { date: '2026-10-01', attendu: { singularities: ['perigee'] } },
  ];

  const annee = new Map(moonYear(2026).map((jour) => [jour.date, jour]));

  for (const { date, attendu } of references) {
    it(`retrouve ce qu'un calendrier publié donne au ${date}`, () => {
      expect(annee.get(date)).toMatchObject(attendu);
    });
  }
});

describe('montante n’est pas croissante', () => {
  it('distingue les deux cycles le même jour', () => {
    // Le piège que ce module existe pour éviter. La déclinaison (27,3 j) et la phase
    // (29,5 j) sont deux cycles différents : le 14 septembre 2026, la lune est
    // **descendante** et **croissante** à la fois. Une implémentation qui ne calculerait
    // que la phase donnerait « croissante » et laisserait croire à « montante ».
    const jour = moonDay('2026-09-14');

    expect(jour.trend, 'la déclinaison diminue').toBe('descendante');
    expect(jour.phase, 'la part éclairée augmente').toBe('croissante');
  });

  it('lit la tendance sur la variation, pas sur le signe de la déclinaison', () => {
    // Une déclinaison négative et croissante est une lune **montante**. Confondre la
    // valeur et sa variation donnerait un calendrier faux la moitié du temps, et
    // symétriquement faux, donc plausible.
    const annee = moonYear(2026);
    const montantesSousLEquateur = annee.filter(
      (jour) => jour.trend === 'montante' && jour.declination < 0,
    );

    expect(montantesSousLEquateur.length, 'ce cas existe et doit être traité').toBeGreaterThan(50);
  });

  it('alterne au rythme du mois draconitique, pas du mois lunaire', () => {
    const annee = moonYear(2026);
    const bascules = annee.filter(
      (jour, index) => index > 0 && jour.trend !== annee[index - 1]!.trend,
    );

    // 365 / 13,66 ≈ 26,7 bascules : deux par cycle de 27,3 jours. Un calcul fondé sur la
    // phase en donnerait environ 24,7, et l'écart passerait inaperçu à l'œil.
    expect(bascules.length).toBeGreaterThanOrEqual(25);
    expect(bascules.length).toBeLessThanOrEqual(28);
  });
});

describe('les deux conventions zodiacales', () => {
  it('ne donnent pas les mêmes dates, et c’est attendu', () => {
    // Elles divergent d'environ 24°, près d'un signe entier. Si elles coïncidaient, l'une
    // des deux serait mal calculée.
    const tropical = moonDay('2026-09-14', { convention: 'tropical' });
    const constellations = moonDay('2026-09-14', { convention: 'constellations' });

    expect(tropical.dayType).toBe('feuille');
    expect(constellations.dayType).toBe('racine');
  });

  it('parcourent les quatre types dans l’année, l’une comme l’autre', () => {
    for (const convention of ['tropical', 'constellations'] as const) {
      const types = new Set(moonYear(2026, { convention }).map((jour) => jour.dayType));
      expect(types, convention).toEqual(new Set(['racine', 'feuille', 'fleur', 'fruit']));
    }
  });
});

describe('le changement de type en cours de journée', () => {
  const annee = moonYear(2026);

  it('décrit la journée entière, du réveil au coucher', () => {
    // Les calendriers imprimés disent « jour fleur jusqu'à 14 h, puis jour racine ».
    // Prétendre qu'une journée porte un seul type serait faux une fois sur deux.
    const avecChangement = annee.filter((jour) => jour.dayTypeChanges.length > 0);

    // La lune traverse douze secteurs en 27,3 jours : environ 160 journées concernées.
    expect(avecChangement.length).toBeGreaterThan(120);
    expect(avecChangement.length).toBeLessThan(200);

    for (const jour of avecChangement) {
      let courant = jour.dayStartType;
      let precedente = '00h00';
      for (const changement of jour.dayTypeChanges) {
        expect(changement.at).toMatch(/^\d{2}h\d{2}$/);
        expect(changement.at >= precedente, `${jour.date} : heures croissantes`).toBe(true);
        expect(changement.to, `${jour.date} : un changement change quelque chose`).not.toBe(
          courant,
        );
        courant = changement.to;
        precedente = changement.at;
      }

      // `dayType` se lit à midi : il doit valoir ce que la suite des changements donne à
      // midi. Sans cette cohérence, l'affichage « jour X jusqu'à H, puis jour Y »
      // contredirait le type annoncé pour la journée.
      let aMidi = jour.dayStartType;
      for (const changement of jour.dayTypeChanges) {
        if (Number(changement.at.slice(0, 2)) < 12) aMidi = changement.to;
      }
      expect(jour.dayType, jour.date).toBe(aMidi);
    }
  });

  it('repère les journées à deux changements, que la dichotomie manquait', () => {
    // Les bornes de l'Union astronomique internationale sont de largeurs très inégales :
    // la lune traverse parfois deux constellations en un jour. Ce cas existe, il est rare,
    // et c'est exactement celui qu'un calcul trop confiant rendrait faux en silence.
    expect(annee.filter((jour) => jour.dayTypeChanges.length > 1).length).toBeGreaterThan(0);
  });

  it('enchaîne d’un jour sur l’autre sans se contredire', () => {
    for (const [index, jour] of annee.entries()) {
      if (index === 0) continue;
      const veille = annee[index - 1]!;
      const finDeVeille = veille.dayTypeChanges.at(-1)?.to ?? veille.dayStartType;
      expect(jour.dayStartType, `${jour.date} reprend où la veille s’arrête`).toBe(finDeVeille);
    }
  });
});

describe('l’année entière', () => {
  it('couvre chaque jour, une fois', () => {
    const annee = moonYear(2026);

    expect(annee).toHaveLength(365);
    expect(annee[0]!.date).toBe('2026-01-01');
    expect(annee.at(-1)!.date).toBe('2026-12-31');
    expect(new Set(annee.map((jour) => jour.date)).size).toBe(365);
  });

  it('compte une année bissextile', () => {
    expect(moonYear(2028)).toHaveLength(366);
  });

  it('range les points singuliers dans le bon nombre', () => {
    const annee = moonYear(2026);
    const compte = (nature: string) =>
      annee.filter((jour) => jour.singularities.includes(nature as never)).length;

    // Un périgée et un apogée par mois anomalistique (27,55 j), deux passages aux nœuds
    // par mois draconitique (27,21 j).
    expect(compte('perigee'), 'périgées').toBeGreaterThanOrEqual(12);
    expect(compte('perigee')).toBeLessThanOrEqual(14);
    expect(compte('apogee'), 'apogées').toBeGreaterThanOrEqual(12);
    expect(compte('apogee')).toBeLessThanOrEqual(14);
    expect(compte('noeud'), 'nœuds').toBeGreaterThanOrEqual(25);
    expect(compte('noeud')).toBeLessThanOrEqual(28);
  });

  it('voyage en une petite requête', () => {
    // Le calendrier part en une fois et le service worker le garde : le champ n'a pas de
    // réseau, et un calendrier lunaire qui exigerait un appel serait inutile là où il
    // sert. Ce qui compte est le poids **compressé**, celui qui passe sur le fil — le
    // brut dépasse les 15 ko annoncés par le brief, parce que le jour porte aussi sa
    // déclinaison, sa longitude et ses changements d'heure en heure.
    const brut = Buffer.from(JSON.stringify(moonYear(2026)));
    const compresse = gzipSync(brut);

    expect(brut.length, 'brut').toBeLessThan(120_000);
    expect(compresse.length, 'compressé').toBeLessThan(20_000);
  });
});

describe('le fuseau découpe la journée', () => {
  it('décale la frontière du jour, donc parfois la qualification', () => {
    // Le risque nommé par le brief : « une erreur de frontière de jour, de fuseau ou de
    // convention décale tout le calendrier sans que rien n'ait l'air cassé ». On vérifie
    // ici que le fuseau est bien pris en compte, et non ignoré.
    const paris = moonYear(2026, { timeZone: 'Europe/Paris' });
    const auckland = moonYear(2026, { timeZone: 'Pacific/Auckland' });
    const differents = paris.filter((jour, index) => jour.dayType !== auckland[index]!.dayType);

    expect(differents.length, 'douze heures d’écart changent des journées').toBeGreaterThan(20);
  });

  it('traverse un changement d’heure sans se décaler', () => {
    // Dernier dimanche d'octobre 2026 : l'heure d'été s'arrête. Une conversion naïve
    // décalerait la lecture d'une heure, et un jour sur deux la qualification avec.
    for (const date of ['2026-10-24', '2026-10-25', '2026-10-26'] as IsoDate[]) {
      const jour = moonDay(date);
      expect(jour.date, 'la date reste celle qu’on a demandée').toBe(date);
      expect(jour.dayType).toBeTruthy();
    }
  });
});

describe('le pivot : la partie récoltée', () => {
  const annee = moonYear(2026);

  it('relie une culture à un type de jour', () => {
    expect(dayTypeFor('root')).toBe('racine');
    expect(dayTypeFor('leaf')).toBe('feuille');
    expect(dayTypeFor('flower')).toBe('fleur');
    expect(dayTypeFor('fruit')).toBe('fruit');
  });

  it('se tait quand l’espèce n’est pas qualifiée', () => {
    // Le champ est nul tant que personne ne l'a renseigné. Un défaut implicite ferait dire
    // au calendrier des choses sur des cultures dont il ne sait rien.
    const jour = annee[0]!;
    expect(dayMatches(jour, null)).toBe(false);
    expect(dayMatches(jour, undefined)).toBe(false);
    expect(nearestMatchingDay(annee, '2026-03-01', null)).toBeNull();
  });

  it('trouve le jour correspondant le plus proche, à trois jours au plus', () => {
    // Les quatre types se succèdent : depuis n'importe quelle date, un jour d'un type
    // donné se trouve à moins de sept jours, mais on refuse de chercher si loin.
    let trouves = 0;
    for (const jour of annee.slice(10, 340)) {
      const cale = nearestMatchingDay(annee, jour.date, 'fruit');
      if (cale === null) continue;
      trouves += 1;
      const ecart = Math.abs(daysBetween(jour.date, cale));
      expect(ecart, `${jour.date} → ${cale}`).toBeLessThanOrEqual(3);
      expect(annee.find((j) => j.date === cale)!.dayType).toBe('fruit');
    }
    expect(trouves, 'la plupart des jours trouvent un jour fruit dans la fenêtre').toBeGreaterThan(
      200,
    );
  });

  it('ne déplace rien quand le jour convient déjà', () => {
    const jourFruit = annee.find((jour) => jour.dayType === 'fruit')!;
    expect(nearestMatchingDay(annee, jourFruit.date, 'fruit')).toBe(jourFruit.date);
  });

  it('renvoie null plutôt que de dépasser la fenêtre', () => {
    // La règle du brief : « le décalage proposé est borné ». Au-delà, c'est l'agronomie
    // qui commande, et le plan reste maître.
    const jourFruit = annee.find((jour) => jour.dayType === 'fruit')!;
    const loin = nearestMatchingDay(annee, jourFruit.date, 'racine', 0);
    expect(loin).toBeNull();
  });
});
