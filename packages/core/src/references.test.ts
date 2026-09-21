// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Valeurs de référence : le schéma, le chargeur et la correspondance des cultures.
//
// Le risque de ce module n'est pas de planter, c'est de **ranger un chiffre sous la
// mauvaise étiquette**. Une médiane de rendement attribuée à la mauvaise espèce, à la
// mauvaise source, ou lue dans la mauvaise unité reste un nombre plausible : elle
// s'affichera comme les autres, et personne ne la reprendra. Ces essais portent donc sur
// l'attribution et sur les unités, davantage que sur les cas d'erreur.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReferenceFile } from './references-schema.js';
import {
  CROP_KEYS,
  farmMetricToStorage,
  farmToStorage,
  METRIQUES_FERME,
  laborToStorage,
  licenceAVerifier,
  reutilisationSurDecision,
  cropKeysFor,
  priceToStorage,
  medianeDesReferences,
  toStorage,
  yieldPerBedMeterFromReference,
  yieldToStorage,
  type Entree,
} from './references.js';

const DOSSIER = new URL('../data/references/', import.meta.url).pathname;

/** Une entrée valide et minimale, que chaque essai déforme à sa façon. */
const entree = (modifications: Partial<Entree> = {}): Entree =>
  ({
    source_id: 'essai-2026',
    crop_key: 'carotte',
    context: { abri: false, systeme: 'tous', conduite: null },
    yield_kg_m2: { low: 2.5, median: 4, high: 6 },
    labor_h_100m2: { median: 35 },
    n: 12,
    page_ref: 'p. 214, tableau 5.3',
    notes: '',
    ...modifications,
  }) as Entree;

const fichier = (valeurs: Entree[]) => ({
  source: {
    id: 'essai-2026',
    titre: 'Jeu d’essai',
    auteurs: ['Sillon'],
    annee: 2026,
    url: 'https://example.org/',
    licence: 'CC-BY-4.0',
    notes: '',
  },
  values: valeurs,
  farm_values: [],
});

describe('le chargeur refuse ce qu’il ne peut pas attribuer', () => {
  it('accepte un jeu complet', () => {
    const lu = parseReferenceFile(fichier([entree()]));
    expect(lu.values).toHaveLength(1);
    expect(lu.values[0]!.crop_key).toBe('carotte');
  });

  it('refuse une entrée qui cite une autre source que son fichier', () => {
    // Le défaut le plus coûteux du lot : un chiffre de Morel attribué à MMBio reste un
    // chiffre plausible, et l'erreur ne se voit qu'en rouvrant la source.
    expect(() => parseReferenceFile(fichier([entree({ source_id: 'morel-2016' })]))).toThrow(
      /ne correspond pas à la source du fichier/,
    );
  });

  it('refuse une entrée sans aucune mesure', () => {
    expect(() =>
      parseReferenceFile(fichier([entree({ yield_kg_m2: undefined, labor_h_100m2: undefined })])),
    ).toThrow(/aucune mesure/);
  });

  it('refuse une entrée sans page d’origine', () => {
    // « On cite systématiquement » : une valeur qu'on ne peut pas retrouver dans la
    // source n'est plus une référence, c'est une affirmation.
    expect(() => parseReferenceFile(fichier([entree({ page_ref: '' })]))).toThrow(/page_ref/);
  });

  it('refuse une fourchette dont les bornes n’encadrent pas la médiane', () => {
    // Une inversion low/high passerait sans bruit et dessinerait des barres à l'envers
    // dans l'onglet « Repères ».
    expect(() =>
      parseReferenceFile(fichier([entree({ yield_kg_m2: { low: 6, median: 4, high: 2.5 } })])),
    ).toThrow(/encadrer la médiane/);
  });

  it('refuse un effectif nul ou absent', () => {
    // `n` dit ce que vaut la médiane. Sans lui, trois fermes et quarante fermes se
    // présentent avec la même autorité.
    expect(() => parseReferenceFile(fichier([entree({ n: 0 })]))).toThrow(/n/);
  });

  it('nomme le chemin fautif plutôt que d’échouer en bloc', () => {
    // Un jeu de plusieurs centaines d'entrées ne se relit pas à l'œil : le message doit
    // conduire à la ligne.
    try {
      parseReferenceFile(fichier([entree(), entree({ page_ref: '' })]), 'morel-2016.json');
      expect.unreachable('le chargeur devait refuser');
    } catch (erreur) {
      expect((erreur as Error).message).toContain('morel-2016.json');
      expect((erreur as Error).message).toContain('values.1.page_ref');
    }
  });

  it('accepte un fichier sans aucune valeur', () => {
    // L'état du lot 0 : le schéma et le chargeur précèdent les chiffres, que le brief
    // livre séparément et interdit d'inventer.
    expect(parseReferenceFile(fichier([])).values).toEqual([]);
  });
});

