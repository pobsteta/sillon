// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Normalisation des photos à l'arrivée (§6 du brief : « redimensionnement à l'upload »).
//
// Trois choses se jouent ici, et aucune n'est cosmétique :
//
//   * l'orientation. Un téléphone n'oriente pas les pixels, il pose une étiquette EXIF.
//     Redimensionner sans la lire donne une photo couchée ; `rotate()` sans argument
//     applique l'étiquette puis la retire, ce qui remet l'image d'aplomb pour de bon.
//   * les métadonnées. Une photo prise au champ porte les coordonnées GPS de la parcelle,
//     la marque du téléphone et l'heure à la seconde. Les republier à qui peut lire la
//     note serait une fuite ; sharp ne les recopie pas, sauf `withMetadata()` — qu'on
//     n'appelle donc pas.
//   * la taille. Une photo de téléphone pèse aujourd'hui 4 à 8 Mo pour 4000 pixels de
//     large. Au champ, sur un réseau qui hoquette, la recharger coûte cher. 2048 pixels
//     suffisent à reconnaître un ravageur en zoomant, et pèsent dix fois moins.

import sharp from 'sharp';
import { badRequest } from './errors.js';

/** Côté le plus long, en pixels, au-delà duquel l'image est réduite. */
export const MAX_PHOTO_PIXELS = 2048;

/** Qualité JPEG. 82 est le point où l'on cesse de voir la différence sans y regarder. */
const JPEG_QUALITY = 82;

/**
 * Tout est réencodé en JPEG. Un format unique à la sortie vaut mieux qu'un format conservé :
 * le stockage devient homogène, et le type servi n'est plus une devinette. Le JPEG est
 * préféré au WebP parce que le brief compte parmi ses utilisateurs des « appareils parfois
 * anciens ou bas de gamme », et qu'une photo qu'on ne peut pas ouvrir ne vaut rien.
 */
export const PHOTO_CONTENT_TYPE = 'image/jpeg';

export interface NormalizedPhoto {
  content: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/**
 * Réduit, réoriente et réencode une photo. Lève une 400 si le contenu n'est pas une image
 * que sharp sache lire — un fichier renommé `.jpg` n'est pas une photo, et le type déclaré
 * par le navigateur ne prouve rien.
 */
export async function normalizePhoto(content: Buffer): Promise<NormalizedPhoto> {
  try {
    const { data, info } = await sharp(content, { failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_PHOTO_PIXELS,
        height: MAX_PHOTO_PIXELS,
        fit: 'inside',
        // Une photo déjà petite est laissée telle quelle : l'agrandir n'inventerait que du flou.
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      content: data,
      contentType: PHOTO_CONTENT_TYPE,
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    throw badRequest(
      `Image illisible : ${error instanceof Error ? error.message : 'format non reconnu'}`,
    );
  }
}
