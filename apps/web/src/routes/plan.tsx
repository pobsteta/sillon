// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Plan de culture (§7.2) : cartes et tiroir de filtres sur smartphone, tableau dense et
// Gantt côte à côte sur PC. Le traitement par lot agit sur la sélection courante.

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { today } from '@sillon/core';
import { useFarmId, useCurrentSession } from '../lib/session.js';
import {
  useCrops,
  useFamilies,
  useFarmMutation,
  useGantt,
  usePlantings,
  useTags,
} from '../lib/queries.js';
import { api } from '../lib/api.js';
import {
  Drawer,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Select,
  Toggle,
} from '../components/ui.js';
import { GanttChart } from '../components/GanttChart.js';
import { firstHarvestDate, mainDate } from '../lib/planting.js';
import { formatDate, formatLength, formatMoney } from '../lib/format.js';
import type { Planting } from '../lib/types.js';

export function PlanPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const { canEdit } = useCurrentSession();
  const navigate = useNavigate();

  const currentYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [familyId, setFamilyId] = useState('');
  const [cropId, setCropId] = useState('');
  const [tagId, setTagId] = useState('');
  const [plantingType, setPlantingType] = useState('');
  const [underCover, setUnderCover] = useState<'' | 'true' | 'false'>('');
  const [placed, setPlaced] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'date' | 'crop' | 'length'>('date');
  const [showGantt, setShowGantt] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [shiftDays, setShiftDays] = useState('7');

  const params = {
    year,
    familyId: familyId || undefined,
    cropId: cropId || undefined,
    tagId: tagId || undefined,
    plantingType: plantingType || undefined,
    inGreenhouse: underCover || undefined,
    placed: placed || undefined,
    search: search || undefined,
    sort,
  };

  const plantings = usePlantings(farmId, params);
  const gantt = useGantt(farmId, { from: `${year}-01-01`, to: `${year}-12-31` });
  const families = useFamilies(farmId);
  const crops = useCrops(farmId);
  const tags = useTags(farmId);

  const bulkUpdate = useFarmMutation(farmId, (body: Record<string, unknown>) =>
    api(`/api/farms/${farmId}/plantings`, { method: 'PATCH', body }),
  );
  const bulkDelete = useFarmMutation(farmId, (ids: number[]) =>
    api(`/api/farms/${farmId}/plantings/delete`, { method: 'POST', body: { ids } }),
  );

  const toggleSelection = (id: number) =>
    setSelection((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const visibleGantt = useMemo(() => {
    if (!gantt.data || !plantings.data) return [];
    const allowed = new Set(plantings.data.map((planting) => planting.id));
    return gantt.data.filter((bar) => allowed.has(bar.plantingId));
  }, [gantt.data, plantings.data]);

  if (plantings.isError)
    return <ErrorNotice error={plantings.error} onRetry={() => void plantings.refetch()} />;

  return (
    <>
      <PageHeader title={t('planting.title')}>
        <button
          type="button"
          className="btn-ghost no-print"
          aria-pressed={showGantt}
          onClick={() => setShowGantt((value) => !value)}
        >
          {showGantt ? t('planting.list') : t('planting.gantt')}
        </button>
        <button type="button" className="btn-ghost no-print" onClick={() => setFiltersOpen(true)}>
          {t('common.filters')}
        </button>
        {canEdit ? (
          <Link to="/plan/nouvelle" className="btn-primary no-print">
            {t('planting.new')}
          </Link>
        ) : null}
      </PageHeader>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="field max-w-64"
          placeholder={t('common.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label={t('common.year')}
          className="field max-w-28"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {selection.length > 0 && canEdit ? (
          <button type="button" className="btn-primary" onClick={() => setBulkOpen(true)}>
            {t('common.selected', { count: selection.length })} · {t('planting.bulk')}
          </button>
        ) : null}
      </div>

      {plantings.isLoading ? (
        <Loading />
      ) : !plantings.data || plantings.data.length === 0 ? (
        <EmptyState
          message={t('planting.empty')}
          action={
            canEdit ? (
              <Link to="/plan/nouvelle" className="btn-primary">
                {t('planting.new')}
              </Link>
            ) : undefined
          }
        />
      ) : showGantt ? (
        <GanttChart
          bars={visibleGantt}
          from={`${year}-01-01`}
          to={`${year}-12-31`}
          onSelect={(plantingId) =>
            void navigate({ to: '/plan/$plantingId', params: { plantingId: String(plantingId) } })
          }
        />
      ) : (
        <>
          {/* Cartes — smartphone */}
          <ul className="space-y-2 lg:hidden">
            {plantings.data.map((planting) => (
              <li key={planting.id} className="card">
                <div className="flex items-start gap-3">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="mt-1 size-5 accent-sillon-600"
                      aria-label={planting.crop.name}
                      checked={selection.includes(planting.id)}
                      onChange={() => toggleSelection(planting.id)}
                    />
                  ) : null}
                  <Link
                    to="/plan/$plantingId"
                    params={{ plantingId: String(planting.id) }}
                    className="min-w-0 flex-1"
                  >
                    <p className="font-medium">
                      {planting.crop.name}
                      {planting.variety ? ` — ${planting.variety.name}` : ''}
                    </p>
                    <p className="text-sm text-earth-700 dark:text-earth-200">
                      {t(`planting.types.${planting.plantingType}`)} ·{' '}
                      {planting.inGreenhouse ? t('planting.underCover') : t('planting.openField')}
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      {formatDate(mainDate(planting), locale)} ·{' '}
                      {formatLength(planting.length ?? 0, locale)}
                    </p>
                    <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
                      {planting.assignments.length > 0
                        ? t('planting.placedOn', {
                            names: planting.assignments
                              .map((assignment) => assignment.location.name)
                              .join(', '),
                          })
                        : t('planting.notPlaced')}
                    </p>
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {/* Tableau dense — PC */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-earth-200 text-left dark:border-earth-700">
                  <th className="p-2 no-print" />
                  <th className="p-2">
                    <button type="button" onClick={() => setSort('crop')}>
                      {t('planting.crop')}
                    </button>
                  </th>
                  <th className="p-2">{t('planting.variety')}</th>
                  <th className="p-2">{t('planting.type')}</th>
                  <th className="p-2">
                    <button type="button" onClick={() => setSort('date')}>
                      {t('planting.fieldDate')}
                    </button>
                  </th>
                  <th className="p-2">{t('planting.firstHarvest')}</th>
                  <th className="p-2 text-right">
                    <button type="button" onClick={() => setSort('length')}>
                      {t('planting.length')}
                    </button>
                  </th>
                  <th className="p-2 text-right">{t('planting.seedlings')}</th>
                  <th className="p-2 text-right">{t('planting.expectedRevenue')}</th>
                  <th className="p-2">{t('beds.title')}</th>
                </tr>
              </thead>
              <tbody>
                {plantings.data.map((planting) => (
                  <PlantingRow
                    key={planting.id}
                    planting={planting}
                    selected={selection.includes(planting.id)}
                    selectable={canEdit}
                    onToggle={() => toggleSelection(planting.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Drawer open={filtersOpen} title={t('common.filters')} onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <Select
            label={t('planting.family')}
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {(families.data ?? []).map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('planting.crop')}
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {(crops.data ?? []).map((crop) => (
              <option key={crop.id} value={crop.id}>
                {crop.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('planting.tags')}
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {(tags.data ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('planting.type')}
            value={plantingType}
            onChange={(e) => setPlantingType(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="direct_seeded">{t('planting.types.direct_seeded')}</option>
            <option value="transplant_raised">{t('planting.types.transplant_raised')}</option>
            <option value="transplant_bought">{t('planting.types.transplant_bought')}</option>
            <option value="seedling">{t('planting.types.seedling')}</option>
          </Select>
          <Select
            label={t('planting.underCover')}
            value={underCover}
            onChange={(e) => setUnderCover(e.target.value as '' | 'true' | 'false')}
          >
            <option value="">{t('common.all')}</option>
            <option value="true">{t('planting.underCover')}</option>
            <option value="false">{t('planting.openField')}</option>
          </Select>
          <Select
            label={t('beds.title')}
            value={placed}
            onChange={(e) => setPlaced(e.target.value as '' | 'true' | 'false')}
          >
            <option value="">{t('common.all')}</option>
            <option value="true">{t('planting.placedOn', { names: '…' })}</option>
            <option value="false">{t('planting.notPlaced')}</option>
          </Select>
        </div>
      </Drawer>

      <Drawer open={bulkOpen} title={t('planting.bulk')} onClose={() => setBulkOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm">{t('common.selected', { count: selection.length })}</p>
          <div>
            <label className="label" htmlFor="shift">
              {t('planting.shiftDays')}
            </label>
            <div className="flex gap-2">
              <input
                id="shift"
                type="number"
                className="field"
                value={shiftDays}
                onChange={(event) => setShiftDays(event.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  bulkUpdate.mutate(
                    { ids: selection, shiftDays: Number(shiftDays) },
                    { onSuccess: () => setBulkOpen(false) },
                  )
                }
              >
                {t('planting.applyToSelection')}
              </button>
            </div>
          </div>
          <Toggle
            label={t('planting.finished')}
            checked={false}
            onChange={(checked) =>
              bulkUpdate.mutate({ ids: selection, data: { finished: checked } })
            }
          />
          <button
            type="button"
            className="btn-danger w-full"
            onClick={() => {
              if (!window.confirm(t('common.confirmDelete'))) return;
              bulkDelete.mutate(selection, {
                onSuccess: () => {
                  setSelection([]);
                  setBulkOpen(false);
                },
              });
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </Drawer>
    </>
  );
}

function PlantingRow({
  planting,
  selected,
  selectable,
  onToggle,
}: {
  planting: Planting;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <tr className="border-b border-earth-100 hover:bg-earth-50 dark:border-earth-700 dark:hover:bg-earth-700/40">
      <td className="p-2 no-print">
        {selectable ? (
          <input
            type="checkbox"
            className="size-5 accent-sillon-600"
            aria-label={planting.crop.name}
            checked={selected}
            onChange={onToggle}
          />
        ) : null}
      </td>
      <td className="p-2 font-medium">
        <Link
          to="/plan/$plantingId"
          params={{ plantingId: String(planting.id) }}
          className="hover:underline"
        >
          {planting.crop.name}
        </Link>
      </td>
      <td className="p-2">{planting.variety?.name ?? '—'}</td>
      <td className="p-2">{t(`planting.types.${planting.plantingType}`)}</td>
      <td className="p-2 tabular-nums">{formatDate(mainDate(planting), locale)}</td>
      <td className="p-2 tabular-nums">{formatDate(firstHarvestDate(planting), locale)}</td>
      <td className="p-2 text-right tabular-nums">{formatLength(planting.length ?? 0, locale)}</td>
      <td className="p-2 text-right tabular-nums">
        {Math.round(planting.computed.seedlings).toLocaleString(locale)}
      </td>
      <td className="p-2 text-right tabular-nums">
        {formatMoney(planting.computed.expectedRevenue, locale)}
      </td>
      <td className="p-2 text-xs">
        {planting.assignments.length > 0
          ? planting.assignments.map((assignment) => assignment.location.name).join(', ')
          : t('planting.notPlaced')}
      </td>
    </tr>
  );
}
