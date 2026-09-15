// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fiche d'une série : édition plein écran sur mobile, formulaire complet sur PC.
// Les dates se saisissent en date (15/03) ou en semaine (S12), comme dans Brinjel.

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import {
  deriveDates,
  formatIsoWeek,
  parseDateInput,
  parseLengthMeters,
  seedRequirement,
  today,
  type PlantingDateType,
  type PlantingType,
} from '@sillon/core';
import { useCurrentSession, useFarmId } from '../lib/session.js';
import {
  useAvailableLocations,
  useContainers,
  useCrops,
  useFarmMutation,
  usePlanting,
  useTags,
  useTaskTemplates,
  useUnits,
  useVarieties,
} from '../lib/queries.js';
import { api } from '../lib/api.js';
import { Field, Loading, PageHeader, Select, StatTile, Toggle } from '../components/ui.js';
import { formatDate, formatLength, formatMoney, formatSeedMass } from '../lib/format.js';

interface FormState {
  cropId: string;
  varietyId: string;
  unitId: string;
  containerId: string;
  plantingType: PlantingType;
  inGreenhouse: boolean;
  lengthMeters: string;
  rows: string;
  spacingPlants: string;
  yieldPerBedMeter: string;
  priceEuros: string;
  seedsPerGram: string;
  seedsPerHoleSeedling: string;
  seedsPerHoleDirect: string;
  seedsExtraPercentage: string;
  estimatedGreenhouseLoss: string;
  anchorInput: string;
  greenhouseDuration: string;
  toHarvestDuration: string;
  harvestDuration: string;
  tagIds: number[];
  finished: boolean;
}

const EMPTY: FormState = {
  cropId: '',
  varietyId: '',
  unitId: '',
  containerId: '',
  plantingType: 'transplant_raised',
  inGreenhouse: false,
  lengthMeters: '30',
  rows: '2',
  spacingPlants: '50',
  yieldPerBedMeter: '',
  priceEuros: '',
  seedsPerGram: '',
  seedsPerHoleSeedling: '1',
  seedsPerHoleDirect: '3',
  seedsExtraPercentage: '10',
  estimatedGreenhouseLoss: '10',
  anchorInput: today(),
  greenhouseDuration: '35',
  toHarvestDuration: '60',
  harvestDuration: '30',
  tagIds: [],
  finished: false,
};

const numberOrNull = (value: string): number | null =>
  value.trim() === '' ? null : Number(value.replace(',', '.'));