describe('les unités passent aux entiers du dépôt', () => {
  it('convertit chaque mesure dans son unité de stockage', () => {
    expect(yieldToStorage(4), 'millièmes de kg/m²').toBe(4000);
    expect(laborToStorage(35), 'secondes pour 100 m²').toBe(126_000);
    expect(priceToStorage(2.8), 'centimes par kg').toBe(280);
  });

  it('ne laisse aucun flottant sortir', () => {
    // `CLAUDE.md` : les mesures sont des entiers. Un flottant qui passerait ici
    // ressortirait tel quel en base et casserait les comparaisons du lot B.
    const stockee = toStorage(entree({ yield_kg_m2: { low: 2.53, median: 4.07, high: 6.01 } }));
    for (const valeur of [stockee.yield!.low, stockee.yield!.median, stockee.yield!.high]) {
      expect(Number.isInteger(valeur)).toBe(true);
    }
  });

  it('garde les bornes absentes absentes, au lieu de les combler', () => {
    // Une source qui ne publie qu'une médiane ne doit pas se voir prêter une fourchette :
    // l'onglet « Repères » dessinerait un intervalle que personne n'a mesuré.
    const stockee = toStorage(entree({ labor_h_100m2: { median: 35 } }));
    expect(stockee.labor).toEqual({ low: null, median: 126_000, high: null });
  });

  it('rend nulle une mesure que la source ne donne pas', () => {
    expect(toStorage(entree({ price_eur_kg: undefined })).price).toBeNull();
  });

  it('reporte la provenance sur la valeur convertie', () => {
    // La conversion ne doit pas être l'endroit où la source se perd.
    const stockee = toStorage(entree());
    expect(stockee.sourceId).toBe('essai-2026');
    expect(stockee.pageRef).toBe('p. 214, tableau 5.3');
    expect(stockee.n).toBe(12);
  });
});

describe('la correspondance avec le référentiel', () => {
  it('reconnaît une espèce par son nom français ou anglais', () => {
    expect(cropKeysFor('Carotte')).toContain('carotte');
    expect(cropKeysFor('Carrot')).toContain('carotte');
    expect(cropKeysFor('Pomme de terre')).toContain('pomme-de-terre');
  });

  it('ignore la casse et les accents', () => {
    // Une ferme saisit « Echalote » sans accent, ou tout en majuscules : la reconnaître
    // évite un rattrapage à la main pour rien.
    expect(cropKeysFor('echalote')).toContain('echalote');
    expect(cropKeysFor('ÉPINARD')).toContain('epinard');
    expect(cropKeysFor('  Mâche  ')).toContain('mache');
  });

  it('rend toutes les clés d’une espèce, et non la première venue', () => {
    // Le point de conception depuis l'arrivée de Mesclun : la source sépare ce que Sillon
    // réunit. Une pomme de terre a des références primeur **et** conservation ; n'en
    // rendre qu'une ferait disparaître l'autre sans que rien ne le dise.
    const pdt = cropKeysFor('Pomme de terre');
    expect(pdt).toEqual(expect.arrayContaining(['pdt-primeur', 'pdt-conservation']));
    expect(cropKeysFor('Tomate').length, 'trois tomates chez Mesclun').toBeGreaterThanOrEqual(3);
  });

  it('rend une liste vide plutôt que d’approcher', () => {
    // « Chou-rave » rangé sous « chou » hériterait de rendements qui ne sont pas les
    // siens, et le chiffre resterait crédible. Le brief prévoit un rattrapage manuel côté
    // interface : encore faut-il lui laisser la main.
    expect(cropKeysFor('Chou-rave')).toEqual([]);
    expect(cropKeysFor('Salade')).toEqual([]);
    expect(cropKeysFor('Topinambour')).toEqual([]);
    expect(cropKeysFor('')).toEqual([]);
  });

  it('ne nomme que des espèces qui existent au référentiel de départ', () => {
    // La table est la charnière entre deux vocabulaires : une clé qui pointerait vers une
    // espèce absente du référentiel ne se verrait qu'au moment du seed, et se traduirait
    // par une référence orpheline plutôt que par une erreur.
    const referentiel = readFileSync(
      new URL('../../../apps/api/src/reference-data.ts', import.meta.url).pathname,
      'utf8',
    );
    const orphelines = Object.entries(CROP_KEYS).filter(
      ([, noms]) =>
        !referentiel.includes(`name: '${noms.fr}'`) ||
        !referentiel.includes(`nameEn: '${noms.en}'`),
    );

    expect(
      orphelines.map(([cle]) => cle),
      'clés sans espèce correspondante',
    ).toEqual([]);
  });
});

