// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Saisie rapide des récoltes : au champ, deux touches suffisent (série + quantité),
// et la saisie fonctionne hors ligne.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { minutesToSeconds, today, unitsToThousandths } from '@sillon/core';
import { useFarmId } from '../lib/session.js';
import { useFarmMutation, useHarvests, usePlantings } from '../lib/queries.js';
import { api, QueuedOfflineError } from '../lib/api.js';
import { EmptyState, Field, Loading, PageHeader, Select, StatTile } from '../components/ui.js';
import { mainDate } from '../lib/planting.js';
import { formatDate, formatLaborTime, formatQuantity } from '../lib/format.js';

export function HarvestsPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const year = Number(today().slice(0, 4));
  const [plantingId, setPlantingId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today());
  const [laborTime, setLaborTime] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const plantings = usePlantings(farmId, { year, sort: 'crop' });
  const harvests = useHarvests(farmId, { from: `${year}-01-01`, to: `${year}-12-31` });

  const record = useFarmMutation(farmId, (body: Record<string, unknown>) =>
    api(`/api/farms/${farmId}/harvests`, { method: 'POST', body, deferrable: t('harvests.add') }),
  );

  const submit = () => {
    if (!plantingId || !quantity) return;
    record.mutate(
      {
        plantingId: Number(plantingId),
        // Saisie dans l'unité de récolte, stockage en millièmes ; temps en secondes.
        quantity: unitsToThousandths(Number(quantity.replace(',', '.'))),
        date,
        laborTime: laborTime ? minutesToSeconds(Number(laborTime)) : null,
      },
      {
        onSuccess: () => {
          setQuantity('');
          setLaborTime('');
          setNotice(null);
        },
        onError: (error) =>
          setNotice(error instanceof QueuedOfflineError ? t('app.offline') : t('common.error')),
      },
    );
  };

  const total = (harvests.data ?? []).reduce((sum, harvest) => sum + harvest.quantity, 0);

  return (
    <>
      <PageHeader title={t('harvests.title')} />

      <section className="card mb-6 space-y-3">
        <Select
          label={t('harvests.series')}
          value={plantingId}
          onChange={(event) => setPlantingId(event.target.value)}
        >
          <option value="">—</option>
          {(plantings.data ?? []).map((planting) => (
            <option key={planting.id} value={planting.id}>
              {planting.crop.name}
              {planting.variety ? ` — ${planting.variety.name}` : ''}
              {mainDate(planting) ? ` (${formatDate(mainDate(planting), locale)})` : ''}
            </option>
          ))}
        </Select>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={t('harvests.quantity')}
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <Field
            label={t('harvests.date')}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Field
            label={`${t('harvests.laborTime')} (${t('common.minutes')})`}
            type="number"
            inputMode="numeric"
            value={laborTime}
            onChange={(event) => setLaborTime(event.target.value)}
          />
        </div>
        {notice ? (
          <p role="status" className="rounded-lg bg-amber-100 p-2 text-sm text-amber-950">
            {notice}
          </p>
        ) : null}
        <button
          type="button"
          className="btn-primary w-full"
          onClick={submit}
          disabled={!plantingId || !quantity}
        >
          {t('harvests.add')}
        </button>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label={t('harvests.total')} value={formatQuantity(total, locale)} />
        <StatTile
          label={t('harvests.laborTime')}
          value={formatLaborTime(
            (harvests.data ?? []).reduce((sum, harvest) => sum + (harvest.laborTime ?? 0), 0),
          )}
        />
      </div>

      {harvests.isLoading ? (
        <Loading />
      ) : (harvests.data ?? []).length === 0 ? (
        <EmptyState message={t('harvests.empty')} />
      ) : (
        <ul className="space-y-2">
          {(harvests.data ?? []).map((harvest) => (
            <li key={harvest.id} className="card flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {harvest.planting?.crop.name}
                  {harvest.planting?.variety ? ` — ${harvest.planting.variety.name}` : ''}
                </p>
                <p className="text-xs text-earth-700 dark:text-earth-200">
                  {formatDate(harvest.date, locale)}
                  {harvest.laborTime ? ` · ${formatLaborTime(harvest.laborTime)}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">
                {formatQuantity(harvest.quantity, locale, harvest.planting?.unit?.name)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
