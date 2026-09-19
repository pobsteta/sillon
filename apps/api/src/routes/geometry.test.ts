// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Contour des emplacements (lot 2 de `brief/carte-du-jardin.md`).
//
// Ce qui se vérifie ici tient en une phrase : **un contour posé doit ressortir au même
// endroit sur Terre**. Le reste du dépôt manipule des `{ lat, lng }` ; la base, elle, garde
// du GeoJSON en `[lng, lat]`. L'aller-retour traverse donc deux fois la conversion, et une
// inversion d'un côté seulement ne lèverait aucune erreur — elle déplacerait la planche de
// plusieurs milliers de kilomètres, et l'écran l'afficherait sans broncher.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fromGeoJsonPolygon, type LatLng } from '@sillon/core';
import {
  createTestApp,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from '../test-support.js';
import { withoutFarmScope } from '../tenant.js';

let app: FastifyInstance;
let compte: TestAccount;
let planche: { id: number };

const entetes = () => ({ cookie: compte.cookie });
const url = (chemin: string) => `/api/farms/${compte.farmId}${chemin}`;

/** Une planche de 80 cm sur 30 m, quelque part en Anjou. */
const CENTRE: LatLng = { lat: 47.59855, lng: -0.44078 };

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

const dessiner = (points: LatLng[] | null, id = planche.id) =>
  app.inject({
    method: 'PUT',
    url: url(`/locations/${id}/geometry`),
    headers: entetes(),
    payload: { points },
  });

beforeAll(async () => {
  await resetDatabase();
  app = await createTestApp();
  compte = await registerAccount(app, { email: 'contour@example.org' });
  const jardin = await app
    .inject({
      method: 'POST',
      url: url('/locations'),
      headers: entetes(),
      payload: { name: 'Jardin du bas', parentId: null, bedLength: 0, greenhouse: false },
    })
    .then((r) => r.json());
  planche = await app
    .inject({
      method: 'POST',
      url: url('/locations'),
      headers: entetes(),
      payload: { name: 'Planche 1', parentId: jardin.id, bedLength: 30_000, greenhouse: false },
    })
    .then((r) => r.json());
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('poser un contour', () => {
  it('le range fermé, et en GeoJSON', async () => {
    const reponse = await dessiner(rectangle(CENTRE, 0.8, 30));
    expect(reponse.statusCode, reponse.body).toBe(200);

    const brut = await withoutFarmScope((db) =>
      db.location.findUniqueOrThrow({ where: { id: planche.id }, select: { geometry: true } }),
    );
    const polygone = brut.geometry as { type: string; coordinates: number[][][] };

    expect(polygone.type).toBe('Polygon');
    // Anneau fermé : cinq positions pour quatre sommets.
    expect(polygone.coordinates[0]).toHaveLength(5);
    expect(polygone.coordinates[0]![0]).toEqual(polygone.coordinates[0]![4]);
  });

  it('revient au même endroit sur Terre', async () => {
    // L'essai que le brief réclame. En base, la longitude passe devant ; relue par le
    // noyau, la latitude revient devant. Si une seule des deux conversions se trompait,
    // la planche d'Anjou se retrouverait au large de la Somalie.
    const sommets = rectangle(CENTRE, 0.8, 30);
    await dessiner(sommets);

    const brut = await withoutFarmScope((db) =>
      db.location.findUniqueOrThrow({ where: { id: planche.id }, select: { geometry: true } }),
    );
    const relus = fromGeoJsonPolygon(brut.geometry as never);

    expect(relus).toHaveLength(sommets.length);
    for (const [index, point] of relus.entries()) {
      expect(point.lat, `sommet ${index}`).toBeCloseTo(sommets[index]!.lat, 9);
      expect(point.lng, `sommet ${index}`).toBeCloseTo(sommets[index]!.lng, 9);
    }
    // Et le contour reste en France : la vérification grossière qui attrape l'inversion.
    for (const point of relus) {
      expect(point.lat).toBeGreaterThan(41);
      expect(point.lat).toBeLessThan(52);
    }
  });

  it('rend la mesure, sans toucher à la longueur de planche', async () => {
    // `bedLength` sert aux calculs de semences. Un tracé approximatif ne doit pas en
    // devenir la base sans que personne ne l'ait voulu : la mesure se propose.
    const reponse = await dessiner(rectangle(CENTRE, 0.8, 30));
    const corps = reponse.json();

    expect(corps.measured.areaM2).toBeGreaterThanOrEqual(23);
    expect(corps.measured.areaM2).toBeLessThanOrEqual(25);
    expect(corps.measured.longestSideMm).toBeGreaterThan(29_900);
    expect(corps.bedLength, 'la longueur saisie fait toujours foi').toBe(30_000);
  });

  it('s’efface, parce qu’un tracé raté doit pouvoir se défaire', async () => {
    await dessiner(rectangle(CENTRE, 0.8, 30));

    const reponse = await dessiner(null);

    expect(reponse.statusCode).toBe(200);
    expect(reponse.json().measured).toBeNull();
    const brut = await withoutFarmScope((db) =>
      db.location.findUniqueOrThrow({ where: { id: planche.id }, select: { geometry: true } }),
    );
    expect(brut.geometry).toBeNull();
  });

  it('accompagne l’emplacement dans l’arbre', async () => {
    // L'écran de carte lit le même arbre que l'assolement : un second parcellaire
    // divergerait du premier sans que personne ne s'en aperçoive.
    await dessiner(rectangle(CENTRE, 0.8, 30));
    const arbre = await app
      .inject({ method: 'GET', url: url('/locations'), headers: entetes() })
      .then((r) => r.json());

    const trouvee = arbre.find((e: { id: number }) => e.id === planche.id);
    expect(trouvee.geometry, 'le contour voyage avec l’arbre').toBeTruthy();
  });
});

describe('ce qu’un contour ne peut pas être', () => {
  it('refuse moins de trois sommets', async () => {
    expect((await dessiner([CENTRE])).statusCode).toBe(422);
    expect((await dessiner([CENTRE, { lat: 47.6, lng: -0.44 }])).statusCode).toBe(422);
  });

  it('refuse un point hors de la Terre', async () => {
    const hors = [...rectangle(CENTRE, 0.8, 30)];
    hors[0] = { lat: 120, lng: -0.44 };
    expect((await dessiner(hors)).statusCode).toBe(422);
  });

  it('refuse un emplacement d’une autre ferme', async () => {
    // La clé étrangère est globale : sans cette vérification, on dessinerait sur le
    // parcellaire du voisin.
    const voisine = await registerAccount(app, { email: 'voisine-contour@example.org' });
    const sienne = await app
      .inject({
        method: 'POST',
        url: `/api/farms/${voisine.farmId}/locations`,
        headers: { cookie: voisine.cookie },
        payload: { name: 'Chez elle', parentId: null, bedLength: 30_000, greenhouse: false },
      })
      .then((r) => r.json());

    const refus = await dessiner(rectangle(CENTRE, 0.8, 30), sienne.id);

    expect(refus.statusCode).toBe(404);
  });
});
