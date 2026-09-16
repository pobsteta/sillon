// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  formatLength,
  formatSpacing,
  parseAmount,
  parseLengthMeters,
  parseSpacingCentimeters,
} from './money.js';

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

describe('longueurs en millimètres', () => {
  it('convertit les mètres saisis en millimètres entiers', () => {
    expect(parseLengthMeters('12,5')).toBe(12_500);
    expect(parseLengthMeters('30')).toBe(30_000);
    expect(parseLengthMeters('x')).toBeNull();
  });

  it('affiche les millimètres en mètres', () => {
    expect(formatLength(12_500)).toBe('12,5 m');
    // Le millimètre est conservé : c'est ce qui permet de reprendre une donnée Brinjel.
    expect(formatLength(30_005)).toBe('30,005 m');
  });
});

describe('espacements en dixièmes de millimètre', () => {
  it('convertit les centimètres saisis', () => {
    expect(parseSpacingCentimeters('4')).toBe(400);
    expect(parseSpacingCentimeters('2,5')).toBe(250);
  });

  it('affiche les dixièmes de millimètre en centimètres', () => {
    expect(formatSpacing(400)).toBe('4 cm');
    expect(formatSpacing(250)).toBe('2,5 cm');
  });
});
