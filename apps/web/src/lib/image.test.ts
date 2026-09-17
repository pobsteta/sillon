// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Compression des photos avant envoi. Les essais portent sur les décisions — quelle
// taille viser, faut-il garder le résultat, comment nommer le fichier — et sur le repli
// quand le navigateur ne sait pas faire. Le dessin lui-même relève du navigateur : c'est
// le parcours Playwright qui l'exerce, sur une vraie image et un vrai canevas.

import { describe, expect, it } from 'vitest';
import {
  compresserPhoto,
  dimensionsReduites,
  MAX_PHOTO_PIXELS,
  nomJpeg,
  vautLaPeine,
} from './image.js';

describe('dimensions visées', () => {
  it('ramène le côté long à la cible en gardant les proportions', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ width: 2048, height: 1536 });
  });

  it('travaille aussi bien en portrait', () => {
    // Le côté long commande, pas la largeur : une photo tenue debout doit descendre autant.
    expect(dimensionsReduites(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  });

  it('laisse tranquille ce qui est déjà plus petit', () => {
    // Agrandir n'inventerait que du flou et des octets.
    expect(dimensionsReduites(800, 600)).toEqual({ width: 800, height: 600 });
    expect(dimensionsReduites(MAX_PHOTO_PIXELS, 100)).toEqual({
      width: MAX_PHOTO_PIXELS,
      height: 100,
    });
  });

  it('ne descend jamais un côté à zéro', () => {
    // Une image très allongée : 10 000 × 2, réduite, donnerait 0 pixel de haut en tronquant.
    const { width, height } = dimensionsReduites(10_000, 2);
    expect(width).toBe(MAX_PHOTO_PIXELS);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe('garder ou jeter le résultat', () => {
  it('garde ce qui allège', () => {
    expect(vautLaPeine(6_000_000, 420_000)).toBe(true);
  });

  it('rejette ce qui alourdit', () => {
    // Capture d'écran, dessin à plat : le JPEG ne bat pas un PNG sur de grands aplats.
    // Alourdir un envoi au prétexte de l'alléger serait le contraire du but.
    expect(vautLaPeine(120_000, 180_000)).toBe(false);
    expect(vautLaPeine(120_000, 120_000)).toBe(false);
  });

  it('rejette un résultat vide', () => {
    expect(vautLaPeine(120_000, 0)).toBe(false);
  });
});

describe('nom du fichier envoyé', () => {
  it('reprend la racine et annonce le format réel', () => {
    expect(nomJpeg('limace.png')).toBe('limace.jpg');
    expect(nomJpeg('IMG_20260917_084512.HEIC')).toBe('IMG_20260917_084512.jpg');
  });

  it('supporte un nom sans extension ou tout en extension', () => {
    expect(nomJpeg('planche3')).toBe('planche3.jpg');
    expect(nomJpeg('.png')).toBe('photo.jpg');
  });

  it('ne coupe pas sur un point du chemin', () => {
    expect(nomJpeg('photos.du.champ/limace')).toBe('photos.du.champ/limace.jpg');
  });
});

describe('repli', () => {
  const fichier = (nom: string, type: string, octets = 1000) =>
    new File([new Uint8Array(octets)], nom, { type });

  it('rend le fichier tel quel quand le navigateur ne sait pas décoder', async () => {
    // L'environnement d'essai n'a ni `createImageBitmap` ni canevas : c'est exactement la
    // situation d'un vieux téléphone. Une photo un peu lourde vaut mieux qu'une photo
    // perdue — l'API la réduira à l'arrivée.
    const source = fichier('limace.jpg', 'image/jpeg');

    await expect(compresserPhoto(source)).resolves.toBe(source);
  });

  it('ne touche pas à ce qui n’est pas une image', async () => {
    const source = fichier('releve.pdf', 'application/pdf');

    await expect(compresserPhoto(source)).resolves.toBe(source);
  });
});
