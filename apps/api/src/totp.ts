// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Second facteur par code temporaire (§6 du brief : « TOTP optionnel »). Les tables
// `totp_settings` et `totp_recovery_codes` existent depuis le portage du schéma de
// Brinjel ; il ne manquait que la logique.
//
// L'algorithme est écrit ici plutôt qu'emprunté à une bibliothèque, pour une raison qui
// n'est pas l'économie d'une dépendance : la RFC 6238 publie des vecteurs d'essai, et une
// implémentation qu'on peut leur confronter vaut mieux qu'une boîte noire qu'on ne peut
// que croire. Ils sont dans `totp.test.ts`.
//
// Le secret est rangé tel quel, en octets, comme le prévoit le schéma d'origine. Le
// chiffrer au repos supposerait une clé à gérer : liée à `SESSION_SECRET`, sa rotation —
// aujourd'hui sans conséquence, elle ne fait que déconnecter — enfermerait tout le monde
// dehors. Le choix est donc assumé : la base doit être protégée comme elle l'est déjà pour
// le reste des données d'une ferme.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Longueur du secret, en octets. 20 = 160 bits, ce que recommande la RFC 4226. */
const TAILLE_SECRET = 20;

/** Pas de temps, en secondes. Trente : la valeur qu'attendent toutes les applications. */
export const PERIODE = 30;

/** Nombre de chiffres du code. */
export const CHIFFRES = 6;

/**
 * Nombre de pas tolérés de part et d'autre. Un seul, soit ±30 secondes : de quoi absorber
 * une horloge de téléphone mal réglée et le temps de recopier le code, sans multiplier les
 * codes valables à un instant donné.
 */
const FENETRE = 1;

const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 sans remplissage (RFC 4648) : la forme qu'attendent les applications d'authentification. */
export function versBase32(octets: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET_BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET_BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}

/** Lecture inverse. Les espaces et la casse sont tolérés : les gens recopient à la main. */
export function depuisBase32(texte: string): Buffer {
  const propre = texte.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const caractere of propre) {
    const index = ALPHABET_BASE32.indexOf(caractere);
    if (index < 0) throw new Error(`Caractère invalide dans le secret : ${caractere}`);
    valeur = (valeur << 5) | index;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

export function nouveauSecret(): Buffer {
  return randomBytes(TAILLE_SECRET);
}

/**
 * Code attendu pour un pas de temps donné. HMAC-SHA1 puis troncature dynamique, comme le
 * décrit la RFC 4226 : les quatre derniers bits du condensat désignent où lire.
 */
export function codePour(secret: Buffer, pas: number): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));

  const condensat = createHmac('sha1', secret).update(compteur).digest();
  const decalage = condensat[condensat.length - 1]! & 0x0f;
  const tronque =
    ((condensat[decalage]! & 0x7f) << 24) |
    (condensat[decalage + 1]! << 16) |
    (condensat[decalage + 2]! << 8) |
    condensat[decalage + 3]!;

  return String(tronque % 10 ** CHIFFRES).padStart(CHIFFRES, '0');
}

/** Pas de temps courant. */
export function pasCourant(maintenant: Date = new Date()): number {
  return Math.floor(maintenant.getTime() / 1000 / PERIODE);
}

/**
 * Le code est-il valable ? Renvoie le pas qui a servi, `null` sinon — l'appelant le garde
 * pour refuser un rejeu : un code intercepté reste valable une demi-minute, et rien
 * n'empêcherait de s'en servir deux fois.
 */
export function verifierCode(
  secret: Buffer,
  code: string,
  maintenant: Date = new Date(),
): number | null {
  const propose = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(propose)) return null;

  const courant = pasCourant(maintenant);
  for (let ecart = -FENETRE; ecart <= FENETRE; ecart += 1) {
    const pas = courant + ecart;
    // Comparaison à temps constant : comparer deux chaînes de six chiffres avec `===`
    // laisse fuir, par le temps de réponse, combien de chiffres étaient bons.
    const attendu = Buffer.from(codePour(secret, pas));
    const recu = Buffer.from(propose);
    if (attendu.length === recu.length && timingSafeEqual(attendu, recu)) return pas;
  }
  return null;
}

/** URI `otpauth://` : ce que contient le QR code présenté à l'enrôlement. */
export function uriOtpauth(secret: Buffer, compte: string, emetteur = 'Sillon'): string {
  const parametres = new URLSearchParams({
    secret: versBase32(secret),
    issuer: emetteur,
    algorithm: 'SHA1',
    digits: String(CHIFFRES),
    period: String(PERIODE),
  });
  return `otpauth://totp/${encodeURIComponent(emetteur)}:${encodeURIComponent(compte)}?${parametres.toString()}`;
}

/** Nombre de codes de secours remis à l'activation. */
export const NOMBRE_CODES_SECOURS = 10;

/**
 * Codes de secours : dix groupes de dix signes, lisibles et transcrivables. Ils servent
 * quand le téléphone est perdu, cassé ou resté à la maison — c'est-à-dire exactement au
 * moment où l'on n'a pas envie de se battre avec un support.
 */
export function nouveauxCodesSecours(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < NOMBRE_CODES_SECOURS; i += 1) {
    // Base32 sur cinq octets donne huit signes sans ambiguïté (ni 0/O ni 1/I),
    // présentés en deux groupes de quatre.
    const brut = versBase32(randomBytes(5)).slice(0, 8);
    codes.push(`${brut.slice(0, 4)}-${brut.slice(4)}`);
  }
  return codes;
}

/** Forme comparable d'un code de secours : sans tiret, sans espace, en majuscules. */
export function normaliserCodeSecours(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}
