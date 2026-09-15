// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Diagramme de Gantt des séries (§3.1). SVG dessiné à la main plutôt qu'une bibliothèque :
// quelques centaines de barres, un défilement horizontal fluide sur un téléphone d'entrée
// de gamme, et aucun poids supplémentaire à télécharger.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { addDays, daysBetween, type IsoDate } from '@sillon/core';
import type { GanttBar } from '../lib/types.js';
import { readableTextColor } from '../lib/format.js';

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const LABEL_WIDTH = 150;

export function GanttChart({
  bars,
  from,
  to,
  dayWidth = 3,
  onSelect,
}: {
  bars: GanttBar[];
  from: IsoDate;
  to: IsoDate;
  /** Largeur d'une journée en pixels : le zoom de la vue. */
  dayWidth?: number;
  onSelect?: (plantingId: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const totalDays = Math.max(daysBetween(from, to), 1);
  const width = LABEL_WIDTH + totalDays * dayWidth;
  const height = HEADER_HEIGHT + bars.length * ROW_HEIGHT;

  const months = useMemo(() => {
    const marks: { x: number; label: string }[] = [];
    let cursor = `${from.slice(0, 7)}-01`;
    while (cursor <= to) {
      const offset = daysBetween(from, cursor);
      if (offset >= 0) {
        marks.push({
          x: LABEL_WIDTH + offset * dayWidth,
          label: new Date(`${cursor}T12:00:00Z`).toLocaleDateString(locale, {
            month: 'short',
          }),
        });
      }
      const [year, month] = cursor.split('-').map(Number);
      cursor =
        month === 12 ? `${year! + 1}-01-01` : `${year}-${String(month! + 1).padStart(2, '0')}-01`;
    }
    return marks;
  }, [from, to, dayWidth, locale]);

  const x = (date: IsoDate) => LABEL_WIDTH + Math.max(0, daysBetween(from, date)) * dayWidth;
  const segment = (range: { begin: IsoDate; end: IsoDate }) => {
    const start = x(range.begin);
    return { x: start, width: Math.max(2, x(addDays(range.end, 1)) - start) };
  };

  if (bars.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white dark:border-earth-700 dark:bg-earth-800">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={t('planting.gantt')}
        className="min-w-full"
      >
        {months.map((month) => (
          <g key={month.x}>
            <line
              x1={month.x}
              y1={0}
              x2={month.x}
              y2={height}
              stroke="currentColor"
              className="text-earth-200 dark:text-earth-700"
            />
            <text x={month.x + 4} y={18} className="fill-current text-[11px]">
              {month.label}
            </text>
          </g>
        ))}

        {bars.map((bar, index) => {
          const y = HEADER_HEIGHT + index * ROW_HEIGHT;
          const growing = segment(bar.growing);
          const nursery = bar.nursery ? segment(bar.nursery) : null;
          const harvest = bar.harvest ? segment(bar.harvest) : null;
          const label = bar.varietyName ? `${bar.cropName} — ${bar.varietyName}` : bar.cropName;

          return (
            <g
              key={bar.plantingId}
              onClick={() => onSelect?.(bar.plantingId)}
              className={onSelect ? 'cursor-pointer' : undefined}
            >
              <title>
                {label} · {bar.growing.begin} → {bar.harvest?.end ?? bar.growing.end}
              </title>
              <rect
                x={0}
                y={y}
                width={width}
                height={ROW_HEIGHT}
                className={
                  index % 2 ? 'fill-black/[0.03] dark:fill-white/[0.03]' : 'fill-transparent'
                }
              />
              <text x={6} y={y + 19} className="fill-current text-[12px]">
                {label.length > 22 ? `${label.slice(0, 21)}…` : label}
              </text>

              {nursery ? (
                // La pépinière est hachurée : la planche n'est pas encore occupée.
                <rect
                  x={nursery.x}
                  y={y + 8}
                  width={nursery.width}
                  height={14}
                  rx={3}
                  fill={bar.color}
                  fillOpacity={0.3}
                  stroke={bar.color}
                  strokeDasharray="3 2"
                />
              ) : null}
              <rect
                x={growing.x}
                y={y + 8}
                width={growing.width}
                height={14}
                rx={3}
                fill={bar.color}
                fillOpacity={0.75}
              />
              {harvest ? (
                <rect
                  x={harvest.x}
                  y={y + 6}
                  width={harvest.width}
                  height={18}
                  rx={3}
                  fill={bar.color}
                  stroke={readableTextColor(bar.color) === '#ffffff' ? '#00000033' : '#ffffff66'}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
