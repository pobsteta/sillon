// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fiche d'une journée lunaire.
//
// Deux risques, et ce fichier n'existe que pour eux. Le premier est celui de `moon.ts` :
// être **faux d'une heure ou d'un jour** sans que rien n'ait l'air cassé — d'où la
// confrontation à des levers et couchers publiés, et les essais de fuseau. Le second est
// propre à cette fiche : l'indice chiffré. Un nombre affiché gros au milieu d'un écran
// passe pour une mesure, et il faut donc qu'il soit **reproductible et explicable**, sans
// quoi il n'est qu'un argument d'autorité.

import { describe, expect, it } from 'vitest';
import { dayPartOf, elementOf, moonDayDetail, moonIndex, phaseDetailFrom } from './moon-detail.js';
import { moonDay } from './moon.js';
import type { IsoDate } from './types.js';

/** Dijon, où se trouve la ferme d'exemple. */
const DIJON = { latitude: 47.322, longitude: 5.041 };

describe('le soleil, confronté à ce qu’on peut vérifier sans source', () => {
  /** Une heure `HHhMM` en minutes depuis minuit. */
  const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3));
  const duree = (date: IsoDate, lieu = DIJON) => {
    const fiche = moonDayDetail(date, lieu);
    return minutes(fiche.sunset!) - minutes(fiche.sunrise!);
  };

  // Aucune table n'est recopiée ici, et aucune source n'est invoquée qui ne pourrait être
  // rouverte : ces essais vérifient des **propriétés** du mouvement apparent du soleil.
  // C'est plus faible qu'une confrontation à des éphémérides publiées — qui reste à
  // faire, sur relevé réel — mais cela attrape déjà les pannes qui comptent : un signe de
  // longitude inversé, un fuseau ignoré, une latitude perdue en route.

  it('donne douze heures de jour à l’équinoxe, partout', () => {
    // Douze heures **à la réfraction près**. Le soleil se voit encore quand il est
    // géométriquement sous l'horizon, ce qui allonge la journée ; et d'autant plus qu'on
    // monte en latitude, parce qu'il traverse l'horizon plus obliquement — huit minutes à
    // Dijon, treize à 60°. La tolérance décrit ce fait, elle n'excuse pas une imprécision.
    for (const lieu of [DIJON, { latitude: 60, longitude: 10 }, { latitude: -33, longitude: 18 }]) {
      const mars = duree('2026-03-20', lieu);
      expect(mars - 12 * 60, `${lieu.latitude}°`).toBeGreaterThan(0);
      expect(mars - 12 * 60, `${lieu.latitude}°`).toBeLessThanOrEqual(20);
    }
  });

  it('allonge la journée au solstice d’été et la raccourcit au solstice d’hiver', () => {
    expect(duree('2026-06-21')).toBeGreaterThan(duree('2026-03-20'));
    expect(duree('2026-12-21')).toBeLessThan(duree('2026-03-20'));
    // À 47° de latitude, le jour le plus long approche seize heures et le plus court en
    // fait un peu plus de huit. Des bornes larges, mais qu'une erreur de latitude franchit.
    expect(duree('2026-06-21')).toBeGreaterThan(15 * 60);
    expect(duree('2026-12-21')).toBeLessThan(9 * 60);
  });

  it('inverse les saisons dans l’hémisphère sud', () => {
    // La latitude n'est pas décorative : si elle se perdait en route, les deux hémisphères
    // auraient les mêmes journées et rien ne le signalerait.
    const sud = { latitude: -33.87, longitude: 151.21 };
    expect(duree('2026-06-21', sud)).toBeLessThan(duree('2026-12-21', sud));
  });

  it('place le midi solaire au bon endroit pour la longitude de Dijon', () => {
    // Dijon est à 5,04° est : le soleil y culmine vingt minutes avant le méridien de
    // Greenwich, soit 13 h 40 à l'heure d'été légale, à l'équation du temps près (±16 min).
    // Une longitude de signe inverse déplacerait ce midi de quarante minutes.
    const fiche = moonDayDetail('2026-06-21', DIJON);
    const midiSolaire = (minutes(fiche.sunrise!) + minutes(fiche.sunset!)) / 2;

    expect(Math.abs(midiSolaire - (13 * 60 + 40))).toBeLessThanOrEqual(16);
  });
});

