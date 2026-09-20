// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Complétude des fichiers de traduction.
//
// Une clé manquante ne casse rien : i18next affiche la clé elle-même, et
// `moon.advice.fruit.9.tips` s'affiche au milieu d'un écran sans qu'aucune erreur ne soit
// levée. C'est précisément le genre de défaut qu'on ne voit que sur la copie d'écran d'un
// utilisateur — d'autant plus ici que le contenu du calendrier lunaire compte quarante-huit
// entrées par langue, écrites à la main, qu'aucun essai de parcours ne traverse en entier.

import { describe, expect, it } from 'vitest';
import fr from './locales/fr.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

/** Tous les chemins de feuilles d'un objet, à plat : `moon.advice.fruit.9.tips`. */
function chemins(valeur: unknown, prefixe = ''): string[] {
  if (Array.isArray(valeur)) return [prefixe];
  if (valeur === null || typeof valeur !== 'object') return [prefixe];
  return Object.entries(valeur as Record<string, unknown>).flatMap(([cle, sous]) =>
    chemins(sous, prefixe ? `${prefixe}.${cle}` : cle),
  );
}

describe('les deux langues disent les mêmes choses', () => {
  it('portent exactement les mêmes clés', () => {
    // Le français est la langue de référence à l'usage, l'anglais celle du développement :
    // les deux doivent rester alignées, dans les deux sens. Une clé anglaise orpheline est
    // du texte que personne ne verra ; une clé française orpheline est un écran anglais qui
    // affiche « moon.day.explainBody ».
    const cotesFr = new Set(chemins(fr));
    const cotesEn = new Set(chemins(en));

    expect(
      [...cotesFr].filter((cle) => !cotesEn.has(cle)),
      'absentes de l’anglais',
    ).toEqual([]);
    expect(
      [...cotesEn].filter((cle) => !cotesFr.has(cle)),
      'absentes du français',
    ).toEqual([]);
  });

  it('ne laissent aucune chaîne vide', () => {
    const vides = (racine: unknown, prefixe = ''): string[] => {
      if (typeof racine === 'string') return racine.trim() === '' ? [prefixe] : [];
      if (Array.isArray(racine))
        return racine.flatMap((item, index) => vides(item, `${prefixe}[${index}]`));
      if (racine && typeof racine === 'object') {
        return Object.entries(racine as Record<string, unknown>).flatMap(([cle, sous]) =>
          vides(sous, prefixe ? `${prefixe}.${cle}` : cle),
        );
      }
      return [];
    };

    expect(vides(fr)).toEqual([]);
    expect(vides(en)).toEqual([]);
  });
});

describe('le contenu du calendrier lunaire', () => {
  const TYPES = ['racine', 'feuille', 'fleur', 'fruit'] as const;
  const MOIS = Array.from({ length: 12 }, (_, index) => String(index + 1));

  for (const [langue, dictionnaire] of [
    ['fr', fr],
    ['en', en],
  ] as const) {
    it(`couvre les quatre types sur les douze mois (${langue})`, () => {
      // Quarante-huit cases, et aucun écran ne les montre toutes : c'est cet essai qui
      // tient lieu de relecture de couverture. Un mois oublié n'apparaîtrait qu'une fois
      // l'an, chez quelqu'un d'autre.
      const conseils = (dictionnaire as { moon: { advice: Record<string, unknown> } }).moon.advice;

      for (const type of TYPES) {
        for (const mois of MOIS) {
          const entree = (conseils[type] as Record<string, { tips?: string[]; tasks?: string[] }>)[
            mois
          ];
          expect(entree, `${type}.${mois}`).toBeDefined();
          expect(entree!.tips?.length, `${type}.${mois}.tips`).toBeGreaterThan(0);
          expect(entree!.tasks?.length, `${type}.${mois}.tasks`).toBeGreaterThan(0);
        }
      }
    });
  }

  it('nomme chaque valeur que le serveur peut rendre', () => {
    // Le serveur rend des identifiants — `gibbeuse-decroissante`, `a-eviter`,
    // `lune-absente-du-jour` — que l'interface traduit par une clé construite. Une valeur
    // ajoutée dans `@sillon/core` sans sa traduction s'afficherait telle quelle.
    const moon = fr.moon as unknown as Record<string, Record<string, unknown>>;

    expect(Object.keys(moon.phaseDetail!)).toHaveLength(8);
    expect(Object.keys(moon.element!).sort()).toEqual(['air', 'eau', 'feu', 'terre']);
    expect(Object.keys(moon.indexLabel!).sort()).toEqual([
      'a-eviter',
      'exceptionnel',
      'favorable',
      'moyen',
      'tres-favorable',
    ]);
    expect(Object.keys(moon.indexReason!).sort()).toEqual([
      'apogee',
      'journee-partagee',
      'lune-absente-du-jour',
      'noeud',
      'perigee',
    ]);
    expect(Object.keys(moon.dayPart!)).toHaveLength(5);
    // Chaque type de jour × chaque tendance : c'est la phrase de période de la fiche.
    for (const type of TYPES) {
      const periode = (moon.period as Record<string, Record<string, string>>)[type];
      expect(Object.keys(periode!).sort(), type).toEqual(['descendante', 'montante']);
    }
  });
});
