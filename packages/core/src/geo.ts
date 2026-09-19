// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Coordonnées géographiques (lot 1 de `brief/carte-du-jardin.md`).
//
// **Ce fichier existe pour une raison précise : GeoJSON compte en `[longitude, latitude]`,
// Leaflet en `[latitude, longitude]`.** L'inversion ne lève aucune erreur — deux nombres
// restent deux nombres — et place le jardin à des milliers de kilomètres. En France, un
// point inversé atterrit dans le désert libyen.
//
// D'où le parti pris : **aucun tableau de deux nombres ne circule sans être nommé.** Le
// reste du code manipule des objets `{ lat, lng }` ; la conversion vers la forme GeoJSON
// n'a lieu qu'ici, aux deux frontières, et deux essais la gardent.

/** Un point, dans l'ordre que lit un humain : latitude d'abord. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Un point au format GeoJSON : `[longitude, latitude]`, dans cet ordre, comme la
 * spécification l'impose. Le type est distinct de `[number, number]` par son nom seul —
 * c'est peu, mais cela oblige à passer par les fonctions ci-dessous.
 */
export type GeoJsonPosition = [number, number];

export const isLatitude = (valeur: number): boolean =>
  Number.isFinite(valeur) && valeur >= -90 && valeur <= 90;

export const isLongitude = (valeur: number): boolean =>
  Number.isFinite(valeur) && valeur >= -180 && valeur <= 180;

export const isLatLng = (point: LatLng): boolean => isLatitude(point.lat) && isLongitude(point.lng);

/** Vers GeoJSON : la longitude passe **devant**. */
export function toGeoJsonPosition(point: LatLng): GeoJsonPosition {
  if (!isLatLng(point)) {
    throw new RangeError(`Coordonnées hors bornes : ${point.lat}, ${point.lng}`);
  }
  return [point.lng, point.lat];
}

/** Depuis GeoJSON : la latitude revient **devant**. */
export function fromGeoJsonPosition([lng, lat]: GeoJsonPosition): LatLng {
  if (!isLatitude(lat) || !isLongitude(lng)) {
    throw new RangeError(`Position GeoJSON hors bornes : ${lng}, ${lat}`);
  }
  return { lat, lng };
}

/**
 * Arrondi d'affichage et de stockage : cinq décimales, soit environ un mètre.
 *
 * Au-delà, on stockerait le bruit du GPS et les flottants deviendraient impossibles à
 * comparer d'un essai à l'autre. En deçà, on perdrait une planche de vue.
 */
export const arrondirCoordonnee = (valeur: number): number => Math.round(valeur * 1e5) / 1e5;

export const arrondirLatLng = (point: LatLng): LatLng => ({
  lat: arrondirCoordonnee(point.lat),
  lng: arrondirCoordonnee(point.lng),
});

/**
 * Un contour fermé, au format GeoJSON. Le premier et le dernier point sont identiques —
 * la spécification l'exige, et l'oublier produit un polygone que d'autres outils refusent
 * sans toujours le dire.
 */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
}

/** Rayon moyen de la Terre, en mètres (IUGG). */
const RAYON = 6_371_008.8;

/**
 * Ferme le contour et le met au format GeoJSON. Trois sommets au moins : en deçà, ce n'est
 * pas une surface.
 */
export function toGeoJsonPolygon(points: LatLng[]): GeoJsonPolygon {
  if (points.length < 3) {
    throw new RangeError(`Un contour demande au moins trois sommets, reçu ${points.length}`);
  }
  const anneau = points.map(toGeoJsonPosition);
  const premier = anneau[0]!;
  const dernier = anneau.at(-1)!;
  if (premier[0] !== dernier[0] || premier[1] !== dernier[1]) anneau.push(premier);
  return { type: 'Polygon', coordinates: [anneau] };
}

/** Rouvre le contour : les sommets, sans la répétition finale. */
export function fromGeoJsonPolygon(polygone: GeoJsonPolygon): LatLng[] {
  const anneau = polygone.coordinates[0];
  if (!anneau || anneau.length < 4) {
    throw new RangeError('Contour GeoJSON invalide : il faut un anneau fermé d’au moins 4 points');
  }
  const points = anneau.map(fromGeoJsonPosition);
  const premier = points[0]!;
  const dernier = points.at(-1)!;
  if (premier.lat === dernier.lat && premier.lng === dernier.lng) points.pop();
  return points;
}

/** Vérifie la forme sans lever : de quoi refuser proprement une charge venue du dehors. */
export function isGeoJsonPolygon(valeur: unknown): valeur is GeoJsonPolygon {
  const candidat = valeur as GeoJsonPolygon | null;
  if (!candidat || candidat.type !== 'Polygon' || !Array.isArray(candidat.coordinates)) {
    return false;
  }
  const anneau = candidat.coordinates[0];
  if (!Array.isArray(anneau) || anneau.length < 4) return false;
  return anneau.every(
    (position) =>
      Array.isArray(position) &&
      position.length === 2 &&
      isLongitude(position[0]!) &&
      isLatitude(position[1]!),
  );
}