describe('le lieu commande, et son absence se dit', () => {
  it('rend les heures nulles quand la ferme n’a pas de position', () => {
    // Pas d'inventer un observateur par défaut : une ferme sans coordonnées verrait des
    // heures de lever plausibles et fausses, ce qui est pire que pas d'heure du tout.
    const fiche = moonDayDetail('2026-09-20', {});

    expect(fiche.observer).toBeNull();
    expect(fiche.sunrise).toBeNull();
    expect(fiche.moonrise).toBeNull();
    expect(fiche.index.window).toBeNull();
  });

  it('ne pénalise pas l’indice d’une ferme sans position', () => {
    // Sans lieu, on ne sait pas si la lune est levée : l'ignorer est honnête, en déduire
    // « lune absente » ne l'est pas.
    const sansLieu = moonDayDetail('2026-09-20', {});
    expect(sansLieu.index.reasons.map((r) => r.code)).not.toContain('lune-absente-du-jour');
  });

  it('donne des heures différentes à Dijon et à Brest', () => {
    // Quatre degrés de longitude font seize minutes de soleil. Une position ignorée
    // donnerait deux fois la même heure, et personne ne s'en apercevrait.
    const dijon = moonDayDetail('2026-09-20', DIJON);
    const brest = moonDayDetail('2026-09-20', { latitude: 48.39, longitude: -4.486 });

    expect(dijon.sunrise).not.toBe(brest.sunrise);
  });

  it('accepte une journée où la lune ne se lève pas', () => {
    // La lune saute un lever environ un jour sur trente : le décalage quotidien de son
    // lever finit par franchir minuit. `null` est la bonne réponse, pas une panne.
    const annee = Array.from({ length: 40 }, (_, index) => {
      const jour = new Date(Date.UTC(2026, 8, 1 + index));
      return jour.toISOString().slice(0, 10) as IsoDate;
    });
    const sansLever = annee.filter((date) => moonDayDetail(date, DIJON).moonrise === null);

    expect(sansLever.length, 'ce cas existe et doit être traité').toBeGreaterThan(0);
  });
});

describe('la phase à huit noms', () => {
  it('nomme la part éclairée et le sens du cycle', () => {
    expect(phaseDetailFrom(5, true)).toBe('nouvelle');
    expect(phaseDetailFrom(200, true)).toBe('premier-croissant');
    expect(phaseDetailFrom(500, true)).toBe('premier-quartier');
    expect(phaseDetailFrom(800, true)).toBe('gibbeuse-croissante');
    expect(phaseDetailFrom(995, true)).toBe('pleine');
    expect(phaseDetailFrom(800, false)).toBe('gibbeuse-decroissante');
    expect(phaseDetailFrom(500, false)).toBe('dernier-quartier');
    expect(phaseDetailFrom(200, false)).toBe('dernier-croissant');
  });

  it('ne donne pas de sens de marche à la pleine ni à la nouvelle lune', () => {
    // « Pleine croissante » n'existe pas : aux deux extrémités du cycle, seule la part
    // éclairée compte, et la distinction n'aurait aucun sens à l'œil.
    expect(phaseDetailFrom(1000, true)).toBe(phaseDetailFrom(1000, false));
    expect(phaseDetailFrom(0, true)).toBe(phaseDetailFrom(0, false));
  });

  it('s’accorde avec la phase courte de l’année', () => {
    // Les deux formes coexistent — l'année porte la courte, la fiche la longue — et
    // doivent décrire la même lune. Une divergence donnerait « pleine » dans la grille et
    // « premier croissant » dans la fiche du même jour.
    for (let index = 0; index < 30; index += 1) {
      const date =
        `2026-${String(Math.floor(index / 28) + 3).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}` as IsoDate;
      const fiche = moonDayDetail(date, DIJON);
      if (fiche.phase === 'pleine') expect(fiche.phaseDetail).toBe('pleine');
      if (fiche.phase === 'nouvelle') expect(fiche.phaseDetail).toBe('nouvelle');
      // La phase courte dit le sens de marche ; la longue doit le dire aussi, sous l'un
      // ou l'autre de ses noms de ce côté-ci du cycle.
      if (fiche.phase === 'croissante') {
        expect(fiche.phaseDetail, fiche.date).toMatch(/^(premier-|gibbeuse-croissante)/);
      }
      if (fiche.phase === 'decroissante') {
        expect(fiche.phaseDetail, fiche.date).toMatch(/^(dernier-|gibbeuse-decroissante)/);
      }
    }
  });
});

