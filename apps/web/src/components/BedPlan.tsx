// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Plan d'assolement : chaque planche est une bande dont la longueur représente les
// centimètres disponibles, remplie par les séries qui l'occupent sur la période affichée.
//
// Le brief (§3.3, §7.2) veut deux gestes pour un même résultat : glisser-déposer au bureau,
// désignation au doigt sur le téléphone. Ils partagent ici le même chemin — `onDropOnBed`
// est appelé par le dépôt comme par le bouton « Placer ici ». Le bouton n'est pas un
// pis-aller mobile : c'est aussi le seul chemin praticable au clavier, et le glisser-déposer
// natif HTML ne répond pas au toucher.

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

/** Série en cours de placement : venue du panneau « à placer », ou saisie sur une planche. */
export interface PlacementEnCours {
  plantingId: number;
  name: string;
  /** Planche d'où le tronçon a été saisi ; `null` si la série n'était pas encore placée. */
  sourceLocationId: number | null;
}

export function BedPlan({
  locations,
  occupations,
  onSelectPlanting,
  onSelectBed,
  placing = null,
  onGrabPlaced,
  onDropOnBed,
}: {
  locations: LocationNode[];
  occupations: BedOccupation[];
  onSelectPlanting?: (plantingId: number) => void;
  onSelectBed?: (locationId: number) => void;
  /** Série en attente d'une planche ; les planches deviennent alors des cibles. */
  placing?: PlacementEnCours | null;
  /** Saisie d'un tronçon déjà posé, pour le déplacer ailleurs. */
  onGrabPlaced?: (occupation: BedOccupation) => void;
  onDropOnBed?: (locationId: number) => void;
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

        const cible = placing !== null && onDropOnBed !== undefined;

        return (
          <li
            key={bed.id}
            className={`card${cible ? ' ring-2 ring-sillon-400' : ''}`}
            // `preventDefault` sur le survol est ce qui autorise le dépôt : sans lui, le
            // navigateur refuse la cible et le curseur affiche un panneau d'interdiction.
            onDragOver={cible ? (event) => event.preventDefault() : undefined}
            onDrop={
              cible
                ? (event) => {
                    event.preventDefault();
                    onDropOnBed(bed.id);
                  }
                : undefined
            }
          >
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
                  draggable={onGrabPlaced !== undefined}
                  onDragStart={() => onGrabPlaced?.(occupation)}
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

            {cible ? (
              <button
                type="button"
                className="btn-ghost no-print mt-2 w-full"
                onClick={() => onDropOnBed(bed.id)}
              >
                {t('beds.placeHere')}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
