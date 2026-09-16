// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Statistiques : un graphique par écran sur mobile, tableau de bord sur PC.
// Les barres sont dessinées en CSS plutôt qu'avec une bibliothèque de graphiques,
// pour tenir la cible de page légère du §8.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { today } from '@sillon/core';
import { useFarmId } from '../lib/session.js';
import { useStats } from '../lib/queries.js';
import { EmptyState, Loading, PageHeader, Select, StatTile } from '../components/ui.js';
import { formatLaborTime, formatLength, formatMoney, formatQuantity } from '../lib/format.js';

export function StatsPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const currentYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const stats = useStats(farmId, year);

  if (stats.isLoading) return <Loading />;
  const data = stats.data;

  const maxYield = Math.max(
    1,
    ...(data?.crops ?? []).map((crop) => Math.max(crop.expectedYield, crop.actualYield)),
  );
  const maxLabor = Math.max(
    1,
    ...(data?.tasks.byType ?? []).map((entry) => Math.max(entry.planned, entry.effective)),
  );

  return (
    <>
      <PageHeader title={t('stats.title')}>
        <Select
          label={t('stats.season')}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </PageHeader>

      {!data || data.plantings.total === 0 ? (
        <EmptyState message={t('stats.empty')} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t('dashboard.seriesInSeason')} value={data.plantings.total} />
            <StatTile
              label={t('stats.tasksDone')}
              value={`${data.tasks.done} / ${data.tasks.total}`}
              hint={formatLaborTime(data.tasks.labor.effective)}
            />
            <StatTile
              label={t('stats.expected')}
              value={formatQuantity(data.yields.expected, locale)}
            />
            <StatTile
              label={t('stats.revenue')}
              value={formatMoney(data.yields.expectedRevenue, locale)}
            />
          </div>

          <section className="card mb-6">
            <h2 className="mb-3 text-lg font-semibold">{t('stats.yieldByCrop')}</h2>
            <ul className="space-y-3">
              {data.crops.map((crop) => (
                <li key={crop.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{crop.cropName}</span>
                    <span className="tabular-nums text-earth-700 dark:text-earth-200">
                      {formatQuantity(crop.actualYield, locale)} /{' '}
                      {formatQuantity(crop.expectedYield, locale, crop.unitName)}
                      {crop.comparison.differencePercentage === null
                        ? ''
                        : ` (${crop.comparison.differencePercentage > 0 ? '+' : ''}${crop.comparison.differencePercentage} %)`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 rounded bg-earth-100 dark:bg-earth-700">
                      <div
                        className="h-3 rounded bg-earth-200 dark:bg-earth-600"
                        style={{ width: `${(crop.expectedYield / maxYield) * 100}%` }}
                        title={t('stats.expected')}
                      />
                    </div>
                    <div className="h-3 rounded bg-earth-100 dark:bg-earth-700">
                      <div
                        className="h-3 rounded"
                        style={{
                          width: `${(crop.actualYield / maxYield) * 100}%`,
                          backgroundColor: crop.color,
                        }}
                        title={t('stats.actual')}
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
                    {crop.plantingCount} × {formatLength(crop.bedLength, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">{t('stats.laborByType')}</h2>
            <ul className="space-y-3">
              {data.tasks.byType.map((entry) => (
                <li key={entry.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{entry.name}</span>
                    <span className="tabular-nums text-earth-700 dark:text-earth-200">
                      {formatLaborTime(entry.effective)} / {formatLaborTime(entry.planned)}
                    </span>
                  </div>
                  <div className="h-3 rounded bg-earth-100 dark:bg-earth-700">
                    <div
                      className="h-3 rounded"
                      style={{
                        width: `${(Math.max(entry.effective, entry.planned) / maxLabor) * 100}%`,
                        backgroundColor: entry.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
