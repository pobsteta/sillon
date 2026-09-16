// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { today, weekRange } from '@sillon/core';
import { useFarmId } from '../lib/session.js';
import { usePlantings, useStats, useTasks } from '../lib/queries.js';
import { EmptyState, Loading, PageHeader, StatTile } from '../components/ui.js';
import { formatDate, formatLaborTime } from '../lib/format.js';
import { TaskList } from './tasks.js';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const week = weekRange(today());
  const year = Number(today().slice(0, 4));

  const tasks = useTasks(farmId, { week: week.begin, includeLate: true });
  const stats = useStats(farmId, year);
  const upcoming = usePlantings(farmId, { sort: 'date', order: 'asc', year });

  if (tasks.isLoading || stats.isLoading) return <Loading />;

  const late = (tasks.data ?? []).filter((task) => task.status === 'late');
  // « Prochains semis » : la date de semis prévue, qu'il soit direct ou en pépinière.
  const nextSowings = (upcoming.data ?? [])
    .map((planting) => ({ planting, sowing: planting.dates.sowing?.planned ?? null }))
    .filter((entry) => entry.sowing !== null && entry.sowing >= today())
    .slice(0, 5);

  return (
    <>
      <PageHeader title={t('dashboard.title')} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t('dashboard.seriesInSeason')}
          value={stats.data?.plantings.total ?? 0}
          hint={`${stats.data?.plantings.placed ?? 0} ${t('dashboard.placed')}`}
        />
        <StatTile
          label={t('stats.tasksDone')}
          value={`${stats.data?.tasks.done ?? 0} / ${stats.data?.tasks.total ?? 0}`}
          hint={formatLaborTime(stats.data?.tasks.labor.effective ?? 0)}
        />
        <StatTile label={t('dashboard.late')} value={late.length} />
        <StatTile
          label={t('stats.revenue')}
          value={((stats.data?.yields.expectedRevenue ?? 0) / 100).toLocaleString(locale, {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          })}
        />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">{t('dashboard.thisWeek')}</h2>
        {tasks.data && tasks.data.length > 0 ? (
          <TaskList tasks={tasks.data.slice(0, 8)} farmId={farmId} compact />
        ) : (
          <EmptyState message={t('dashboard.noTasks')} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('dashboard.upcomingSowings')}</h2>
        {nextSowings.length > 0 ? (
          <ul className="space-y-2">
            {nextSowings.map(({ planting, sowing }) => (
              <li key={planting.id} className="card flex items-center justify-between gap-3 py-3">
                <Link
                  to="/plan/$plantingId"
                  params={{ plantingId: String(planting.id) }}
                  className="font-medium hover:underline"
                >
                  {planting.crop.name}
                  {planting.variety ? ` — ${planting.variety.name}` : ''}
                </Link>
                <span className="text-sm tabular-nums text-earth-700 dark:text-earth-200">
                  {formatDate(sowing, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            message={t('planting.empty')}
            action={
              <Link to="/plan" className="btn-primary">
                {t('dashboard.openPlan')}
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
