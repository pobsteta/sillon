// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  deriveDates,
  deriveDurations,
  fieldDate,
  fieldDateType,
  isActiveOn,
  occupationRange,
  occupiesField,
  shiftHarvestPeriods,
  shiftPlantingDates,
  usesNursery,
  usesSeeds,
} from './planting.js';
import { PlantingDateType, PlantingType } from './types.js';

const durations = {
  days_to_transplant: 35,
  days_to_maturity: 60,
  harvest_window: 45,
};

describe('chaîne des dates', () => {
  it('déroule une série repiquée : semis, plantation, puis période de récolte', () => {
    const derived = deriveDates('2026-03-01', PlantingType.transplantRaised, durations);
    expect(derived.dates).toEqual({
      sowing: '2026-03-01',
      planting: '2026-04-05', // semis + 35 jours de pépinière
    });
    // La maturité se compte depuis la mise en place, donc depuis la plantation.
    expect(derived.harvestPeriod).toEqual({ begin: '2026-06-04', end: '2026-07-19' });
  });

  it('compte la maturité depuis le semis pour un semis direct, sans date de plantation', () => {
    const derived = deriveDates('2026-04-05', PlantingType.directSeeded, durations);
    expect(derived.dates).toEqual({ sowing: '2026-04-05' });
    expect(derived.harvestPeriod).toEqual({ begin: '2026-06-04', end: '2026-07-19' });
  });

  it('ne donne aucune récolte à une production de plants', () => {
    const derived = deriveDates('2026-03-01', PlantingType.seedling, durations);
    expect(derived.dates).toEqual({ sowing: '2026-03-01' });
    expect(derived.harvestPeriod).toBeNull();
  });

  it('n’invente pas de récolte quand la durée de maturité manque', () => {
    const derived = deriveDates('2026-03-01', PlantingType.directSeeded, {});
    expect(derived.harvestPeriod).toBeNull();
  });

  it('retrouve les durées à partir des dates et de la période de récolte', () => {
    expect(
      deriveDurations(
        {
          sowing: { planned: '2026-03-01' },
          planting: { planned: '2026-04-05' },
        },
        PlantingType.transplantRaised,
        { begin: '2026-06-04', end: '2026-07-19' },
      ),
    ).toEqual(durations);
  });
});

describe('mise en place au champ', () => {
  it('désigne la plantation pour une série repiquée, le semis pour un semis direct', () => {
    expect(fieldDateType(PlantingType.transplantRaised)).toBe(PlantingDateType.planting);
    expect(fieldDateType(PlantingType.transplantBought)).toBe(PlantingDateType.planting);
    expect(fieldDateType(PlantingType.directSeeded)).toBe(PlantingDateType.sowing);
    expect(fieldDateType(PlantingType.seedling)).toBeNull();
  });

  it('préfère la date réalisée à la date prévue', () => {
    const dates = {
      sowing: { planned: '2026-03-01' },
      planting: { planned: '2026-04-05', effective: '2026-04-12' },
    };
    expect(fieldDate(dates, PlantingType.transplantRaised)).toBe('2026-04-12');
  });

  it('classe les modes d’implantation', () => {
    expect(usesNursery(PlantingType.transplantRaised)).toBe(true);
    expect(usesNursery(PlantingType.transplantBought)).toBe(false);
    expect(usesSeeds(PlantingType.transplantBought)).toBe(false);
    expect(occupiesField(PlantingType.seedling)).toBe(false);
  });
});

describe('décalage et occupation', () => {
  const dates = {
    sowing: { planned: '2026-03-01', effective: '2026-03-03' },
    planting: { planned: '2026-04-05' },
  };
  const periods = [{ begin: '2026-06-04', end: '2026-07-19' }];

  it('décale les dates prévues sans toucher aux dates réalisées', () => {
    const shifted = shiftPlantingDates(dates, 7);
    expect(shifted.sowing).toEqual({ planned: '2026-03-08', effective: '2026-03-03' });
    expect(shifted.planting?.planned).toBe('2026-04-12');
    expect(shiftHarvestPeriods(periods, 7)).toEqual([{ begin: '2026-06-11', end: '2026-07-26' }]);
  });

  it('occupe la planche de la mise en place au dernier jour de récolte', () => {
    const range = occupationRange(dates, PlantingType.transplantRaised, periods);
    expect(range).toEqual({ begin: '2026-04-05', end: '2026-07-19' });
    expect(isActiveOn(dates, PlantingType.transplantRaised, periods, '2026-04-04')).toBe(false);
    expect(isActiveOn(dates, PlantingType.transplantRaised, periods, '2026-07-19')).toBe(true);
  });

  it('n’occupe aucune planche pour une production de plants', () => {
    expect(occupationRange(dates, PlantingType.seedling, periods)).toBeNull();
  });

  it('retient la fin de la dernière fenêtre quand la série en compte plusieurs', () => {
    const range = occupationRange(dates, PlantingType.transplantRaised, [
      { begin: '2026-06-04', end: '2026-07-19' },
      { begin: '2026-09-01', end: '2026-09-30' },
    ]);
    expect(range?.end).toBe('2026-09-30');
  });
});