describe('les jeux de références livrés', () => {
  const fichiers = readdirSync(DOSSIER).filter((nom) => nom.endsWith('.json'));

  it('sont les sources retenues', () => {
    // Deux sources s'ajoutent à celles du brief, et pour la même raison : ce sont les
    // seules dont la licence permette d'entrer des chiffres dans le dépôt (Licence
    // Ouverte Etalab 2.0), là où la thèse Morel 2016 est en CC BY-NC-ND. Voir l'en-tête
    // de chaque fichier, qui dit ce qu'il porte et pourquoi.
    expect(fichiers.sort()).toEqual([
      'charge-travail-2023.json',
      'mesclun-2023.json',
      'mmbio-2023.json',
      'morel-2016.json',
    ]);
  });

  for (const nom of fichiers) {
    it(`${nom} : se charge, et porte sa source`, () => {
      const lu = parseReferenceFile(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8')), nom);

      // L'identifiant du fichier et celui de la source ne doivent pas diverger : le seed
      // du lot A retrouve l'un par l'autre.
      expect(`${lu.source.id}.json`).toBe(nom);
      expect(lu.source.auteurs.length).toBeGreaterThan(0);
      expect(lu.source.url).toMatch(/^https?:\/\//);
    });

    it(`${nom} : ses entrées portent une clé en forme, et des mesures`, () => {
      // Une `crop_key` absente de `CROP_KEYS` n'est **pas** une erreur : Mesclun décrit
      // des légumes que le référentiel de Sillon ne connaît pas — crosne, rhubarbe,
      // pourpier. Leurs références existent et attendent une espèce, sans être
      // rattachées à tort. Ce qu'on refuse, c'est une clé malformée.
      const lu = parseReferenceFile(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8')), nom);

      for (const valeur of lu.values) {
        expect(valeur.crop_key, 'clé en minuscules et tirets').toMatch(/^[a-z0-9-]+$/);
        expect(
          valeur.yield_kg_m2 ?? valeur.labor_h_100m2 ?? valeur.price_eur_kg,
          `${valeur.crop_key} doit porter au moins une mesure`,
        ).toBeDefined();
      }
    });
  }

  it('déclarent toutes une base de réutilisation établie', () => {
    // Les deux sources étaient marquées `a-verifier` jusqu'au 20 septembre 2026 ; la
    // réutilisation a depuis été tranchée par le porteur du projet, et la base est
    // consignée dans `notes`. Cet essai empêche le retour en arrière : une troisième
    // source ajoutée sans que la question soit posée échoue ici, plutôt que d'entrer en
    // silence avec ses chiffres.
    const lus = fichiers.map((nom) =>
      parseReferenceFile(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8')), nom),
    );

    expect(
      lus.filter((lu) => licenceAVerifier(lu.source)).map((lu) => lu.source.id),
      'sources dont la réutilisation reste à établir',
    ).toEqual([]);

    // Une autorisation sur décision n'est pas une licence nommée : elle doit dire d'où
    // elle vient, sinon elle ne vaut pas mieux qu'un champ vide.
    for (const lu of lus.filter((candidat) => reutilisationSurDecision(candidat.source))) {
      expect(lu.source.notes, `${lu.source.id} doit motiver son autorisation`).toMatch(/autoris/i);
      expect(lu.source.notes, `${lu.source.id} doit dater son autorisation`).toMatch(/\d{4}/);
    }
  });
});

describe('du repère publié au champ de saisie', () => {
  it('convertit le kilogramme par mètre carré en unité par mètre de planche', () => {
    // 2,775 kg/m² sur une planche de 80 cm font 2,22 kg par mètre de planche. Proposer
    // 2,775 tel quel serait faux d'un quart, avec un nombre parfaitement plausible.
    expect(yieldPerBedMeterFromReference(2775, 800)).toBe(2220);
    expect(yieldPerBedMeterFromReference(4000, 1200)).toBe(4800);
  });

  it('se tait quand la ferme n’a pas déclaré de largeur de planche', () => {
    // Supposer 80 cm pour tout le monde donnerait une suggestion fausse à qui travaille
    // en planches larges, sans rien qui le signale.
    expect(yieldPerBedMeterFromReference(2775, null)).toBeNull();
    expect(yieldPerBedMeterFromReference(2775, undefined)).toBeNull();
    expect(yieldPerBedMeterFromReference(2775, 0)).toBeNull();
  });

  it('retient la médiane quand plusieurs références visent la même espèce', () => {
    // Ni la première venue — la suggestion dépendrait de l'ordre de lecture — ni la
    // moyenne, qu'une valeur extrême tirerait à elle.
    expect(medianeDesReferences([2000, 2775, 9000])).toBe(2775);
    expect(medianeDesReferences([2000, 4000])).toBe(3000);
    expect(medianeDesReferences([2775])).toBe(2775);
  });

  it('n’a rien à proposer sur une liste vide', () => {
    expect(medianeDesReferences([])).toBeNull();
  });
});

describe('les repères d’exploitation', () => {
  it('convertit chaque métrique dans sa propre unité', () => {
    // C'est la raison d'être de la liste fermée : 8 000 m² par ETP, 6,10 € du mètre carré
    // et 2 700 heures par an ne se stockent pas de la même façon. Une conversion unique
    // les aurait tous abîmés, et chacun serait resté plausible.
    expect(farmMetricToStorage('surface-cultivee-par-etp', 8000), 'déjà en m²').toBe(8000);
    expect(farmMetricToStorage('chiffre-affaires-par-m2', 6.1), 'centimes').toBe(610);
    expect(farmMetricToStorage('heures-par-an', 2700), 'secondes').toBe(9_720_000);
    expect(farmMetricToStorage('revenu-mensuel-par-personne', 1400), 'centimes').toBe(140_000);
  });

  it('reporte la fourchette et la provenance', () => {
    const stockee = farmToStorage({
      source_id: 'charge-travail-2023',
      metric: 'surface-cultivee-par-etp',
      context: { systeme: 'bio-intensif', conduite: null },
      range: { low: 2000, median: 5000, high: 8000 },
      n: null,
      page_ref: 'onglet Repères_temps_travail, ligne 9',
      notes: '',
    });

    expect(stockee.range).toEqual({ low: 2000, median: 5000, high: 8000 });
    expect(stockee.pageRef).toContain('ligne 9');
    expect(stockee.metric).toBe('surface-cultivee-par-etp');
  });

  it('couvre toutes les métriques déclarées', () => {
    // Une métrique ajoutée sans son unité de stockage serait un nombre sans sens.
    // TypeScript l'interdit à la compilation ; cet essai le dit à la lecture.
    for (const metric of METRIQUES_FERME) {
      expect(Number.isInteger(farmMetricToStorage(metric, 1)), metric).toBe(true);
    }
  });

  it('se charge depuis le jeu livré, avec sa licence', () => {
    // Le repère de charge de travail vient d'une **republication** sous Licence Ouverte
    // de chiffres que la thèse, en CC BY-NC-ND, ne permettait pas de reprendre. C'est
    // cette republication qui les rend utilisables, et sa note doit le dire.
    const lu = parseReferenceFile(
      JSON.parse(readFileSync(join(DOSSIER, 'charge-travail-2023.json'), 'utf8')),
      'charge-travail-2023.json',
    );

    expect(lu.source.licence).toBe('etalab-2.0');
    expect(lu.farm_values.length).toBeGreaterThan(0);
    for (const repere of lu.farm_values) {
      expect(repere.page_ref, 'chaque repère doit être retrouvable dans la source').toBeTruthy();
      expect(repere.range.low! <= repere.range.median).toBe(true);
      expect(repere.range.median <= repere.range.high!).toBe(true);
    }
  });
});
