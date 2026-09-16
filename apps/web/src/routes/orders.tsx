// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { today } from '@sillon/core';
import { useFarmId } from '../lib/session.js';
import { useOrders, useProviders } from '../lib/queries.js';
import { queryString } from '../lib/api.js';
import { EmptyState, Loading, PageHeader, Select, StatTile, Toggle } from '../components/ui.js';
import { formatDate, formatSeedWeight } from '../lib/format.js';

const PERIODS = ['year', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4'] as const;

export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('year');
  const [placedOnly, setPlacedOnly] = useState(false);
  const [providerId, setProviderId] = useState('');

  const params = { year, period, placedOnly, providerId: providerId || undefined };
  const orders = useOrders(farmId, params);
  const providers = useProviders(farmId);

  return (
    <>
      <PageHeader title={t('orders.title')}>
        <a
          className="btn-ghost no-print"
          href={`/api/farms/${farmId}/orders.csv${queryString(params)}`}
          download
        >
          {t('orders.csv')}
        </a>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </PageHeader>

      <div className="no-print mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label={t('common.year')}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[year - 1, year, year + 1].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          label={t('orders.period')}
          value={period}
          onChange={(e) => setPeriod(e.target.value as (typeof PERIODS)[number])}
        >
          {PERIODS.map((value) => (
            <option key={value} value={value}>
              {t(`orders.periods.${value}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('orders.provider')}
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {(providers.data ?? []).map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </Select>
        <div className="flex items-end">
          <Toggle label={t('orders.placedOnly')} checked={placedOnly} onChange={setPlacedOnly} />
        </div>
      </div>

      {orders.isLoading ? (
        <Loading />
      ) : !orders.data || orders.data.lines.length === 0 ? (
        <EmptyState message={t('orders.empty')} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <StatTile
              label={t('orders.seeds')}
              value={orders.data.totals.seedsNumber.toLocaleString(locale)}
            />
            <StatTile
              label={t('orders.plants')}
              value={orders.data.totals.transplantsToBuy.toLocaleString(locale)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-earth-200 text-left dark:border-earth-700">
                  <th className="p-2">{t('orders.provider')}</th>
                  <th className="p-2">{t('planting.crop')}</th>
                  <th className="p-2">{t('planting.variety')}</th>
                  <th className="p-2 text-right">{t('orders.series')}</th>
                  <th className="p-2 text-right">{t('orders.seeds')}</th>
                  <th className="p-2 text-right">{t('orders.mass')}</th>
                  <th className="p-2 text-right">{t('orders.plants')}</th>
                  <th className="p-2">{t('orders.firstNeeded')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.lines.map((line) => (
                  <tr key={line.key} className="border-b border-earth-100 dark:border-earth-700">
                    <td className="p-2">{line.providerName ?? '—'}</td>
                    <td className="p-2 font-medium">{line.cropName}</td>
                    <td className="p-2">{line.varietyName ?? '—'}</td>
                    <td className="p-2 text-right tabular-nums">{line.plantingCount}</td>
                    <td className="p-2 text-right tabular-nums">
                      {Math.round(line.seedsNumber).toLocaleString(locale)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {line.seedsQuantityGrams === null
                        ? '—'
                        : formatSeedWeight(line.seedsQuantityGrams, locale)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{line.transplantsToBuy || '—'}</td>
                    <td className="p-2 tabular-nums">{formatDate(line.firstNeededOn, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
