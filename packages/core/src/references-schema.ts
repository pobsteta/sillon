// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Schéma et chargeur des jeux de références (lot 0 de
// `specs/brief-sillon-references-microfermes.md`).
//
// **Ce module est à part de `references.ts` pour une raison mesurable.** Il dépend de Zod,
// et `index.ts` réexporte tout le noyau : tant que la validation vivait à côté des
// fonctions pures, Zod partait dans le paquet servi au **navigateur** — vingt-six
// kilo-octets compressés, pour un code que l'interface n'exécute jamais. Le brief vise des
// pages sous 300 ko ; ce genre de fuite les y mène sans qu'on s'en aperçoive.
//
// Il n'est donc **pas** réexporté par `index.ts` : on l'importe par son chemin, et seuls
// le seed et les essais le font.
//
//     import { parseReferenceFile } from '@sillon/core/dist/references-schema.js';
//
// Ce que ce module garantit, et ce qu'il ne garantit pas : il valide la **forme** d'un jeu
// de références. Il ne dit rien de la justesse des chiffres — ceux-là viennent de travaux
// publiés, ils sont cités, et c'est la citation qui en répond. D'où l'obligation, portée
// par le schéma, qu'aucune entrée n'existe sans sa source et sa page.

import { z } from 'zod';
import {
  CONDUITES,
  METRIQUES_FERME,
  SYSTEMES,
  type Entree,
  type EntreeFerme,
  type FichierReferences,
  type Source,
} from './references.js';

/**
 * Une fourchette publiée. `median` est seule obligatoire : plusieurs agrégats ne donnent
 * qu'une médiane, et exiger les trois bornes obligerait à en inventer deux.
 */
const Fourchette = z
  .object({
    low: z.number().positive().optional(),
    median: z.number().positive(),
    high: z.number().positive().optional(),
  })
  .refine(
    (plage) => (plage.low ?? 0) <= plage.median && plage.median <= (plage.high ?? Infinity),
    'les bornes doivent encadrer la médiane',
  );

/**
 * En-tête de source. Obligatoire, et complet : une valeur de référence sans provenance
 * vérifiable est une affirmation, pas une référence.
 *
 * **`licence` est une chaîne libre, et deux valeurs conventionnelles s'y ajoutent** aux
 * identifiants SPDX ordinaires (`CC-BY-4.0`, `etalab-2.0`…) :
 *
 * - `a-verifier` — les conditions n'ont pas été établies. Un aveu volontaire, et non un
 *   défaut de saisie : elles ne se devinent pas, et une mention inventée serait pire que
 *   l'absence. `licenceAVerifier()` permet de s'en apercevoir ;
 * - `reutilisation-autorisee` — la réutilisation est permise sur décision du porteur du
 *   projet, faute d'identifiant publié retrouvable. `notes` porte alors la base et sa
 *   date. C'est moins fort qu'une licence nommée, et c'est dit plutôt que maquillé.
 */
const Source = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'identifiant en minuscules, chiffres et tirets'),
  titre: z.string().min(1),
  auteurs: z.array(z.string().min(1)).min(1),
  annee: z.number().int().min(1900).max(2100),
  url: z.string().min(1),
  licence: z.string().min(1),
  notes: z.string().default(''),
});

/**
 * Une entrée : ce qu'une source dit d'une culture, dans un contexte donné.
 *
 * `n` est le nombre d'observations derrière le chiffre, **quand la source en est une**.
 * Une enquête le donne — et une médiane sur trois fermes ne se lit pas comme une médiane
 * sur quarante, d'où son affichage au survol (§ Lot B). Une base de références compilée
 * depuis la bibliographie et l'expertise de partenaires, comme Pépinière-Mesclun, n'en a
 * pas : exiger `n` obligerait à en inventer un. Il est donc facultatif, et son absence
 * veut dire « ce n'est pas un échantillon » — ce que l'interface doit dire aussi, plutôt
 * que d'afficher un effectif vide.
 */
const Entree = z.object({
  source_id: z.string().min(1),
  crop_key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'clé en minuscules, chiffres et tirets'),
  /**
   * Le contexte que la source décrit. Chaque champ peut valoir `null` : cela signifie
   * « la source ne distingue pas », et c'est une information. Le remplacer par une
   * valeur par défaut ferait passer un agrégat tous contextes confondus pour une mesure
   * en plein champ, ou en bio, sans que rien ne le signale.
   */
  context: z.object({
    abri: z.boolean().nullable(),
    systeme: z.enum(SYSTEMES),
    conduite: z.enum(CONDUITES).nullable(),
  }),
  yield_kg_m2: Fourchette.optional(),
  labor_h_100m2: Fourchette.optional(),
  price_eur_kg: Fourchette.optional(),
  n: z.number().int().positive().nullable().default(null),
  page_ref: z
    .string()
    .min(1, 'la page, le tableau ou l’onglet d’origine, pour retrouver le chiffre'),
  notes: z.string().default(''),
});