export function PlantingDetailPage({ plantingId }: { plantingId: number | null }) {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const { canEdit } = useCurrentSession();
  const navigate = useNavigate();

  const existing = usePlanting(farmId, plantingId ?? Number.NaN);
  const crops = useCrops(farmId);
  const units = useUnits(farmId);
  const containers = useContainers(farmId);
  const tags = useTags(farmId);
  const templates = useTaskTemplates(farmId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const varieties = useVarieties(farmId, form.cropId ? { cropId: Number(form.cropId) } : {});
  const [showPlacement, setShowPlacement] = useState(false);
  const available = useAvailableLocations(
    farmId,
    plantingId ?? 0,
    showPlacement && plantingId !== null,
  );

  useEffect(() => {
    if (!existing.data) return;
    const planting = existing.data;
    setForm({
      cropId: String(planting.cropId),
      varietyId: planting.varietyId ? String(planting.varietyId) : '',
      unitId: planting.unitId ? String(planting.unitId) : '',
      containerId: planting.containerId ? String(planting.containerId) : '',
      plantingType: planting.plantingType,
      inGreenhouse: planting.inGreenhouse ?? false,
      lengthMeters: String((planting.length ?? 0) / 100),
      rows: String(planting.rows ?? ''),
      spacingPlants: String(planting.spacingPlants ?? ''),
      yieldPerBedMeter: planting.yieldPerBedMeter === null ? '' : String(planting.yieldPerBedMeter),
      priceEuros: planting.pricePerUnit === null ? '' : String(planting.pricePerUnit / 100),
      seedsPerGram: planting.seedsPerGram === null ? '' : String(planting.seedsPerGram),
      seedsPerHoleSeedling:
        planting.seedsPerHoleSeedling === null ? '' : String(planting.seedsPerHoleSeedling),
      seedsPerHoleDirect:
        planting.seedsPerHoleDirect === null ? '' : String(planting.seedsPerHoleDirect),
      seedsExtraPercentage:
        planting.seedsExtraPercentage === null ? '' : String(planting.seedsExtraPercentage),
      estimatedGreenhouseLoss:
        planting.estimatedGreenhouseLoss === null ? '' : String(planting.estimatedGreenhouseLoss),
      anchorInput: planting.anchorDate ?? today(),
      greenhouseDuration: String(planting.durations.greenhouse ?? ''),
      toHarvestDuration: String(planting.durations.to_harvest ?? ''),
      harvestDuration: String(planting.durations.harvest ?? ''),
      tagIds: planting.tags.map((tag) => tag.id),
      finished: planting.finished,
    });
  }, [existing.data]);

  const referenceYear = Number(today().slice(0, 4));
  const anchorDate = parseDateInput(form.anchorInput, referenceYear);
  const durations = {
    greenhouse: Number(form.greenhouseDuration || 0),
    to_harvest: Number(form.toHarvestDuration || 0),
    harvest: Number(form.harvestDuration || 0),
  };
  const preview = anchorDate ? deriveDates(anchorDate, form.plantingType, durations) : null;

  const lengthCm = parseLengthMeters(form.lengthMeters) ?? 0;
  const computed = seedRequirement({
    plantingType: form.plantingType,
    length: lengthCm,
    rows: Number(form.rows || 0),
    spacingPlants: Number(form.spacingPlants || 0),
    seedsPerGram: numberOrNull(form.seedsPerGram),
    seedsPerHoleSeedling: numberOrNull(form.seedsPerHoleSeedling),
    seedsPerHoleDirect: numberOrNull(form.seedsPerHoleDirect),
    seedsExtraPercentage: numberOrNull(form.seedsExtraPercentage),
    estimatedGreenhouseLoss: numberOrNull(form.estimatedGreenhouseLoss),
    containerSize:
      containers.data?.find((container) => String(container.id) === form.containerId)?.size ?? null,
  });

  const save = useFarmMutation(farmId, async (body: Record<string, unknown>) =>
    plantingId
      ? api(`/api/farms/${farmId}/plantings/${plantingId}`, { method: 'PATCH', body })
      : api(`/api/farms/${farmId}/plantings`, { method: 'POST', body }),
  );
  const generateTasks = useFarmMutation(farmId, () =>
    api(`/api/farms/${farmId}/plantings/${plantingId}/generate-tasks`, {
      method: 'POST',
      body: {},
    }),
  );
  const applyTemplate = useFarmMutation(farmId, (taskTemplateId: number) =>
    api(`/api/farms/${farmId}/plantings/${plantingId}/apply-template`, {
      method: 'POST',
      body: { taskTemplateId },
    }),
  );
  const place = useFarmMutation(
    farmId,
    (body: { assignments: { locationId: number; length: number }[]; force: boolean }) =>
      api(`/api/farms/${farmId}/plantings/${plantingId}/assignments`, { method: 'PUT', body }),
  );
  const remove = useFarmMutation(farmId, () =>
    api(`/api/farms/${farmId}/plantings/${plantingId}`, { method: 'DELETE' }),
  );

  if (plantingId !== null && existing.isLoading) return <Loading />;

  const submit = () => {
    if (!form.cropId || !anchorDate) return;
    save.mutate(
      {
        cropId: Number(form.cropId),
        varietyId: form.varietyId ? Number(form.varietyId) : null,
        unitId: form.unitId ? Number(form.unitId) : null,
        containerId: form.containerId ? Number(form.containerId) : null,
        plantingType: form.plantingType,
        inGreenhouse: form.inGreenhouse,
        length: lengthCm,
        rows: Number(form.rows || 0),
        spacingPlants: Number(form.spacingPlants || 0),
        yieldPerBedMeter: numberOrNull(form.yieldPerBedMeter),
        pricePerUnit:
          form.priceEuros.trim() === ''
            ? null
            : Math.round(Number(form.priceEuros.replace(',', '.')) * 100),
        seedsPerGram: numberOrNull(form.seedsPerGram),
        seedsPerHoleSeedling: numberOrNull(form.seedsPerHoleSeedling),
        seedsPerHoleDirect: numberOrNull(form.seedsPerHoleDirect),
        seedsExtraPercentage: numberOrNull(form.seedsExtraPercentage),
        estimatedGreenhouseLoss: numberOrNull(form.estimatedGreenhouseLoss),
        finished: form.finished,
        anchorDate,
        durations,
        tagIds: form.tagIds,
      },
      {
        onSuccess: (result) => {
          const created = result as { id: number };
          void navigate({ to: '/plan/$plantingId', params: { plantingId: String(created.id) } });
        },
      },
    );
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader title={plantingId ? t('planting.edit') : t('planting.new')}>
        <button type="button" className="btn-ghost" onClick={() => void navigate({ to: '/plan' })}>
          {t('common.back')}
        </button>
        {canEdit ? (
          <button type="button" className="btn-primary" onClick={submit} disabled={save.isPending}>
            {t('common.save')}
          </button>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('planting.crop')}
              value={form.cropId}
              onChange={(event) => update('cropId', event.target.value)}
              required
            >
              <option value="">—</option>
              {(crops.data ?? []).map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('planting.variety')}
              value={form.varietyId}
              onChange={(event) => update('varietyId', event.target.value)}
            >
              <option value="">—</option>
              {(varieties.data ?? []).map((variety) => (
                <option key={variety.id} value={variety.id}>
                  {variety.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('planting.type')}
              value={form.plantingType}
              onChange={(event) => update('plantingType', event.target.value as PlantingType)}
            >
              <option value="direct_seed">{t('planting.types.direct_seed')}</option>
              <option value="transplant_raised">{t('planting.types.transplant_raised')}</option>
              <option value="transplant_bought">{t('planting.types.transplant_bought')}</option>
            </Select>
            <Select
              label={t('planting.unit')}
              value={form.unitId}
              onChange={(event) => update('unitId', event.target.value)}
            >
              <option value="">—</option>
              {(units.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
            <Field
              label={`${t('planting.length')} (${t('common.meters')})`}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.lengthMeters}
              onChange={(event) => update('lengthMeters', event.target.value)}
            />
            <Field
              label={t('planting.rows')}
              type="number"
              inputMode="numeric"
              value={form.rows}
              onChange={(event) => update('rows', event.target.value)}
            />
            <Field
              label={`${t('planting.spacing')} (${t('common.centimeters')})`}
              type="number"
              inputMode="numeric"
              value={form.spacingPlants}
              onChange={(event) => update('spacingPlants', event.target.value)}
            />
            <Field
              label={t('planting.yield')}
              type="number"
              inputMode="numeric"
              value={form.yieldPerBedMeter}
              onChange={(event) => update('yieldPerBedMeter', event.target.value)}
            />
            <Field
              label={`${t('planting.price')} (€)`}
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.priceEuros}
              onChange={(event) => update('priceEuros', event.target.value)}
            />
            <Toggle
              label={t('planting.underCover')}
              checked={form.inGreenhouse}
              onChange={(value) => update('inGreenhouse', value)}
            />
          </div>

          <fieldset className="border-t border-earth-200 pt-4 dark:border-earth-700">
            <legend className="text-sm font-semibold">{t('planting.dates')}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('planting.anchorDate')}
                hint={t('planting.dateHint')}
                value={form.anchorInput}
                onChange={(event) => update('anchorInput', event.target.value)}
                error={anchorDate ? undefined : t('common.required')}
              />
              <Field
                label={`${t('planting.greenhouseDuration')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                disabled={form.plantingType !== 'transplant_raised'}
                value={form.greenhouseDuration}
                onChange={(event) => update('greenhouseDuration', event.target.value)}
              />
              <Field
                label={`${t('planting.toHarvestDuration')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                value={form.toHarvestDuration}
                onChange={(event) => update('toHarvestDuration', event.target.value)}
              />
              <Field
                label={`${t('planting.harvestDuration')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                value={form.harvestDuration}
                onChange={(event) => update('harvestDuration', event.target.value)}
              />
            </div>
            {preview ? (
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(preview).map(([type, date]) => (
                  <li
                    key={type}
                    className="flex justify-between gap-2 rounded-lg bg-earth-100 px-3 py-2 dark:bg-earth-700"
                  >
                    <span>{t(`planting.dateTypes.${type as PlantingDateType}`)}</span>
                    <span className="tabular-nums">
                      {formatDate(date, locale)} · {formatIsoWeek(date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>

          <fieldset className="border-t border-earth-200 pt-4 dark:border-earth-700">
            <legend className="text-sm font-semibold">{t('planting.seeds')}</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={t('planting.seedsPerGram')}
                type="number"
                inputMode="numeric"
                value={form.seedsPerGram}
                onChange={(event) => update('seedsPerGram', event.target.value)}
              />
              <Field
                label={t('planting.seedsPerHoleSeedling')}
                type="number"
                inputMode="numeric"
                value={form.seedsPerHoleSeedling}
                onChange={(event) => update('seedsPerHoleSeedling', event.target.value)}
              />
              <Field
                label={t('planting.seedsPerHoleDirect')}
                type="number"
                inputMode="numeric"
                value={form.seedsPerHoleDirect}
                onChange={(event) => update('seedsPerHoleDirect', event.target.value)}
              />
              <Field
                label={t('planting.seedsExtra')}
                type="number"
                inputMode="numeric"
                value={form.seedsExtraPercentage}
                onChange={(event) => update('seedsExtraPercentage', event.target.value)}
              />
              <Field
                label={t('planting.greenhouseLoss')}
                type="number"
                inputMode="numeric"
                value={form.estimatedGreenhouseLoss}
                onChange={(event) => update('estimatedGreenhouseLoss', event.target.value)}
              />
              <Select
                label={t('planting.container')}
                value={form.containerId}
                onChange={(event) => update('containerId', event.target.value)}
              >
                <option value="">—</option>
                {(containers.data ?? []).map((container) => (
                  <option key={container.id} value={container.id}>
                    {container.name} ({container.size})
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>

          {tags.data && tags.data.length > 0 ? (
            <fieldset className="border-t border-earth-200 pt-4 dark:border-earth-700">
              <legend className="text-sm font-semibold">{t('planting.tags')}</legend>
              <div className="flex flex-wrap gap-2">
                {tags.data.map((tag) => (
                  <label
                    key={tag.id}
                    className="chip min-h-11 cursor-pointer border border-earth-200 px-3 dark:border-earth-700"
                    style={{ backgroundColor: `${tag.color}22` }}
                  >
                    <input
                      type="checkbox"
                      className="accent-sillon-600"
                      checked={form.tagIds.includes(tag.id)}
                      onChange={(event) =>
                        update(
                          'tagIds',
                          event.target.checked
                            ? [...form.tagIds, tag.id]
                            : form.tagIds.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </section>

        <aside className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label={t('planting.plantCount')} value={computed.plantCount} />
            <StatTile label={t('planting.holes')} value={computed.holesToSow} />
            <StatTile
              label={t('planting.seedCount')}
              value={computed.seedCount}
              hint={computed.seedMassMg === null ? undefined : formatSeedMass(computed.seedMassMg)}
            />
            <StatTile label={t('planting.trays')} value={computed.trays ?? '—'} />
          </div>

          {existing.data ? (
            <div className="card space-y-2">
              <p className="text-sm font-semibold">{t('planting.expectedYield')}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {existing.data.computed.expectedYield}
                {existing.data.unit ? ` ${existing.data.unit.name}` : ''}
              </p>
              <p className="text-sm text-earth-700 dark:text-earth-200">
                {formatMoney(existing.data.computed.expectedRevenue, locale)}
              </p>
            </div>
          ) : null}

          {plantingId && canEdit ? (
            <div className="card space-y-2">
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => generateTasks.mutate(undefined)}
              >
                {t('planting.generateTasks')}
              </button>
              {(templates.data ?? []).length > 0 ? (
                <Select
                  label={t('planting.applyTemplate')}
                  value=""
                  onChange={(event) =>
                    event.target.value && applyTemplate.mutate(Number(event.target.value))
                  }
                >
                  <option value="">—</option>
                  {(templates.data ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setShowPlacement((value) => !value)}
              >
                {t('beds.place')}
              </button>
              <button
                type="button"
                className="btn-danger w-full"
                onClick={() => {
                  if (!window.confirm(t('common.confirmDelete'))) return;
                  remove.mutate(undefined, { onSuccess: () => void navigate({ to: '/plan' }) });
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          ) : null}

          {showPlacement && available.data ? (
            <div className="card space-y-2">
              <p className="text-sm font-semibold">{t('beds.availableLocations')}</p>
              <p className="text-xs text-earth-700 dark:text-earth-200">
                {formatLength(available.data.requiredLength, locale)} ·{' '}
                {formatDate(available.data.range.begin, locale)} →{' '}
                {formatDate(available.data.range.end, locale)}
              </p>
              <ul className="space-y-2">
                {available.data.locations.map((entry) => (
                  <li
                    key={entry.bed.id}
                    className="rounded-lg border border-earth-200 p-2 dark:border-earth-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry.bed.name}</span>
                      <span className="text-xs tabular-nums">
                        {formatLength(entry.availableLength, locale)}
                      </span>
                    </div>
                    {entry.rotation ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                        {t('beds.rotationWarning', {
                          date: formatDate(entry.rotation.lastSeenOn, locale),
                          available: formatDate(entry.rotation.availableFrom, locale),
                        })}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost mt-2 w-full"
                      disabled={!entry.fits && !entry.rotation}
                      onClick={() =>
                        place.mutate({
                          assignments: [
                            {
                              locationId: entry.bed.id,
                              length: Math.min(available.data!.requiredLength, entry.bed.bedLength),
                            },
                          ],
                          force: entry.rotation !== null,
                        })
                      }
                    >
                      {entry.rotation ? t('beds.forcePlace') : t('beds.place')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
