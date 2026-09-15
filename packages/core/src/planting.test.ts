// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  anchorDateType,
  deriveDates,
  deriveDurations,
  isActiveOn,
  occupationRange,
  shiftPlantingDates,
} from './planting.js';
import { PlantingDateType, PlantingDurationType, PlantingType } from './types.js';

const durations = {
  [PlantingDurationType.greenhouse]: 35,
  [PlantingDurationType.toHarvest]: 60,
  [PlantingDurationType.harvest]: 45,
};

describe('chaîne des dates', () => {
  it('déroule une série repiquée depuis le semis en pépinière', () => {
    const dates = deriveDates('2026-03-01', PlantingType.transplantRaised, durations);
    expect(dates).toEqual({
      greenhouse_sowing: '2026-03-01',
      sowing_planting: '2026-04-05',
      harvest_begin: '2026-06-04',
      harvest_end: '2026-07-19',
    });
  });

  it('ignore la durée de pépinière pour un semis direct', () => {
    const dates = deriveDates('2026-04-05', PlantingType.directSeed, durations);
    expect(dates).toEqual({
      sowing_planting: '2026-04-05',
      harvest_begin: '2026-06-04',
      harvest_end: '2026-07-19',
    });
    expect(anchorDateType(PlantingType.directSeed)).toBe(PlantingDateType.sowingPlanting);
  });

  it('retrouve les durées à partir des dates (aller-retour)', () => {
    expect(
      deriveDurations({
        greenhouse_sowing: { planned: '2026-03-01' },
        sowing_planting: { planned: '2026-04-05' },
        harvest_begin: { planned: '2026-06-04' },
        harvest_end: { planned: '2026-07-19' },
      }),
    ).toEqual(durations);
  });
});

describe('décalage et occupation', () => {
  const dates = {
    greenhouse_sowing: { planned: '2026-03-01', effective: '2026-03-03' },
    sowing_planting: { planned: '2026-04-05' },
    harvest_begin: { planned: '2026-06-04' },
    harvest_end: { planned: '2026-07-19' },
  };

  it('décale les dates prévues sans toucher aux dates réalisées', () => {
    const shifted = shiftPlantingDates(dates, 7);
    expect(shifted.greenhouse_sowing).toEqual({ planned: '2026-03-08', effective: '2026-03-03' });
    expect(shifted.harvest_end?.planned).toBe('2026-07-26');
  });

  it('occupe la planche de la mise en place à la fin de récolte', () => {
    expect(occupationRange(dates)).toEqual({ begin: '2026-04-05', end: '2026-07-19' });
    expect(isActiveOn(dates, '2026-04-04')).toBe(false);
    expect(isActiveOn(dates, '2026-04-05')).toBe(true);
    expect(isActiveOn(dates, '2026-07-19')).toBe(true);
  });

  it('préfère la date réalisée à la date prévue pour l’occupation', () => {
    const range = occupationRange({
      sowing_planting: { planned: '2026-04-05', effective: '2026-04-12' },
      harvest_end: { planned: '2026-07-19' },
    });
    expect(range).toEqual({ begin: '2026-04-12', end: '2026-07-19' });
  });
});
