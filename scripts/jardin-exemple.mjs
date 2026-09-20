// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Peuple une ferme d'un jardin maraîcher complet, du 1er janvier au 31 décembre.
//
// À quoi ça sert : montrer Sillon plein plutôt que vide. Un écran de plan de culture sans
// séries ne dit rien de ce que fait l'outil ; les statistiques, l'assolement et la feuille
// de commande ne se comprennent qu'avec une saison sous les yeux.
//
// **Il passe par l'API, pas par la base.** Les dates dérivées, les durées, les tâches et
// les quantités de semences sont donc calculées par le vrai code — un jeu de données posé
// en SQL serait cohérent avec lui-même et faux vis-à-vis de l'application.
//
//   node scripts/jardin-exemple.mjs --email moi@example.org --password '…' [--annee 2026]
//
// Options : --api (défaut http://localhost:3000), --annee (défaut : année courante),
//           --force (peupler même si l'année contient déjà des séries),
//           --latitude / --longitude (où poser la ferme ; défaut : plaine dijonnaise),
//           --sans-carte (ne pas situer la ferme ni dessiner le parcellaire).
//
// **Le parcellaire est dessiné sur la carte**, et pas seulement décrit. Sans position ni
// contour, l'écran Carte s'ouvre sur la France entière et n'a rien à montrer : le jeu
// d'exemple laisserait croire que la fonctionnalité ne marche pas. Les contours sont
// calculés depuis les mêmes mesures que `bedLength`, par le code du noyau — les deux ne
// peuvent donc pas se contredire.

// Le noyau plutôt qu'une copie : poser un rectangle de 30 m sur 80 cm à partir de degrés
// demande le cosinus de la latitude, et une seconde implémentation de ce calcul finirait
// par ne plus donner le même parcellaire que l'application.
import { bedOutline, offsetMeters } from '../packages/core/dist/geo.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const cle = process.argv[i];
  if (!cle.startsWith('--')) continue;
  const suivant = process.argv[i + 1];
  if (suivant && !suivant.startsWith('--')) {
    args.set(cle.slice(2), suivant);
    i += 1;
  } else {
    args.set(cle.slice(2), 'true');
  }
}

const API = args.get('api') ?? process.env.API_URL ?? 'http://localhost:3000';
const EMAIL = args.get('email') ?? process.env.EMAIL;
const PASSWORD = args.get('password') ?? process.env.PASSWORD;
const ANNEE = Number(args.get('annee') ?? new Date().getFullYear());
const FORCE = args.get('force') === 'true';
const SANS_CARTE = args.get('sans-carte') === 'true';

/**
 * Où poser la ferme d'exemple : en plaine dijonnaise, sur des terres cultivées.
 *
 * Le lieu est arbitraire mais **réel**. Une ferme sans position ouvre la carte sur la
 * France entière ; une ferme posée par 0°, 0° l'ouvre au large du golfe de Guinée. Ni
 * l'une ni l'autre ne montre ce que l'écran sait faire.
 */
const POSITION = {
  lat: Number(args.get('latitude') ?? 47.322),
  lng: Number(args.get('longitude') ?? 5.041),
};

/** Cap du parcellaire, en degrés depuis le nord. De biais, comme un vrai champ. */
const ORIENTATION = 18;

/** Largeur d'une planche et de son passe-pied, en mètres. La maille courante. */
const PAS_ENTRE_PLANCHES = 1.4;

if (!EMAIL || !PASSWORD) {
  console.error('Usage : node scripts/jardin-exemple.mjs --email … --password … [--annee 2026]');
  process.exit(2);
}

let cookie = '';

