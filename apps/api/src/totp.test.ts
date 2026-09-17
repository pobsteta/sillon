// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// L'algorithme est confronté aux vecteurs d'essai publiés par les RFC. C'est la raison
// d'être de cette implémentation : une bibliothèque, on ne peut que la croire.

import { describe, expect, it } from 'vitest';
import {
  CHIFFRES,
  codePour,
  depuisBase32,
  normaliserCodeSecours,
  nouveauSecret,
  nouveauxCodesSecours,
  NOMBRE_CODES_SECOURS,
  pasCourant,
  PERIODE,
  uriOtpauth,
  verifierCode,
  versBase32,
} from './totp.js';

describe('base32 (RFC 4648)', () => {
  // Vecteurs de la section 10 de la RFC, sans remplissage.
  const vecteurs: [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it.each(vecteurs)('encode %o', (clair, attendu) => {
    expect(versBase32(Buffer.from(clair))).toBe(attendu);
  });

  it.each(vecteurs)('décode vers %o', (clair, encode) => {
    expect(depuisBase32(encode).toString()).toBe(clair);
  });

  it('tolère les espaces, la casse et le remplissage', () => {
    // Les gens recopient le secret à la main, avec les espaces de l'affichage.
    expect(depuisBase32('mzxw 6ytb oi==').toString()).toBe('foobar');
  });

  it('refuse un caractère hors alphabet', () => {
    expect(() => depuisBase32('MZXW018')).toThrow(/Caractère invalide/);
  });
});

describe('codes TOTP (vecteurs de la RFC 6238)', () => {
  // La RFC utilise le secret ASCII « 12345678901234567890 ». Ses vecteurs SHA-1 portent
  // sur huit chiffres ; Sillon en affiche six, donc on compare les six derniers.
  const secret = Buffer.from('12345678901234567890');
  const vecteurs: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vecteurs)('à t=%i secondes', (secondes, attenduHuit) => {
    const pas = Math.floor(secondes / PERIODE);

    expect(codePour(secret, pas)).toBe(attenduHuit.slice(-CHIFFRES));
  });
});

describe('vérification d’un code', () => {
  const secret = nouveauSecret();
  const instant = new Date('2026-09-17T10:00:00Z');

  it('accepte le code du pas courant et rend ce pas', () => {
    const pas = pasCourant(instant);

    expect(verifierCode(secret, codePour(secret, pas), instant)).toBe(pas);
  });

  it('tolère une horloge en avance ou en retard d’un pas', () => {
    // Une horloge de téléphone mal réglée, ou le temps de recopier : ±30 secondes.
    const pas = pasCourant(instant);
    expect(verifierCode(secret, codePour(secret, pas - 1), instant)).toBe(pas - 1);
    expect(verifierCode(secret, codePour(secret, pas + 1), instant)).toBe(pas + 1);
  });

  it('refuse au-delà de la fenêtre', () => {
    const pas = pasCourant(instant);
    expect(verifierCode(secret, codePour(secret, pas - 2), instant)).toBeNull();
    expect(verifierCode(secret, codePour(secret, pas + 2), instant)).toBeNull();
  });

  it('refuse ce qui n’est pas six chiffres', () => {
    expect(verifierCode(secret, '12345', instant)).toBeNull();
    expect(verifierCode(secret, '1234567', instant)).toBeNull();
    expect(verifierCode(secret, 'abcdef', instant)).toBeNull();
    expect(verifierCode(secret, '', instant)).toBeNull();
  });

  it('tolère les espaces de la saisie', () => {
    const pas = pasCourant(instant);
    const code = codePour(secret, pas);

    expect(verifierCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, instant)).toBe(pas);
  });

  it('rend le pas employé, de quoi refuser un rejeu', () => {
    // Un code intercepté reste valable une demi-minute : c'est en mémorisant le pas que
    // l'appelant peut refuser de le voir servir deux fois.
    const pas = pasCourant(instant);

    expect(verifierCode(secret, codePour(secret, pas), instant)).toBe(pas);
  });
});

describe('URI otpauth', () => {
  it('porte tout ce qu’attend une application d’authentification', () => {
    const secret = Buffer.from('12345678901234567890');

    const uri = new URL(uriOtpauth(secret, 'maraichere@example.org'));

    expect(uri.protocol).toBe('otpauth:');
    expect(decodeURIComponent(uri.pathname)).toBe('/Sillon:maraichere@example.org');
    expect(uri.searchParams.get('secret')).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(uri.searchParams.get('issuer')).toBe('Sillon');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });
});

describe('codes de secours', () => {
  it('en remet dix, tous différents', () => {
    const codes = nouveauxCodesSecours();

    expect(codes).toHaveLength(NOMBRE_CODES_SECOURS);
    expect(new Set(codes).size).toBe(NOMBRE_CODES_SECOURS);
  });

  it('les présente lisibles, et sans signe ambigu', () => {
    // Ils seront recopiés d'un papier : ni 0/O ni 1/I, et deux groupes de quatre.
    for (const code of nouveauxCodesSecours()) {
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    }
  });

  it('se compare sans tenir compte des tirets ni de la casse', () => {
    expect(normaliserCodeSecours('abcd-2345')).toBe('ABCD2345');
    expect(normaliserCodeSecours('ABCD 2345')).toBe('ABCD2345');
  });
});