/**
 * Un fichier de références : une source, et ses entrées.
 *
 * Non exporté : c'est `parseReferenceFile` qui est l'entrée du module, et exposer le
 * schéma inviterait à valider ailleurs, avec d'autres messages d'erreur.
 *
 * Le fichier peut ne porter **aucune** entrée. C'est l'état du lot 0, où le schéma, le
 * chargeur et les essais existent avant les chiffres — que le brief livre séparément et
 * interdit d'inventer.
 */
/**
 * Un repère d'exploitation : une grandeur de ferme, et non de culture.
 *
 * `range` est **obligatoire**, à la différence des mesures d'une entrée par culture : une
 * entrée de ferme n'existe que pour porter un chiffre, alors qu'une culture peut n'avoir
 * qu'un prix, ou qu'un rendement.
 */
const EntreeFermeSchema = z.object({
  source_id: z.string().min(1),
  metric: z.enum(METRIQUES_FERME),
  context: z.object({
    systeme: z.enum(SYSTEMES),
    conduite: z.enum(CONDUITES).nullable(),
  }),
  range: Fourchette,
  n: z.number().int().positive().nullable().default(null),
  page_ref: z.string().min(1, 'l’onglet, la page ou le tableau d’origine'),
  notes: z.string().default(''),
});

const SchemaFichier = z
  .object({
    source: Source,
    values: z.array(Entree),
    // Absent de la plupart des jeux : une base de planification décrit des cultures.
    farm_values: z.array(EntreeFermeSchema).default([]),
  })
  .superRefine((fichier, contexte) => {
    for (const [index, entree] of fichier.values.entries()) {
      // Une entrée qui citerait une autre source que celle du fichier serait invisible à
      // la lecture et fausserait toute attribution.
      if (entree.source_id !== fichier.source.id) {
        contexte.addIssue({
          code: 'custom',
          path: ['values', index, 'source_id'],
          message: `« ${entree.source_id} » ne correspond pas à la source du fichier (« ${fichier.source.id} »)`,
        });
      }
      // Une entrée sans aucune mesure n'apporte rien et encombrerait les écrans.
      if (!entree.yield_kg_m2 && !entree.labor_h_100m2 && !entree.price_eur_kg) {
        contexte.addIssue({
          code: 'custom',
          path: ['values', index],
          message: 'aucune mesure : rendement, temps de travail ou prix, au moins un',
        });
      }
    }
    for (const [index, entree] of fichier.farm_values.entries()) {
      if (entree.source_id !== fichier.source.id) {
        contexte.addIssue({
          code: 'custom',
          path: ['farm_values', index, 'source_id'],
          message: `« ${entree.source_id} » ne correspond pas à la source du fichier (« ${fichier.source.id} »)`,
        });
      }
    }
  });

/**
 * Valide un jeu de références déjà lu.
 *
 * Le module ne touche pas au système de fichiers : `@sillon/core` est « sans base ni
 * navigateur », et le doit rester pour partir dans le paquet servi au navigateur. C'est
 * l'appelant — le seed, un essai — qui lit le fichier et passe son contenu.
 *
 * Lève une erreur nommant le chemin fautif plutôt que de rendre un résultat partiel : une
 * référence à demi chargée s'afficherait comme les autres, sans rien qui la distingue.
 */
export function parseReferenceFile(brut: unknown, origine = 'références'): FichierReferences {
  const lu = SchemaFichier.safeParse(brut);
  if (lu.success) return lu.data;

  const details = lu.error.issues
    .map((souci) => `  - ${souci.path.join('.') || '(racine)'} : ${souci.message}`)
    .join('\n');
  throw new Error(`Jeu de références invalide (${origine}) :\n${details}`);
}

/**
 * Le schéma et les types du module pur doivent décrire la même chose.
 *
 * Zod infère ses propres types ; `references.ts` en déclare d'équivalents, sans dépendre de
 * Zod. Rien n'oblige les deux à rester d'accord — sauf cette ligne, qui échoue à la
 * compilation dès qu'ils divergent. Sans elle, un champ ajouté d'un seul côté passerait
 * inaperçu jusqu'à l'exécution.
 */
const _accord: FichierReferences = {} as z.infer<typeof SchemaFichier>;
void _accord;
const _accordEntree: Entree = {} as z.infer<typeof Entree>;
void _accordEntree;
const _accordFerme: EntreeFerme = {} as z.infer<typeof EntreeFermeSchema>;
void _accordFerme;
const _accordSource: Source = {} as z.infer<typeof Source>;
void _accordSource;
