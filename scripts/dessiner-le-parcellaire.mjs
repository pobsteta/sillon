// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pose un parcellaire sur la carte : situe la ferme, puis trace le contour de chaque
// jardin et de chaque planche.
//
// À quoi ça sert : une carte vide ne dit rien de ce que fait l'écran. Avec un parcellaire
// dessiné, on voit ce que Sillon montre d'une exploitation — et l'on peut juger de la
// lisibilité sur une vraie photo aérienne, ce qu'aucune capture ne remplace.
//
// **Il passe par l'API**, comme `jardin-exemple.mjs` : les contours traversent la même
// validation et la même conversion `{lat,lng}` → GeoJSON que ceux tracés à la souris. Un
// jeu de données posé en base serait cohérent avec lui-même et faux vis-à-vis du reste.
//
//   node scripts/dessiner-le-parcellaire.mjs --email moi@example.org --password '…' \
//        --lat 47.30185 --lng 4.69762
//
// La disposition suit ce qu'on trouve au champ : des planches parallèles séparées par un
// passe-pied, regroupées en blocs, orientées nord-sud pour que les rangs prennent le soleil
// d'est en ouest.

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

const API = args.get('api') ?? process.env.API_URL ?? 'http://localhost:3000';
const EMAIL = args.get('email') ?? process.env.EMAIL;
const PASSWORD = args.get('password') ?? process.env.PASSWORD;
const LAT = Number(args.get('lat'));
const LNG = Number(args.get('lng'));
const FORCE = args.get('force') === 'true';

if (!EMAIL || !PASSWORD || !Number.isFinite(LAT) || !Number.isFinite(LNG)) {
  console.error(
    'Usage : node scripts/dessiner-le-parcellaire.mjs --email … --password … --lat … --lng …',
  );
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
  for (const entree of reponse.headers.getSetCookie?.() ?? []) {
    if (entree.startsWith('sillon_session=')) cookie = entree.split(';')[0];
  }
  if (!reponse.ok)
    throw new Error(`${methode} ${chemin} → ${reponse.status} ${brut.slice(0, 200)}`);
  return brut ? JSON.parse(brut) : null;
}

const RAYON = 6_371_008.8;
const RADIANS = Math.PI / 180;

/**
 * Déplace un point de `est` et `nord` mètres.
 *
 * Projection plane locale : à l'échelle d'un jardin, la Terre est plate. Le cosinus de la
 * latitude est ce qui resserre les méridiens en s'éloignant de l'équateur — l'oublier
 * étirerait le parcellaire d'un tiers à nos latitudes, et le rectangle ne serait plus un
 * rectangle.
 */
const deplacer = (point, est, nord) => ({
  lat: point.lat + nord / RAYON / RADIANS,
  lng: point.lng + est / (RAYON * Math.cos(point.lat * RADIANS)) / RADIANS,
});

/** Rectangle d'un coin sud-ouest, en mètres. Sens antihoraire, comme le veut GeoJSON. */
const rectangle = (coin, largeur, longueur) => [
  deplacer(coin, 0, 0),
  deplacer(coin, largeur, 0),
  deplacer(coin, largeur, longueur),
  deplacer(coin, 0, longueur),
];

/**
 * Arrondi à **sept** décimales, soit environ huit centimètres.
 *
 * Cinq décimales suffisent pour situer une ferme — c'est ce que fait l'écran pour la
 * position —, mais pas pour dessiner une planche : à nos latitudes, 1e-5° de longitude
 * vaut 75 cm. Une planche de 80 cm quantifiée par pas de 75 cm devient 75 cm ou 1,50 m,
 * et sa surface se trompe de 10 %. Le défaut est discret : le rectangle reste un
 * rectangle, seule la mesure ment.
 */
const arrondir = (points) =>
  points.map((p) => ({
    lat: Math.round(p.lat * 1e7) / 1e7,
    lng: Math.round(p.lng * 1e7) / 1e7,
  }));

/**
 * Blocs de planches, de l'ouest vers l'est. Les dimensions sont celles du référentiel de
 * départ de Sillon : planches de 80 cm, passe-pied de 40 cm.
 */
const PLAN = [
  { nom: 'Serre tunnel', longueur: 25, ecart: 12 },
  { nom: 'Jardin du haut', longueur: 30, ecart: 14 },
  { nom: 'Jardin du bas', longueur: 30, ecart: 14 },
];
const LARGEUR_PLANCHE = 0.8;
const PASSE_PIED = 0.4;
const PAS = LARGEUR_PLANCHE + PASSE_PIED;

const main = async () => {
  await appel('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  const session = await appel('GET', '/api/auth/me');
  const ferme = session.farms[0];
  if (!ferme) throw new Error('Ce compte n’a aucune ferme.');
  const url = (chemin) => `/api/farms/${ferme.id}${chemin}`;
  console.log(`Ferme « ${ferme.name} » — ${LAT}, ${LNG}`);

  const emplacements = await appel('GET', url('/locations'));
  const dejaDessines = emplacements.filter((lieu) => lieu.geometry).length;
  if (dejaDessines > 0 && !FORCE) {
    console.error(
      `\n${dejaDessines} emplacement(s) ont déjà un contour. ` +
        'Relancez avec --force pour les remplacer.',
    );
    process.exit(1);
  }

  await appel('PATCH', `/api/farms/${ferme.id}`, { latitude: LAT, longitude: LNG });

  const origine = { lat: LAT, lng: LNG };
  let est = 0;
  let traces = 0;

  for (const bloc of PLAN) {
    const parent = emplacements.find((lieu) => lieu.name === bloc.nom && lieu.parentId === null);
    if (!parent) {
      console.warn(`  bloc absent du parcellaire, ignoré : ${bloc.nom}`);
      continue;
    }
    const planches = emplacements
      .filter((lieu) => lieu.parentId === parent.id)
      .sort((a, b) => a.position - b.position || a.id - b.id);
    if (planches.length === 0) continue;

    // Le contour du jardin enveloppe ses planches, avec un mètre de tour.
    const largeurBloc = planches.length * PAS - PASSE_PIED;
    await appel('PUT', url(`/locations/${parent.id}/geometry`), {
      points: arrondir(
        rectangle(deplacer(origine, est - 1, -1), largeurBloc + 2, bloc.longueur + 2),
      ),
    });
    traces += 1;

    for (const [index, planche] of planches.entries()) {
      const coin = deplacer(origine, est + index * PAS, 0);
      const reponse = await appel('PUT', url(`/locations/${planche.id}/geometry`), {
        points: arrondir(rectangle(coin, LARGEUR_PLANCHE, bloc.longueur)),
      });
      traces += 1;
      if (index === 0) {
        console.log(
          `  ${bloc.nom} : ${planches.length} planches, ` +
            `${reponse.measured.areaM2} m² la première`,
        );
      }
    }
    est += largeurBloc + bloc.ecart;
  }

  console.log(`\n${traces} contours tracés. Ouvrez l’écran Carte.`);
};

main().catch((erreur) => {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exit(1);
});
