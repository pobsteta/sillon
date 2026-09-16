// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les unités de stockage sont la fondation de tous les calculs : une erreur de facteur
// ici fausse silencieusement chaque quantité affichée à un maraîcher.

import { describe, expect, it } from 'vitest';
import {
  centimetersToTenthsOfMillimeter,
  metersToMillimeters,
  millimetersToMeters,
  minutesToSeconds,
  parseDecimal,
  secondsToMinutes,
  seedsPerGramToStorage,
  storageToSeedsPerGram,
  tenthsOfMillimeterToCentimeters,
  thousandthsToUnits,
  unitsToThousandths,
} from './units.js';

describe('conversions de stockage', () => {
  it('convertit les longueurs au millimètre, dans les deux sens', () => {
    expect(metersToMillimeters(30)).toBe(30_000);
    expect(metersToMillimeters(0.5)).toBe(500);
    expect(millimetersToMeters(30_005)).toBe(30.005);
  });

  it('convertit les espacements au dixième de millimètre', () => {
    expect(centimetersToTenthsOfMillimeter(4)).toBe(400);
    expect(centimetersToTenthsOfMillimeter(2.5)).toBe(250);
    expect(tenthsOfMillimeterToCentimeters(400)).toBe(4);
  });

  it('convertit les rendements au millième d’unité', () => {
    expect(unitsToThousandths(2.5)).toBe(2_500);
    expect(thousandthsToUnits(2_500)).toBe(2.5);
  });

  it('stocke la densité de semences en graines par kilogramme', () => {
    expect(seedsPerGramToStorage(300)).toBe(300_000);
    expect(storageToSeedsPerGram(300_000)).toBe(300);
  });

  it('convertit les temps de travail en secondes', () => {
    expect(minutesToSeconds(90)).toBe(5_400);
    expect(secondsToMinutes(5_400)).toBe(90);
  });

  it('arrondit à l’entier le plus proche plutôt que de tronquer', () => {
    // 30,0004 m ne peut pas se stocker au millimètre près : on arrondit, sans perdre
    // un millimètre entier comme le ferait une troncature.
    expect(metersToMillimeters(30.0004)).toBe(30_000);
    expect(metersToMillimeters(30.0006)).toBe(30_001);
  });
});

describe('saisie décimale', () => {
  it('accepte la virgule comme le point', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal(' 30 ')).toBe(30);
  });

  it('refuse ce qui n’est pas un nombre positif', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
});
