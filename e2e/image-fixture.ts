// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fabrique une photo volumineuse pour les parcours. Un PNG de 1×1 pixel suffit à franchir
// les contrôles de l'API, mais pas à exercer la compression côté client : elle ne s'applique
// qu'au-delà de 2 048 pixels, et rend le fichier d'origine quand le réencodage l'alourdit.
//
// Le PNG est écrit à la main plutôt que produit par une bibliothèque : les parcours
// tourneraient sinon avec une dépendance d'image de plus, pour un fichier de quatre blocs.
// Le bruit est indispensable — un aplat uni se compresserait si bien que le JPEG serait
// plus lourd, et la compression rendrait l'original.

import { deflateSync } from 'node:zlib';

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const octet of data) c = TABLE_CRC[(c ^ octet) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Bloc PNG : longueur, type, données, CRC du type et des données. */
function bloc(type: string, data: Buffer): Buffer {
  const entete = Buffer.alloc(8);
  entete.writeUInt32BE(data.length, 0);
  entete.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([entete.subarray(4), data])), 0);
  return Buffer.concat([entete, data, crc]);
}

/** PNG en vraies couleurs, bruité, aux dimensions demandées. */
export function grandePhotoPng(width = 2600, height = 1800): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // couleurs vraies, sans alpha
  // Les trois derniers octets — compression, filtre, entrelacement — restent à zéro.

  // Une ligne PNG commence par son octet de filtre (0 : aucun), suivi des pixels RVB.
  const ligne = width * 3 + 1;
  const brut = Buffer.alloc(ligne * height);
  for (let y = 0; y < height; y += 1) {
    const debut = y * ligne;
    for (let x = 0; x < width; x += 1) {
      const p = debut + 1 + x * 3;
      // Suite pseudo-aléatoire reproductible : même image à chaque exécution, donc même
      // poids, mais assez bruitée pour que le JPEG soit franchement plus léger.
      const bruit = (x * 2654435761 + y * 40503) >>> 0;
      brut[p] = bruit & 0xff;
      brut[p + 1] = (bruit >>> 8) & 0xff;
      brut[p + 2] = (bruit >>> 16) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut, { level: 1 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}
