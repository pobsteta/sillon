// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Compression des photos avant téléversement (§7.3 du brief : « prise de photo directe
// depuis l'app, compression côté client »).
//
// L'API réduit déjà les photos à l'arrivée. Ce n'est pas le même problème : là-bas on
// protège le stockage, ici on protège le **transfert**. Au champ, sur un partage de
// connexion qui hoquette, envoyer 6 Mo prend une minute et échoue une fois sur trois ;
// en envoyer 400 Ko passe. C'est le seul endroit où l'on puisse y faire quelque chose,
// puisque le serveur ne voit la photo qu'une fois arrivée.
//
// Rien n'est promis pour autant : un navigateur sans `createImageBitmap`, une image que
// le décodeur refuse (HEIC sur un appareil qui ne le convertit pas), un canevas qui
// échoue — dans tous ces cas on renvoie le fichier d'origine plutôt que rien. L'API
// s'en chargera. Une photo un peu lourde vaut mieux qu'une photo perdue.

/** Côté le plus long visé, en pixels. Même valeur que l'API : au-delà, on transporte du vide. */
export const MAX_PHOTO_PIXELS = 2048;

/** Qualité JPEG, alignée sur celle du serveur. */
const JPEG_QUALITY = 0.82;

/**
 * Dimensions après réduction, proportions conservées. Une image déjà plus petite que la
 * cible est rendue telle quelle : l'agrandir n'inventerait que du flou et des octets.
 */
export function dimensionsReduites(
  width: number,
  height: number,
  max = MAX_PHOTO_PIXELS,
): { width: number; height: number } {
  const cote = Math.max(width, height);
  if (cote <= max) return { width, height };
  const facteur = max / cote;
  // `round` plutôt que `floor` : sur une image très allongée, tronquer ferait perdre
  // un pixel de chaque côté et décalerait le rapport d'aspect.
  return {
    width: Math.max(1, Math.round(width * facteur)),
    height: Math.max(1, Math.round(height * facteur)),
  };
}

/**
 * Faut-il envoyer la version compressée ? Non si elle est plus lourde — ce qui arrive pour
 * une capture d'écran, un dessin à plat, ou une photo déjà bien compressée : le JPEG ne
 * sait pas faire mieux qu'un PNG sur de grands aplats. On ne va pas alourdir un envoi au
 * prétexte de l'alléger.
 */
export function vautLaPeine(tailleOrigine: number, tailleCompressee: number): boolean {
  return tailleCompressee > 0 && tailleCompressee < tailleOrigine;
}

/** Nom du fichier compressé : même racine, extension du format réellement envoyé. */
export function nomJpeg(nom: string): string {
  const racine = nom.replace(/\.[^./\\]+$/, '');
  return `${racine || 'photo'}.jpg`;
}

/** Le navigateur sait-il faire ? Sinon on n'essaie même pas. */
function outillageDisponible(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

function versBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

/**
 * Réduit et réencode une photo avant envoi. Renvoie le fichier d'origine dès que quelque
 * chose se dérobe — c'est la bonne réponse : l'API sait normaliser ce qu'elle reçoit.
 */
export async function compresserPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || !outillageDisponible()) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    // `imageOrientation: 'from-image'` applique l'étiquette EXIF au décodage. Sans elle,
    // le canevas dessine les pixels tels quels et la photo part couchée — l'étiquette,
    // elle, ne survit pas au réencodage.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = dimensionsReduites(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const contexte = canvas.getContext('2d');
    if (!contexte) return file;
    contexte.drawImage(bitmap, 0, 0, width, height);

    const blob = await versBlob(canvas);
    if (!blob || !vautLaPeine(file.size, blob.size)) return file;

    return new File([blob], nomJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