async function appel(methode, chemin, corps) {
  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: {
      ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const brut = await reponse.text();
  const donnees = brut ? JSON.parse(brut) : null;
  if (!reponse.ok) {
    const erreur = new Error(`${methode} ${chemin} → ${reponse.status} ${brut.slice(0, 300)}`);
    erreur.statut = reponse.status;
    throw erreur;
  }
  const pose = reponse.headers.getSetCookie?.() ?? [];
  for (const entree of pose) {
    if (entree.startsWith('sillon_session=')) cookie = entree.split(';')[0];
  }
  return donnees;
}

const jour = (mois, quantieme) =>
  `${ANNEE}-${String(mois).padStart(2, '0')}-${String(quantieme).padStart(2, '0')}`;

/**
 * Le plan de culture. Mesures aux unités de stockage de Brinjel : longueurs en millimètres,
 * espacements en dixièmes de millimètre, rendements en millièmes d'unité par mètre de
 * planche, prix en centimes. La conversion n'a lieu qu'aux bords — ici, on est dedans.
 */
const PLAN = [
  // — Hiver et printemps précoce —
  ['Fève', 'direct_seeded', jour(1, 10), 30, 2, 2000, [0, 120, 30], 2500, 450, false],
  ['Épinard', 'direct_seeded', jour(1, 20), 30, 4, 1000, [0, 60, 35], 2000, 600, false],
  ['Radis', 'direct_seeded', jour(2, 5), 15, 6, 500, [0, 28, 14], 1500, 250, true],
  ['Laitue', 'transplant_raised', jour(2, 10), 30, 3, 3000, [35, 45, 21], 1800, 180, true],
  ['Carotte', 'direct_seeded', jour(2, 20), 30, 4, 500, [0, 110, 40], 3500, 220, false],
  ['Pois', 'direct_seeded', jour(3, 1), 30, 2, 400, [0, 75, 30], 1200, 700, false],
  ['Oignon', 'transplant_raised', jour(3, 5), 30, 4, 1200, [50, 130, 30], 3000, 300, false],
  ['Pomme de terre', 'direct_seeded', jour(3, 15), 30, 3, 3000, [0, 100, 30], 3500, 200, false],
  ['Betterave', 'direct_seeded', jour(3, 20), 30, 4, 1000, [0, 90, 45], 3000, 250, false],
  ['Navet', 'direct_seeded', jour(3, 25), 30, 4, 800, [0, 60, 30], 2200, 260, false],
  ['Radis', 'direct_seeded', jour(3, 10), 15, 6, 500, [0, 28, 14], 1500, 250, false],

  // — Solanacées et cucurbitacées, sous abri puis en plein champ —
  ['Tomate', 'transplant_raised', jour(3, 1), 30, 2, 5000, [50, 70, 110], 6000, 400, true],
  ['Aubergine', 'transplant_raised', jour(3, 5), 20, 2, 5000, [55, 80, 90], 3500, 500, true],
  ['Poivron', 'transplant_raised', jour(3, 5), 20, 2, 4500, [55, 80, 90], 3000, 550, true],
  ['Concombre', 'transplant_raised', jour(4, 10), 20, 2, 4000, [30, 55, 70], 5000, 350, true],
  ['Courgette', 'transplant_raised', jour(4, 15), 30, 1, 8000, [25, 50, 70], 4000, 250, false],
  ['Melon', 'transplant_raised', jour(4, 20), 30, 2, 8000, [30, 85, 40], 2500, 350, false],
  ['Courge', 'transplant_raised', jour(5, 1), 30, 1, 12_000, [25, 110, 30], 3000, 180, false],

  // — Plein été —
  ['Blette', 'transplant_raised', jour(4, 1), 30, 3, 3500, [35, 60, 90], 2500, 300, false],
  ['Poireau', 'transplant_raised', jour(4, 1), 30, 4, 1500, [60, 120, 60], 3000, 320, false],
  ['Céleri', 'transplant_raised', jour(4, 5), 20, 3, 3000, [55, 100, 45], 2500, 380, false],
  ['Persil', 'transplant_raised', jour(4, 20), 15, 4, 2000, [40, 70, 120], 1200, 800, false],
  ['Laitue', 'transplant_raised', jour(4, 5), 30, 3, 3000, [30, 40, 21], 1800, 180, false],
  ['Laitue', 'transplant_raised', jour(5, 5), 30, 3, 3000, [28, 38, 21], 1800, 180, false],
  ['Haricot', 'direct_seeded', jour(5, 10), 30, 2, 800, [0, 60, 35], 1500, 600, false],
  ['Chou', 'transplant_raised', jour(6, 1), 30, 2, 5000, [40, 80, 45], 3000, 280, false],
  ['Laitue', 'transplant_raised', jour(6, 5), 30, 3, 3000, [25, 35, 18], 1800, 180, false],
  ['Courgette', 'transplant_raised', jour(6, 15), 30, 1, 8000, [22, 45, 60], 4000, 250, false],
  ['Haricot', 'direct_seeded', jour(6, 20), 30, 2, 800, [0, 58, 35], 1500, 600, false],
  ['Fenouil', 'transplant_raised', jour(6, 20), 20, 3, 3000, [35, 75, 30], 2200, 350, false],
  ['Laitue', 'transplant_raised', jour(7, 5), 30, 3, 3000, [25, 35, 18], 1800, 180, false],

  // — Automne et hivernage —
  ['Chicorée', 'transplant_raised', jour(7, 15), 30, 3, 3000, [30, 70, 45], 2000, 320, false],
  ['Radis', 'direct_seeded', jour(9, 10), 15, 6, 500, [0, 30, 14], 1500, 250, false],
  ['Mâche', 'direct_seeded', jour(9, 1), 30, 8, 300, [0, 70, 60], 900, 900, true],
  ['Épinard', 'direct_seeded', jour(9, 10), 30, 4, 1000, [0, 65, 60], 2000, 600, false],
  ['Roquette', 'direct_seeded', jour(9, 20), 15, 6, 400, [0, 40, 30], 1000, 700, true],
  ['Ail', 'direct_seeded', jour(10, 15), 30, 4, 1200, [0, 240, 21], 1800, 900, false],
  ['Échalote', 'direct_seeded', jour(11, 5), 30, 4, 1500, [0, 200, 21], 1800, 800, false],
];

/**
 * Le parcellaire est dimensionné par la rotation, pas par la surface.
 *
 * Sillon refuse de reposer une famille botanique sur une planche avant le délai de retour
 * (trois à quatre ans selon la famille). Une saison de trente-huit séries a donc besoin
 * d'au moins autant de planches distinctes que la famille la plus représentée en compte —
 * sans quoi le placement échoue, et un jeu de démonstration qui enfreindrait ses propres
 * règles de rotation serait un mauvais exemple.
 */
const PARCELLES = [
  { nom: 'Serre tunnel', serre: true, planches: 8, longueur: 25_000 },
  { nom: 'Jardin du haut', serre: false, planches: 16, longueur: 30_000 },
  { nom: 'Jardin du bas', serre: false, planches: 16, longueur: 30_000 },
];

const NOTES = [
  [jour(3, 12), 'Gelée tardive cette nuit, −2 °C. Voiles posés sur les laitues du tunnel.', true],
  [jour(5, 2), 'Premiers doryphores sur les pommes de terre. Ramassage à la main.', false],
  [jour(6, 18), 'Sécheresse depuis trois semaines. Goutte-à-goutte tous les deux jours.', true],
  [jour(7, 24), 'Orage de grêle. Courgettes marquées, rien de perdu.', false],
  [jour(9, 5), 'Sol encore chaud, les semis d’automne lèvent en quatre jours.', false],
  [jour(11, 12), 'Première gelée blanche. Mâche et roquette sous voile.', true],
];

const main = async () => {
  console.log(`API ${API} — ferme de ${EMAIL} — année ${ANNEE}`);

  await appel('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  const session = await appel('GET', '/api/auth/me');
  const ferme = session.farms[0];
  if (!ferme) throw new Error('Ce compte n’a aucune ferme.');
  const url = (chemin) => `/api/farms/${ferme.id}${chemin}`;
  console.log(`Ferme « ${ferme.name} » (#${ferme.id})`);

  // Un jeu de démonstration posé sur des données réelles serait difficile à distinguer du
  // travail de quelqu'un. On regarde avant d'écrire.
  const existantes = await appel('GET', url(`/plantings?year=${ANNEE}`));
  if (existantes.length > 0 && !FORCE) {
    console.error(
      `\n${existantes.length} série(s) existent déjà en ${ANNEE}. ` +
        'Relancez avec --force si vous voulez en ajouter par-dessus.',
    );
    process.exit(1);
  }

  // ── Parcellaire ──
  if (!SANS_CARTE) {
    // Poser la position **avant** les contours : sans elle, la carte n'a pas de quoi se
    // cadrer au premier affichage, et les planches apparaîtraient perdues sur un fond
    // vide. L'écriture est réservée au rôle propriétaire ; un compte de moindre rôle voit
    // la position mais ne la change pas, et le script continue alors sans elle.
    try {
      await appel('PATCH', `/api/farms/${ferme.id}`, {
        latitude: POSITION.lat,
        longitude: POSITION.lng,
      });
      console.log(`Ferme située en ${POSITION.lat}, ${POSITION.lng}`);
    } catch (erreur) {
      console.warn(`Position non posée (${erreur.statut ?? '?'}) — la carte restera vide.`);
    }
  }

  const planches = [];
  const emplacements = await appel('GET', url('/locations'));
  // Décalage vers l'est du bloc en cours, en mètres. Les trois parcelles se suivent, avec
  // dix mètres entre elles : assez pour qu'on les distingue, assez peu pour qu'elles
  // tiennent dans le même cadrage.
  let decalageEst = 0;
  for (const parcelle of PARCELLES) {
    let parent = emplacements.find((e) => e.name === parcelle.nom);
    if (!parent) {
      parent = await appel('POST', url('/locations'), {
        name: parcelle.nom,
        parentId: null,
        bedLength: 0,
        greenhouse: parcelle.serre,
      });
    }
    for (let numero = 1; numero <= parcelle.planches; numero += 1) {
      const nom = `${parcelle.nom} — planche ${numero}`;
      let planche = emplacements.find((e) => e.name === nom);
      if (!planche) {
        planche = await appel('POST', url('/locations'), {
          name: nom,
          parentId: parent.id,
          bedLength: parcelle.longueur,
          bedWidth: 800,
          greenhouse: parcelle.serre,
        });
      }
      if (!SANS_CARTE) {
        const coin = offsetMeters(POSITION, decalageEst + (numero - 1) * PAS_ENTRE_PLANCHES, 0);
        const contour = bedOutline(coin, parcelle.longueur / 1000, 0.8, ORIENTATION);
        // Les quatre sommets **ouverts** : c'est la route qui referme l'anneau, comme le
        // veut GeoJSON. Lui passer les cinq points d'un polygone déjà fermé ajouterait un
        // sommet en double, que rien ne signalerait et que le calcul de surface avalerait.
        //
        // `PUT` et non `PATCH` : le contour remplace le précédent. Un script relancé ne
        // doit pas empiler deux tracés sur la même planche.
        await appel('PUT', url(`/locations/${planche.id}/geometry`), { points: contour });
      }
      planches.push({ ...planche, serre: parcelle.serre, longueur: parcelle.longueur });
    }
    decalageEst += parcelle.planches * PAS_ENTRE_PLANCHES + 10;
  }
  console.log(`${planches.length} planches${SANS_CARTE ? '' : ', dessinées sur la carte'}`);

  // ── Référentiel ──
  const especes = await appel('GET', url('/crops'));
  const unites = await appel('GET', url('/units'));
  const fournisseurs = await appel('GET', url('/providers'));
  const parNom = (liste, nom) => liste.find((entree) => entree.name === nom);
  const kilo = parNom(unites, 'kg') ?? unites[0];
  const botte = parNom(unites, 'botte') ?? kilo;

  // Une variété par espèce, rattachée à un semencier réel : sans quoi la feuille de
  // commande n'aurait rien à répartir, et c'est elle qui rend les fournisseurs utiles.
  const semenciers = fournisseurs.filter((f) => f.url);
  const varietes = new Map();
  const NOMS_VARIETES = {
    Tomate: 'Cœur de bœuf',
    Carotte: 'Nantaise',
    Laitue: 'Batavia blonde',
    Courgette: 'Ronde de Nice',
    Poireau: 'Bleu de Solaize',
    Haricot: 'Contender',
    Chou: 'Milan de Pontoise',
    Betterave: 'Crapaudine',
    Radis: 'De dix-huit jours',
    Épinard: 'Géant d’hiver',
    Mâche: 'Verte de Cambrai',
    Courge: 'Butternut',
    Melon: 'Charentais',
    Concombre: 'Marketmore',
    Aubergine: 'De Barbentane',
    Poivron: 'Doux d’Espagne',
    Oignon: 'Jaune paille des Vertus',
    Pois: 'Merveille de Kelvedon',
    Fève: 'Aguadulce',
    'Pomme de terre': 'Charlotte',
    Navet: 'De Nancy',
    Blette: 'Verte à carde blanche',
    Chicorée: 'Pain de sucre',
    Fenouil: 'Doux de Florence',
    Céleri: 'Vert d’Elne',
    Persil: 'Géant d’Italie',
    Roquette: 'Cultivée',
    Ail: 'Rose de Lautrec',
    Échalote: 'Jermor',
  };
  let index = 0;
  for (const [nomEspece, nomVariete] of Object.entries(NOMS_VARIETES)) {
    const espece = parNom(especes, nomEspece);
    if (!espece) continue;
    const semencier = semenciers[index % Math.max(semenciers.length, 1)] ?? fournisseurs[0];
    index += 1;
    try {
      const variete = await appel('POST', url('/varieties'), {
        name: nomVariete,
        cropId: espece.id,
        providerId: semencier.id,
      });
      varietes.set(nomEspece, variete.id);
    } catch (erreur) {
      if (erreur.statut !== 409) throw erreur;
      const existantes = await appel('GET', url(`/varieties?cropId=${espece.id}`));
      const trouvee = parNom(existantes, nomVariete);
      if (trouvee) varietes.set(nomEspece, trouvee.id);
    }
  }
  console.log(`${varietes.size} variétés`);

  // ── Séries, tâches, placement ──
  let placees = 0;
  let taches = 0;
  const series = [];
  const occupation = new Map(planches.map((planche) => [planche.id, []]));
  const familles = new Map(planches.map((planche) => [planche.id, new Set()]));
  const nonPlacees = [];

  for (const [
    nomEspece,
    type,
    semis,
    longueurMetres,
    rangs,
    espacement,
    [versPlantation, versMaturite, fenetre],
    rendement,
    prix,
    sousAbri,
  ] of PLAN) {
    const espece = parNom(especes, nomEspece);
    if (!espece) {
      console.warn(`  espèce inconnue, ignorée : ${nomEspece}`);
      continue;
    }

    const serie = await appel('POST', url('/plantings'), {
      cropId: espece.id,
      varietyId: varietes.get(nomEspece) ?? null,
      unitId: ['Radis', 'Persil', 'Roquette', 'Blette'].includes(nomEspece) ? botte.id : kilo.id,
      plantingType: type,
      inGreenhouse: sousAbri,
      length: longueurMetres * 1000,
      rows: rangs,
      spacingPlants: espacement,
      yieldPerBedMeter: rendement,
      pricePerUnit: prix,
      seedsPerHoleDirect: type === 'direct_seeded' ? 2 : null,
      seedsPerHoleSeedling: type === 'direct_seeded' ? null : 2,
      seedsExtraPercentage: 10,
      estimatedGreenhouseLoss: type === 'direct_seeded' ? null : 15,
      sowingDate: semis,
      durations: {
        days_to_transplant: versPlantation,
        days_to_maturity: versMaturite,
        harvest_window: fenetre,
      },
    });
    series.push({ ...serie, nomEspece });

    const genere = await appel('POST', url(`/plantings/${serie.id}/generate-tasks`), {
      replace: true,
    });
    taches += genere?.created ?? genere?.length ?? 0;

    // Placement : première planche du bon abri qui soit libre sur la période **et** qui
    // n'ait pas déjà porté cette famille. La seconde condition est celle qui compte : elle
    // reproduit la règle de rotation que l'API fait respecter, au lieu de la contourner
    // avec `force`.
    const debut = serie.occupation?.begin ?? semis;
    const fin = serie.occupation?.end ?? semis;
    const famille = espece.familyId;
    let pose = false;
    for (const planche of planches.filter((candidate) => candidate.serre === sousAbri)) {
      const prises = occupation.get(planche.id);
      if (familles.get(planche.id).has(famille)) continue;
      if (!prises.every((periode) => periode.fin < debut || periode.debut > fin)) continue;
      try {
        await appel('PUT', url(`/plantings/${serie.id}/assignments`), {
          assignments: [
            { locationId: planche.id, length: Math.min(longueurMetres * 1000, planche.longueur) },
          ],
        });
        prises.push({ debut, fin });
        familles.get(planche.id).add(famille);
        placees += 1;
        pose = true;
      } catch (erreur) {
        // Un refus de rotation reste possible si la planche a une histoire antérieure :
        // on passe à la suivante plutôt que de forcer.
        if (erreur.statut !== 400 && erreur.statut !== 409 && erreur.statut !== 422) throw erreur;
      }
      if (pose) break;
    }
    if (!pose) nonPlacees.push(`${nomEspece} (${semis})`);
  }
  console.log(`${series.length} séries, ${taches} tâches, ${placees} placées sur l’assolement`);
  if (nonPlacees.length > 0) {
    // Le dire plutôt que de le taire : une série non placée n'apparaît pas à l'assolement,
    // et on croirait à un défaut d'affichage.
    console.log(`  non placées, faute de planche libre : ${nonPlacees.join(', ')}`);
  }

  // ── Récoltes, pour les fenêtres déjà passées ──
  const aujourdHui = new Date().toISOString().slice(0, 10);
  let recoltes = 0;
  for (const serie of series) {
    for (const periode of serie.harvestPeriods ?? []) {
      if (periode.begin > aujourdHui) continue;
      const derniere = periode.end < aujourdHui ? periode.end : aujourdHui;
      // Trois passages par fenêtre : début, milieu, fin. Assez pour que les statistiques
      // et les rendements aient quelque chose à dire, sans inventer une comptabilité.
      const jours = [periode.begin, milieu(periode.begin, derniere), derniere];
      for (const date of [...new Set(jours)]) {
        const attendu = Math.round(((serie.computed?.expectedYield ?? 3000) / 1000 / 3) * 1000);
        await appel('POST', url('/harvests'), {
          plantingId: serie.id,
          date,
          quantity: Math.max(1, Math.round(attendu * (0.8 + Math.random() * 0.4))),
          laborTime: 1800 + Math.round(Math.random() * 3600),
          done: true,
        });
        recoltes += 1;
      }
    }
  }
  console.log(`${recoltes} récoltes saisies`);

  // ── Notes de saison ──
  for (const [date, contenu, epinglee] of NOTES) {
    await appel('POST', url('/notes'), { content: contenu, date, pinned: epinglee });
  }
  console.log(`${NOTES.length} notes`);

  console.log(`\nTerminé. Ouvrez le plan de culture sur l’année ${ANNEE}.`);
};

function milieu(debut, fin) {
  const moitie = (Date.parse(debut) + Date.parse(fin)) / 2;
  return new Date(moitie).toISOString().slice(0, 10);
}

main().catch((erreur) => {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exit(1);
});
