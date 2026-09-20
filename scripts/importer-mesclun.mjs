// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Transforme la base Pépinière-Mesclun en jeu de références de Sillon.
//
//   node scripts/importer-mesclun.mjs --source ~/…/BDD_synthese_27_novembre_2023.xlsx
//
// **Un script de génération, pas un import à chaud.** La donnée entre dans le dépôt,
// relue, avec son SPDX et son attribution (`specs/brief-donnees-mesclun.md` §7.4).
// Interroger l'entrepôt au démarrage de Sillon ferait dépendre le référentiel d'un
// service tiers, et rendrait le contenu du dépôt imprévisible d'une exécution à l'autre.
//
// **La source.** Morel, Kevin, 2023, « Base de données pour la planification en
// maraîchage (Pépinière-Mesclun) », Recherche Data Gouv, DOI 10.57745/IQVM2I, v1.1,
// sous **Licence Ouverte Etalab 2.0** (`etalab-2.0`) — vérifiée le 20 septembre 2026 par
// l'API de l'entrepôt, qui rend `"etalab 2.0"` et l'URI SPDX correspondante. Attribution
// obligatoire : elle voyage dans l'en-tête du fichier produit et s'affiche dans
// l'interface, là où la donnée se consulte.
//
// **Ce que le script laisse de côté, et pourquoi.**
//
// - Les lignes dont l'unité récoltée n'est pas le kilogramme — bottes et pièces. Le
//   classeur donne bien un poids indicatif par unité, mais s'en servir pour fabriquer des
//   kg/m² reviendrait à publier un chiffre que la source ne publie pas. On compte ce qu'on
//   écarte, et on le dit.
// - Le prix en **circuit long**. Le classeur donne les deux ; Sillon sert des fermes qui
//   vendent en direct, et une seule fourchette peut tenir dans `price_eur_kg`. Le choix
//   est ici, visible, plutôt que dilué dans une moyenne des deux.
// - Le temps de travail : le classeur n'en porte pas. `labor_h_100m2` reste vide, et
//   aucune estimation n'est fabriquée pour combler la colonne.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const cle = process.argv[i];
  if (!cle.startsWith('--')) continue;
  const suivant = process.argv[i + 1];
  if (suivant && !suivant.startsWith('--')) {
    args.set(cle.slice(2), suivant);
    i += 1;
  } else args.set(cle.slice(2), 'true');
}

const SOURCE = args.get('source');
const SORTIE =
  args.get('sortie') ??
  new URL('../packages/core/data/references/mesclun-2023.json', import.meta.url).pathname;

if (!SOURCE) {
  console.error(
    'Usage : node scripts/importer-mesclun.mjs --source <BDD_synthese_….xlsx> [--sortie <fichier.json>]\n\n' +
      'Le classeur se récupère par son DOI : https://doi.org/10.57745/IQVM2I\n' +
      'Il n’est pas versionné dans le dépôt — seul le JSON produit l’est.',
  );
  process.exit(2);
}

/** En-tête de source, recopié tel que l'entrepôt le déclare. */
const SOURCE_META = {
  id: 'mesclun-2023',
  titre: 'Base de données pour la planification en maraîchage (Pépinière-Mesclun)',
  auteurs: ['Morel, Kevin (INRAE)'],
  annee: 2023,
  url: 'https://doi.org/10.57745/IQVM2I',
  licence: 'etalab-2.0',
  notes:
    'Recherche Data Gouv, version 1.1, fichier BDD_synthese_27_novembre_2023. Licence Ouverte ' +
    'Etalab 2.0, relevée le 20 septembre 2026 via l’API de l’entrepôt (champ license : ' +
    '« etalab 2.0 », URI spdx.org/licenses/etalab-2.0.html) ; attribution obligatoire. ' +
    'Produit par scripts/importer-mesclun.mjs : rendements et prix en circuit court, pour les ' +
    'seules cultures dont l’unité récoltée est le kilogramme. Le classeur ne porte pas de ' +
    'temps de travail.',
};

/** `Carotte conservation` → `carotte-conservation`. Stable, lisible, et sans accent. */
const versCle = (libelle) =>
  libelle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Une fourchette, ou `undefined` si la source ne donne rien d'exploitable. */
