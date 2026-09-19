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
  fromGeoJsonPolygon,
  fromGeoJsonPosition,
  isGeoJsonPolygon,
  isLatitude,
  isLatLng,
  isLongitude,
  longestSideMm,
  polygonArea,
  polygonCentroid,
  toGeoJsonPolygon,
  toGeoJsonPosition,
  type GeoJsonPosition,
  type LatLng,
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

/** Construit un rectangle de `largeur` × `longueur` mètres, centré sur `centre`. */
function rectangle(centre: LatLng, largeurM: number, longueurM: number): LatLng[] {
  const R = 6_371_008.8;
  const enDegres = 180 / Math.PI;
  const dLat = (longueurM / 2 / R) * enDegres;
  const dLng = (largeurM / 2 / (R * Math.cos((centre.lat * Math.PI) / 180))) * enDegres;
  return [
    { lat: centre.lat - dLat, lng: centre.lng - dLng },
    { lat: centre.lat - dLat, lng: centre.lng + dLng },
    { lat: centre.lat + dLat, lng: centre.lng + dLng },
    { lat: centre.lat + dLat, lng: centre.lng - dLng },
  ];
}

describe('un contour', () => {
  it('se ferme en partant vers GeoJSON', () => {
    // La spécification l'exige, et l'oublier produit un polygone que d'autres outils
    // refusent sans toujours dire pourquoi.
    const polygone = toGeoJsonPolygon(rectangle(SOUCELLES, 10, 30));
    const anneau = polygone.coordinates[0]!;

    expect(anneau).toHaveLength(5);
    expect(anneau[0]).toEqual(anneau[4]);
    expect(polygone.type).toBe('Polygon');
  });

  it('se rouvre au retour, sans le point répété', () => {
    const sommets = rectangle(SOUCELLES, 10, 30);
    expect(fromGeoJsonPolygon(toGeoJsonPolygon(sommets))).toHaveLength(4);
  });

  it('refuse ce qui n’est pas une surface', () => {
    expect(() => toGeoJsonPolygon([SOUCELLES])).toThrow(RangeError);
    expect(() => toGeoJsonPolygon([SOUCELLES, { lat: 47.6, lng: -0.44 }])).toThrow(RangeError);
    expect(() => fromGeoJsonPolygon({ type: 'Polygon', coordinates: [[]] })).toThrow(RangeError);
  });

  it('se reconnaît sans lever, pour ce qui vient du dehors', () => {
    expect(isGeoJsonPolygon(toGeoJsonPolygon(rectangle(SOUCELLES, 10, 30)))).toBe(true);
    expect(isGeoJsonPolygon(null)).toBe(false);
    expect(isGeoJsonPolygon({ type: 'Point', coordinates: [0, 0] })).toBe(false);
    // Un anneau trop court, et un point hors de la Terre : deux façons d'arriver ici.
    expect(
      isGeoJsonPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ).toBe(false);
    expect(
      isGeoJsonPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [2, 200],
            [0, 0],
          ],
        ],
      }),
    ).toBe(false);
  });
});

describe('ce qu’on tire d’un contour', () => {
  it('mesure une planche de 80 cm sur 30 m au mètre carré près', () => {
    // Une planche du référentiel de départ : 30 m de long, 80 cm de large, soit 24 m².
    const surface = polygonArea(rectangle(SOUCELLES, 0.8, 30));

    expect(surface).toBeGreaterThanOrEqual(23);
    expect(surface).toBeLessThanOrEqual(25);
  });

  it('mesure un carré de cent mètres, à un pour mille près', () => {
    // 10 000 m² : la vérification qui dit si la projection locale tient. Une erreur de
    // facteur — degrés pris pour des radians, cosinus oublié — se verrait ici d'un coup.
    const surface = polygonArea(rectangle(SOUCELLES, 100, 100));

    expect(surface).toBeGreaterThan(9_990);
    expect(surface).toBeLessThan(10_010);
  });

  it('donne la même surface dans un sens que dans l’autre', () => {
    // Un contour tracé à l'envers est le même enclos. Sans valeur absolue, la surface
    // serait négative — et un affichage la montrerait telle quelle.
    const sommets = rectangle(SOUCELLES, 10, 30);
    expect(polygonArea([...sommets].reverse())).toBe(polygonArea(sommets));
  });

  it('ne mesure rien d’un contour qui n’en est pas un', () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([SOUCELLES, { lat: 47.6, lng: -0.44 }])).toBe(0);
  });

  it('retrouve le grand côté d’une planche, en millimètres', () => {
    // `bedLength` est en millimètres : 30 m font 30 000. C'est cette valeur qu'on
    // **proposera**, jamais qu'on imposera.
    const longueur = longestSideMm(rectangle(SOUCELLES, 0.8, 30));

    expect(longueur).toBeGreaterThan(29_900);
    expect(longueur).toBeLessThan(30_100);
  });

  it('place le centre au milieu', () => {
    const centre = polygonCentroid(rectangle(SOUCELLES, 10, 30));

    expect(centre.lat).toBeCloseTo(SOUCELLES.lat, 6);
    expect(centre.lng).toBeCloseTo(SOUCELLES.lng, 6);
  });
});
