// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Coordonnées géographiques.
//
// Le brief nomme un risque principal, et ces essais n'ont pas d'autre objet : l'inversion
// latitude/longitude est **silencieuse**. Deux nombres restent deux nombres, aucune erreur
// n'est levée, et le jardin change de continent.

import { describe, expect, it } from 'vitest';
import {
  arrondirCoordonnee,
  arrondirLatLng,
  fromGeoJsonPosition,
  isLatitude,
  isLatLng,
  isLongitude,
  toGeoJsonPosition,
  type GeoJsonPosition,
} from './geo.js';

// Relevé par la Base Adresse Nationale le 19 septembre 2026 pour une adresse du
// Maine-et-Loire. Un point réel plutôt qu'un rond nombre : une inversion sur `0, 0` ne se
// verrait pas.
const SOUCELLES = { lat: 47.59855, lng: -0.44078 };

describe('l’ordre des coordonnées', () => {
  it('met la longitude devant, en GeoJSON', () => {
    expect(toGeoJsonPosition(SOUCELLES)).toEqual([-0.44078, 47.59855]);
  });

  it('remet la latitude devant, au retour', () => {
    expect(fromGeoJsonPosition([-0.44078, 47.59855])).toEqual(SOUCELLES);
  });

  it('revient au point de départ par un aller-retour', () => {
    expect(fromGeoJsonPosition(toGeoJsonPosition(SOUCELLES))).toEqual(SOUCELLES);
  });

  it('place bien le point sur la Terre, et pas ailleurs', () => {
    // L'essai que le brief réclame. Un point d'Anjou inversé tomberait à 47° est et 0,44°
    // nord : au large des côtes somaliennes. Rien ne l'aurait signalé.
    const [lng, lat] = toGeoJsonPosition(SOUCELLES);

    expect(lat, 'la latitude reste en France').toBeGreaterThan(41);
    expect(lat).toBeLessThan(52);
    expect(lng, 'la longitude reste en France').toBeGreaterThan(-6);
    expect(lng).toBeLessThan(10);
  });

  it('refuse une position qui n’en est pas une', () => {
    // Le seul cas d'inversion que les bornes attrapent : une longitude au-delà de 90°
    // placée en latitude. C'est peu, et c'est mieux que rien — d'où les essais ci-dessus,
    // qui ne comptent pas dessus.
    expect(() => fromGeoJsonPosition([2.35, 120] as GeoJsonPosition)).toThrow(RangeError);
    expect(() => toGeoJsonPosition({ lat: 120, lng: 2.35 })).toThrow(RangeError);
  });
});

describe('les bornes', () => {
  it('acceptent les extrêmes exacts', () => {
    // Les pôles et l'antiméridien sont des positions valides ; les exclure ferait échouer
    // une ferme là où personne ne la cherche, mais sans raison.
    for (const valeur of [-90, 0, 90]) expect(isLatitude(valeur), String(valeur)).toBe(true);
    for (const valeur of [-180, 0, 180]) expect(isLongitude(valeur), String(valeur)).toBe(true);
  });

  it('refusent ce qui dépasse, et ce qui n’est pas un nombre', () => {
    for (const valeur of [-90.1, 90.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isLatitude(valeur), String(valeur)).toBe(false);
    }
    expect(isLongitude(180.1)).toBe(false);
    expect(isLatLng({ lat: 47.6, lng: 200 })).toBe(false);
  });
});

describe('l’arrondi', () => {
  it('garde cinq décimales, soit environ un mètre', () => {
    expect(arrondirCoordonnee(47.598551234)).toBe(47.59855);
    expect(arrondirCoordonnee(-0.440784999)).toBe(-0.44078);
  });

  it('n’invente pas de précision sur un nombre court', () => {
    expect(arrondirCoordonnee(47.6)).toBe(47.6);
    expect(arrondirLatLng({ lat: 47.6, lng: -0.44 })).toEqual({ lat: 47.6, lng: -0.44 });
  });
});
