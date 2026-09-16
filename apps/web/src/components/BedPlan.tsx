// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Plan d'assolement : chaque planche est une bande dont la longueur représente les
// centimètres disponibles, remplie par les séries qui l'occupent sur la période affichée.

import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { formatLength } from '../lib/format.js';
import type { LocationNode } from '../lib/types.js';

export interface BedOccupation {
  plantingId: number;
  locationId: number;
  length: number;
  range: { begin: string; end: string };
  cropName: string | null;
  varietyName: string | null;
  color: string;
}

export function BedPlan({
  locations,
  occupations,
  onSelectPlanting,
  onSelectBed,
}: {
  locations: LocationNode[];
  occupations: BedOccupation[];
  onSelectPlanting?: (plantingId: number) => void;
  onSelectBed?: (locationId: number) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const beds = locations.filter((location) => location.bedLength > 0);

  if (beds.length === 0) return null;

  return (
    <ul className="space-y-3">
      {beds.map((bed) => {
        const onBed = occupations.filter((occupation) => occupation.locationId === bed.id);
        const used = onBed.reduce((total, occupation) => total + occupation.length, 0);
        const free = Math.max(0, bed.bedLength - used);

        return (
          <li key={bed.id} className="card">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <button
                type="button"
                className="text-left text-sm font-semibold hover:underline"
                onClick={() => onSelectBed?.(bed.id)}
              >
                {bed.name}
                {bed.greenhouse ? (
                  <span className="ml-2 chip bg-sillon-100 text-sillon-800">
                    {t('beds.greenhouse')}
                  </span>
                ) : null}
              </button>
              <span className="text-xs text-earth-700 dark:text-earth-200">
                {formatLength(free, locale)} {t('beds.available').toLowerCase()} /{' '}
                {formatLength(bed.bedLength, locale)}
              </span>
            </div>

            <div className="flex h-9 w-full overflow-hidden rounded-lg bg-earth-100 dark:bg-earth-700">
              {onBed.map((occupation) => (
                <button
                  key={`${occupation.plantingId}-${occupation.locationId}`}
                  type="button"
                  onClick={() => onSelectPlanting?.(occupation.plantingId)}
                  title={`${occupation.cropName ?? ''} ${occupation.varietyName ?? ''}`.trim()}
                  className="flex min-w-0 items-center justify-center truncate px-1 text-[11px] font-medium text-white"
                  style={{
                    width: `${Math.min(100, (occupation.length / bed.bedLength) * 100)}%`,
                    backgroundColor: occupation.color,
                  }}
                >
                  <span className="truncate">{occupation.cropName}</span>
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