describe('la prochaine pleine lune', () => {
  it('ne dépasse jamais une lunaison', () => {
    // 29,5 jours : un écart plus grand signalerait une recherche partie du mauvais
    // instant, et « pleine lune dans 37 jours » est le genre de phrase qu'on ne relit pas.
    for (let mois = 1; mois <= 12; mois += 1) {
      const date = `2026-${String(mois).padStart(2, '0')}-05` as IsoDate;
      const fiche = moonDayDetail(date, DIJON);
      expect(fiche.nextFullMoon.inDays, date).toBeLessThanOrEqual(30);
      expect(fiche.nextNewMoon.inDays, date).toBeLessThanOrEqual(30);
    }
  });

  it('dit « dans 0 jour » le jour même', () => {
    // Le piège : chercher à partir de midi renvoie la pleine lune du mois suivant quand
    // elle a lieu le matin même. La fiche annoncerait alors « dans 29 j » un jour de
    // pleine lune, ce qui est faux et visible de tous.
    const pleine = moonDayDetail('2026-09-20', DIJON).nextFullMoon.date;
    expect(moonDayDetail(pleine, DIJON).nextFullMoon.inDays).toBe(0);
  });
});

describe('l’élément du jour', () => {
  it('suit le type de jour, sans autre source', () => {
    expect(elementOf('fruit')).toBe('feu');
    expect(elementOf('racine')).toBe('terre');
    expect(elementOf('fleur')).toBe('air');
    expect(elementOf('feuille')).toBe('eau');
  });
});

describe('l’indice du jour', () => {
  const jourOrdinaire = { ...moonDay('2026-09-20'), singularities: [], dayTypeChanges: [] };

  it('vaut cent quand la journée ne porte rien de singulier', () => {
    const indice = moonIndex(jourOrdinaire, null, true);
    expect(indice.score).toBe(100);
    expect(indice.label).toBe('exceptionnel');
    expect(indice.reasons).toEqual([]);
  });

  it('retranche, et dit ce qu’il retranche', () => {
    // C'est la garantie qui remplace la règle 5 du brief : le chiffre s'ouvre. Un indice
    // qui baisserait sans dire pourquoi serait un argument d'autorité.
    const indice = moonIndex({ ...jourOrdinaire, singularities: ['noeud'] }, null, true);

    expect(indice.score).toBe(55);
    expect(indice.reasons).toEqual([{ code: 'noeud', delta: -45 }]);
    // Le compte rendu doit expliquer l'écart en entier, sans reste invisible.
    expect(100 + indice.reasons.reduce((total, r) => total + r.delta, 0)).toBe(indice.score);
  });

  it('cumule les pénalités sans jamais passer sous zéro', () => {
    const indice = moonIndex(
      {
        ...jourOrdinaire,
        singularities: ['noeud', 'perigee'],
        dayTypeChanges: [{ at: '14h08', to: 'racine' }],
      },
      null,
      false,
    );

    expect(indice.score).toBe(20);
    expect(indice.label).toBe('a-eviter');
    expect(indice.score).toBeGreaterThanOrEqual(0);
  });

  it('ne compte qu’une fois une journée partagée, quel que soit le nombre de passages', () => {
    const un = moonIndex(
      { ...jourOrdinaire, dayTypeChanges: [{ at: '08h00', to: 'racine' }] },
      null,
      true,
    );
    const deux = moonIndex(
      {
        ...jourOrdinaire,
        dayTypeChanges: [
          { at: '08h00', to: 'racine' },
          { at: '20h00', to: 'fleur' },
        ],
      },
      null,
      true,
    );

    expect(deux.score).toBe(un.score);
  });

  it('reste reproductible d’un appel à l’autre', () => {
    // Un indice qui changerait entre deux affichages du même jour ruinerait la confiance
    // plus sûrement qu'un indice discutable.
    const premier = moonDayDetail('2026-09-19', DIJON).index;
    const second = moonDayDetail('2026-09-19', DIJON).index;
    expect(premier).toEqual(second);
  });

  it('retrouve les points singuliers, que `moonDay` seul laisse vides', () => {
    // Le 19 septembre 2026 est un jour d'apogée d'après `moon.test.ts`. La fiche doit le
    // voir : sans cela son indice vaudrait cent tous les jours de l'année, et ne dirait
    // plus rien.
    const fiche = moonDayDetail('2026-09-19', DIJON);
    expect(fiche.singularities).toContain('apogee');
    expect(fiche.index.reasons.map((r) => r.code)).toContain('apogee');
  });
});

