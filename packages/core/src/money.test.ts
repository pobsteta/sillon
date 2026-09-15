// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatLength, parseAmount, parseLengthMeters } from './money.js';

describe('montants en centimes', () => {
  it('accepte la virgule, le point et les espaces', () => {
    expect(parseAmount('12,34')).toBe(1234);
    expect(parseAmount('12.3')).toBe(1230);
    expect(parseAmount(' 7 ')).toBe(700);
    expect(parseAmount('-2,50')).toBe(-250);
  });

  it('refuse ce qui n’est pas un montant à deux décimales', () => {
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('longueurs en centimètres', () => {
  it('convertit les mètres saisis en centimètres entiers', () => {
    expect(parseLengthMeters('12,5')).toBe(1250);
    expect(parseLengthMeters('30')).toBe(3000);
    expect(parseLengthMeters('x')).toBeNull();
  });

  it('affiche les centimètres en mètres', () => {
    expect(formatLength(1250)).toBe('12,5 m');
  });
});
