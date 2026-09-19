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