describe('le créneau', () => {
  it('tient dans le jour, et se lit dans le bon ordre', () => {
    for (let index = 0; index < 28; index += 1) {
      const date = `2026-04-${String(index + 1).padStart(2, '0')}` as IsoDate;
      const { index: indice, sunrise, sunset } = moonDayDetail(date, DIJON);
      if (!indice.window) continue;

      expect(indice.window.from.localeCompare(indice.window.to), date).toBeLessThan(0);
      // Le créneau est l'intersection du jour et de la présence de la lune : il ne peut
      // pas commencer avant l'aube ni finir après le crépuscule.
      expect(indice.window.from >= sunrise!, `${date} ${indice.window.from} / ${sunrise}`).toBe(
        true,
      );
      expect(indice.window.to <= sunset!, `${date} ${indice.window.to} / ${sunset}`).toBe(true);
    }
  });

  it('nomme le moment de la journée d’après son milieu', () => {
    expect(dayPartOf(8 * 60)).toBe('matin');
    expect(dayPartOf(12 * 60)).toBe('milieu-de-journee');
    expect(dayPartOf(15 * 60)).toBe('apres-midi');
    expect(dayPartOf(18 * 60)).toBe('fin-d-apres-midi');
    expect(dayPartOf(21 * 60)).toBe('soiree');
  });

  it('retient la plus longue plage quand la lune se couche puis se relève', () => {
    // Une lune couchée le matin et relevée le soir est présente aux deux bouts de la
    // journée. Retenir « du coucher au lever » donnerait un créneau à l'envers, couvrant
    // précisément les heures où elle est absente.
    const jours = Array.from(
      { length: 60 },
      (_, index) =>
        `2026-${String(Math.floor(index / 30) + 5).padStart(2, '0')}-${String((index % 30) + 1).padStart(2, '0')}` as IsoDate,
    );
    const coupees = jours
      .map((date) => moonDayDetail(date, DIJON))
      .filter((fiche) => fiche.moonrise && fiche.moonset && fiche.moonset < fiche.moonrise);

    expect(coupees.length, 'ce cas existe et doit être traité').toBeGreaterThan(0);
    for (const fiche of coupees) {
      if (fiche.index.window) {
        expect(fiche.index.window.from < fiche.index.window.to, fiche.date).toBe(true);
      }
    }
  });
});

describe('le fuseau découpe aussi la fiche', () => {
  it('déplace les heures avec le fuseau, sans changer l’instant', () => {
    // Le risque nommé par le brief §10 : une heure juste, affichée dans le mauvais
    // fuseau, et tout le calendrier glisse sans avoir l'air cassé.
    const paris = moonDayDetail('2026-09-20', { ...DIJON, timeZone: 'Europe/Paris' });
    const londres = moonDayDetail('2026-09-20', { ...DIJON, timeZone: 'Europe/London' });

    expect(paris.sunrise).not.toBe(londres.sunrise);
    // Une heure de décalage, pas davantage : c'est le même soleil sur le même point.
    const lire = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    expect(lire(paris.sunrise!) - lire(londres.sunrise!)).toBe(60);
  });
});