function fourchette(bas, defaut, haut) {
  const nombre = (valeur) =>
    typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0
      ? // Trois décimales : le classeur porte des valeurs issues de divisions
        // (`2.9999999999999996`), dont les dernières décimales sont du bruit de calcul et
        // non de la précision. Les recopier donnerait un faux air d'exactitude.
        Math.round(valeur * 1000) / 1000
      : undefined;

  const median = nombre(defaut);
  if (median === undefined) return undefined;

  const low = nombre(bas);
  const high = nombre(haut);
  // Les bornes doivent encadrer la médiane : le schéma le refuserait, et une borne
  // aberrante vaut mieux écartée que corrigée à la main.
  return {
    ...(low !== undefined && low <= median ? { low } : {}),
    median,
    ...(high !== undefined && high >= median ? { high } : {}),
  };
}

const CONDUITE = {
  Biologique: 'biologique',
  Conventionnel: 'conventionnelle',
  'Conventionnelle en terre': 'conventionnelle',
};

/**
 * Lit les deux onglets utiles du classeur.
 *
 * `exceljs` est une dépendance **de développement** : ce script ne tourne qu'à la main,
 * quand une nouvelle version du jeu paraît, et rien de tout cela ne part chez qui installe
 * Sillon. Le classeur est petit (200 ko) : on le charge en entier plutôt que de le
 * parcourir en flux, ce qui rendrait ce script plus difficile à relire pour rien.
 */
async function lireClasseur(chemin) {
  const ExcelJS = require('exceljs');
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(readFileSync(chemin));

  const onglet = (nom) => {
    const feuille = classeur.getWorksheet(nom);
    if (!feuille) throw new Error(`Onglet « ${nom} » absent du classeur.`);
    const lignes = [];
    feuille.eachRow((ligne, numero) => {
      if (numero === 1) return;
      lignes.push(ligne.values.slice(1).map((cellule) => cellule ?? null));
    });
    return lignes;
  };

  return { rendements: onglet('Rendements'), prix: onglet('Prix') };
}

const { rendements, prix } = await lireClasseur(SOURCE);

// Les prix, indexés par culture et conduite, pour être joints aux rendements.
const prixParCle = new Map();
for (const ligne of prix) {
  const [culture, agriculture, , , , unite, , ccBas, ccHaut, ccDefaut] = ligne;
  if (!culture || unite !== 'kg') continue;
  const conduite = CONDUITE[agriculture];
  if (!conduite) continue;
  const plage = fourchette(ccBas, ccDefaut, ccHaut);
  if (plage) prixParCle.set(`${versCle(culture)}|${conduite}`, plage);
}

const entrees = [];
const ecartees = { unite: 0, sansRendement: 0, conduiteInconnue: 0 };

for (const ligne of rendements) {
  const [culture, agriculture, basse, haute, defaut, unite] = ligne;
  if (!culture) continue;
  if (unite !== 'kg') {
    ecartees.unite += 1;
    continue;
  }
  const conduite = CONDUITE[agriculture];
  if (!conduite) {
    ecartees.conduiteInconnue += 1;
    continue;
  }
  const rendement = fourchette(basse, defaut, haute);
  if (!rendement) {
    ecartees.sansRendement += 1;
    continue;
  }

  const cle = versCle(culture);
  const prixCourt = prixParCle.get(`${cle}|${conduite}`);

  entrees.push({
    source_id: SOURCE_META.id,
    crop_key: cle,
    context: {
      // Le classeur ne sépare pas les rendements sous abri de ceux de plein champ :
      // `null` le dit, là où `false` prêterait à ces chiffres une précision absente.
      abri: null,
      systeme: 'tous',
      conduite,
    },
    yield_kg_m2: rendement,
    ...(prixCourt ? { price_eur_kg: prixCourt } : {}),
    n: null,
    page_ref: `onglet Rendements, ligne « ${culture} » (${agriculture})`,
    notes: prixCourt ? 'Prix en circuit court, onglet Prix.' : 'Aucun prix en kg pour cette ligne.',
  });
}

entrees.sort((a, b) =>
  a.crop_key === b.crop_key
    ? a.context.conduite.localeCompare(b.context.conduite)
    : a.crop_key.localeCompare(b.crop_key),
);

writeFileSync(SORTIE, `${JSON.stringify({ source: SOURCE_META, values: entrees }, null, 2)}\n`);

const cultures = new Set(entrees.map((entree) => entree.crop_key));
console.log(`${entrees.length} entrées écrites sur ${cultures.size} cultures → ${SORTIE}`);
console.log(
  `Écartées : ${ecartees.unite} lignes en botte ou en pièce, ` +
    `${ecartees.sansRendement} sans rendement exploitable, ` +
    `${ecartees.conduiteInconnue} de conduite non reconnue.`,
);
console.log(`Avec prix : ${entrees.filter((entree) => entree.price_eur_kg).length}.`);