/**
 * Projection plane locale, en mètres, autour d'un point de référence.
 *
 * Une planche fait quelques dizaines de mètres : à cette échelle, la Terre est plate, et
 * une projection équirectangulaire centrée sur la parcelle donne le mètre carré près. Les
 * formules géodésiques complètes seraient plus justes de quelques millionièmes, pour un
 * code qu'on ne saurait pas relire.
 */
function projeter(point: LatLng, reference: LatLng): { x: number; y: number } {
  const versRadians = Math.PI / 180;
  return {
    x: RAYON * (point.lng - reference.lng) * versRadians * Math.cos(reference.lat * versRadians),
    y: RAYON * (point.lat - reference.lat) * versRadians,
  };
}

/** Barycentre des sommets. Suffit à centrer une projection ; ce n'est pas le centre de masse. */
export function polygonCentroid(points: LatLng[]): LatLng {
  if (points.length === 0) throw new RangeError('Contour vide');
  const somme = points.reduce(
    (total, point) => ({ lat: total.lat + point.lat, lng: total.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: somme.lat / points.length, lng: somme.lng / points.length };
}

/**
 * Surface du contour, en **mètres carrés entiers** — l'unité de stockage du dépôt.
 *
 * Formule des lacets sur la projection locale. La valeur absolue rend le résultat
 * indépendant du sens de parcours : un contour tracé dans l'autre sens est le même enclos.
 */
export function polygonArea(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const reference = polygonCentroid(points);
  const plans = points.map((point) => projeter(point, reference));

  let doubleAire = 0;
  for (let i = 0; i < plans.length; i += 1) {
    const courant = plans[i]!;
    const suivant = plans[(i + 1) % plans.length]!;
    doubleAire += courant.x * suivant.y - suivant.x * courant.y;
  }
  return Math.round(Math.abs(doubleAire) / 2);
}

/**
 * Longueur du plus long côté, en **millimètres** — l'unité de `Location.bedLength`.
 *
 * C'est ce qu'on proposera pour une planche dessinée : d'un rectangle long et étroit, le
 * grand côté est la longueur de travail. La proposition ne s'impose jamais (voir
 * `brief/carte-du-jardin.md` §7) : la valeur saisie sert aux calculs de semences, et un
 * tracé approximatif au doigt ne doit pas devenir la base d'une commande de graines.
 */
export function longestSideMm(points: LatLng[]): number {
  if (points.length < 2) return 0;
  const reference = polygonCentroid(points);
  const plans = points.map((point) => projeter(point, reference));

  let plusLong = 0;
  for (let i = 0; i < plans.length; i += 1) {
    const courant = plans[i]!;
    const suivant = plans[(i + 1) % plans.length]!;
    const cote = Math.hypot(suivant.x - courant.x, suivant.y - courant.y);
    if (cote > plusLong) plusLong = cote;
  }
  return Math.round(plusLong * 1000);
}

/**
 * Fait pivoter des sommets autour d'un centre, en degrés **dans le sens horaire**.
 *
 * C'est le sens qu'attend la main : tourner la poignée vers la droite fait tourner la
 * planche vers la droite. Le sens trigonométrique, plus naturel en mathématiques, aurait
 * fait partir le parcellaire du mauvais côté sans que la formule ait l'air fausse.
 *
 * La rotation se fait sur la projection plane locale : à l'échelle d'un jardin, la Terre
 * est plate. Tourner directement des degrés de latitude et de longitude déformerait le
 * dessin, les méridiens étant resserrés d'un tiers à nos latitudes — un carré deviendrait
 * un losange, et rien n'aurait l'air cassé.
 */
export function rotateAround(points: LatLng[], degres: number, centre: LatLng): LatLng[] {
  const versRadians = Math.PI / 180;
  const angle = degres * versRadians;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cosLat = Math.cos(centre.lat * versRadians);

  return points.map((point) => {
    const x = RAYON * (point.lng - centre.lng) * versRadians * cosLat;
    const y = RAYON * (point.lat - centre.lat) * versRadians;
    const xt = x * cos + y * sin;
    const yt = -x * sin + y * cos;
    return {
      lat: centre.lat + yt / RAYON / versRadians,
      lng: centre.lng + xt / (RAYON * cosLat) / versRadians,
    };
  });
}

/** Barycentre de plusieurs contours, pour les faire pivoter d'un seul bloc. */
export function centroidOfAll(contours: LatLng[][]): LatLng {
  const tous = contours.flat();
  if (tous.length === 0) throw new RangeError('Aucun contour');
  return polygonCentroid(tous);
}
