// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Normalisation des photos et choix du stockage.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_PHOTO_PIXELS, normalizePhoto, PHOTO_CONTENT_TYPE } from './images.js';
import { createStorage, LocalStorage, S3Storage, type PhotoStorage } from './storage.js';
import { loadEnv, type Env } from './env.js';

/** Image unie aux dimensions demandées, dans le format demandé. */
function image(
  width: number,
  height: number,
  format: 'jpeg' | 'png' = 'jpeg',
): ReturnType<typeof sharp> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 90, g: 140, b: 60 } },
  })[format]();
}

function env(overrides: Partial<Env> = {}): Env {
  return { ...loadEnv(), ...overrides };
}

describe('normalisation des photos', () => {
  it('réduit une photo de téléphone au côté long retenu', async () => {
    const source = await image(3000, 2000).toBuffer();

    const { width, height, contentType } = await normalizePhoto(source);

    expect(width).toBe(MAX_PHOTO_PIXELS);
    // Les proportions sont conservées : 3000×2000 tient dans 2048×1365.
    expect(height).toBe(1365);
    expect(contentType).toBe(PHOTO_CONTENT_TYPE);
  });

  it('allège nettement le fichier', async () => {
    // Une photo de plein champ, bruitée comme une vraie : du vert uni se compresserait
    // si bien que la comparaison ne voudrait rien dire.
    const bruit = Buffer.alloc(3000 * 2000 * 3);
    for (let i = 0; i < bruit.length; i += 1) bruit[i] = (i * 2654435761) % 256;
    const source = await sharp(bruit, { raw: { width: 3000, height: 2000, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer();

    const { content } = await normalizePhoto(source);

    expect(content.byteLength).toBeLessThan(source.byteLength / 2);
  });

  it('laisse une petite image à sa taille, sans l’agrandir', async () => {
    const source = await image(640, 480).toBuffer();

    const { width, height } = await normalizePhoto(source);

    expect({ width, height }).toEqual({ width: 640, height: 480 });
  });

  it('réencode en JPEG quel que soit le format reçu', async () => {
    const source = await image(800, 600, 'png').toBuffer();

    const { content, contentType } = await normalizePhoto(source);

    expect(contentType).toBe('image/jpeg');
    expect((await sharp(content).metadata()).format).toBe('jpeg');
  });

  it('retire les métadonnées, coordonnées GPS comprises', async () => {
    // Une photo prise au champ porte la position de la parcelle. La republier à qui peut
    // lire la note serait une fuite — et personne ne l'aurait demandé.
    const source = await image(800, 600)
      .withExif({
        IFD0: { Make: 'Sillon', Model: 'Téléphone de terrain' },
        IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const { content } = await normalizePhoto(source);

    expect((await sharp(content).metadata()).exif).toBeUndefined();
  });

  it('applique l’orientation EXIF au lieu de la perdre', async () => {
    // Orientation 6 : le téléphone a été tenu debout, les pixels sont couchés. Retirer
    // l'étiquette sans tourner les pixels donnerait une photo à l'envers — le défaut
    // classique, et d'autant plus vicieux qu'il n'apparaît qu'après coup.
    const source = await image(800, 600).withMetadata({ orientation: 6 }).toBuffer();

    const { width, height } = await normalizePhoto(source);

    expect({ width, height }).toEqual({ width: 600, height: 800 });
  });

  it('refuse un contenu qui n’est pas une image', async () => {
    // Le type déclaré par le navigateur ne prouve rien : un PDF renommé passe le premier
    // tri. C'est sharp qui tranche.
    await expect(normalizePhoto(Buffer.from('%PDF-1.7 ceci n’est pas une photo'))).rejects.toThrow(
      /Image illisible/,
    );
  });
});

describe('choix du stockage', () => {
  it('reste sur disque tant qu’aucun seau n’est décrit', () => {
    expect(createStorage(env({ S3_BUCKET: undefined }))).toBeInstanceOf(LocalStorage);
  });

  it('bascule sur S3 dès que le seau est nommé', () => {
    const storage = createStorage(
      env({
        S3_BUCKET: 'sillon-photos',
        S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
        S3_ACCESS_KEY_ID: 'cle',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    );
    expect(storage).toBeInstanceOf(S3Storage);
  });
});

describe('stockage local', () => {
  it('écrit puis relit, et oublie sans broncher', async () => {
    // Typé par l'interface : c'est elle que les routes manipulent, et elle seule qui
    // décrit le troisième argument.
    const storage: PhotoStorage = new LocalStorage(
      await mkdtemp(join(tmpdir(), 'sillon-stockage-')),
    );

    await storage.put('7/abc', Buffer.from('photo'), 'image/jpeg');
    expect((await storage.get('7/abc')).toString()).toBe('photo');

    await storage.remove('7/abc');
    // Supprimer deux fois ne doit pas lever : la route supprime la ligne puis l'objet.
    await expect(storage.remove('7/abc')).resolves.toBeUndefined();
  });

  it('refuse une clé qui sortirait du dossier', async () => {
    const storage: PhotoStorage = new LocalStorage(
      await mkdtemp(join(tmpdir(), 'sillon-stockage-')),
    );

    await expect(storage.get('../../etc/passwd')).rejects.toThrow(/Clé de stockage invalide/);
  });
});
