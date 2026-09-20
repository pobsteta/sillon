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
  millimetersToMeters,
  parseDateInput,
  parseLengthMeters,
  parseSpacingCentimeters,
  seedRequirement,
  seedsPerGramToStorage,
  storageToSeedsPerGram,
  tenthsOfMillimeterToCentimeters,
  thousandthsToUnits,
  today,
  unitsToThousandths,
  type PlantingDateType,
  type PlantingType,
} from '@sillon/core';
import { useCurrentSession, useFarmId } from '../lib/session.js';
import { MoonDateHint } from '../components/MoonDateHint.js';
import { SuggestionRendement } from '../components/SuggestionReference.js';
import {
  useAvailableLocations,
  useContainers,
  useCrops,
  useFarm,
  useFarmMutation,
  usePlanting,
  useTags,
  useTaskTemplates,
  useUnits,
  useVarieties,
} from '../lib/queries.js';
import { api } from '../lib/api.js';
import { Field, Loading, PageHeader, Select, StatTile, Toggle } from '../components/ui.js';
import { NoteList } from '../components/Notes.js';
import {
  formatDate,
  formatLength,
  formatMoney,
  formatQuantity,
  formatSeedWeight,
} from '../lib/format.js';

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
  sowingInput: string;
  daysToTransplant: string;
  daysToMaturity: string;
  harvestWindow: string;
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
  sowingInput: today(),
  daysToTransplant: '35',
  daysToMaturity: '60',
  harvestWindow: '30',
  tagIds: [],
  finished: false,
};

const numberOrNull = (value: string): number | null =>
  value.trim() === '' ? null : Number(value.replace(',', '.'));

export function PlantingDetailPage({ plantingId }: { plantingId: number | null }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  // La largeur de planche de la ferme : sans elle, un rendement publié au mètre carré ne
  // se convertit pas en rendement au mètre de planche, et la suggestion se tait.
  const reglagesFerme = useFarm(farmId);
  const { canEdit, can } = useCurrentSession();
  const navigate = useNavigate();

  const existing = usePlanting(farmId, plantingId ?? Number.NaN);
  const crops = useCrops(farmId);
  const units = useUnits(farmId);
  const containers = useContainers(farmId);
  const tags = useTags(farmId);
  const templates = useTaskTemplates(farmId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const varieties = useVarieties(farmId, form.cropId ? { cropId: Number(form.cropId) } : {});
  // L'espèce choisie porte ce qu'on récolte : c'est elle qui dit quel type de jour la
  // culture appelle.
  const especeChoisie = (crops.data ?? []).find((crop) => String(crop.id) === form.cropId);
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
      lengthMeters: String(millimetersToMeters(planting.length ?? 0)),
      rows: String(planting.rows ?? ''),
      spacingPlants:
        planting.spacingPlants === null
          ? ''
          : String(tenthsOfMillimeterToCentimeters(planting.spacingPlants)),
      yieldPerBedMeter:
        planting.yieldPerBedMeter === null
          ? ''
          : String(thousandthsToUnits(planting.yieldPerBedMeter)),
      priceEuros: planting.pricePerUnit === null ? '' : String(planting.pricePerUnit / 100),
      seedsPerGram:
        planting.seedsPerGram === null ? '' : String(storageToSeedsPerGram(planting.seedsPerGram)),
      seedsPerHoleSeedling:
        planting.seedsPerHoleSeedling === null ? '' : String(planting.seedsPerHoleSeedling),
      seedsPerHoleDirect:
        planting.seedsPerHoleDirect === null ? '' : String(planting.seedsPerHoleDirect),
      seedsExtraPercentage:
        planting.seedsExtraPercentage === null ? '' : String(planting.seedsExtraPercentage),
      estimatedGreenhouseLoss:
        planting.estimatedGreenhouseLoss === null ? '' : String(planting.estimatedGreenhouseLoss),
      sowingInput: planting.dates.sowing?.planned ?? today(),
      daysToTransplant: String(planting.durations.days_to_transplant ?? ''),
      daysToMaturity: String(planting.durations.days_to_maturity ?? ''),
      harvestWindow: String(planting.durations.harvest_window ?? ''),
      tagIds: planting.tags.map((tag) => tag.id),
      finished: planting.finished,
    });
  }, [existing.data]);

  const referenceYear = Number(today().slice(0, 4));
  // Brinjel part toujours de la date de semis : le reste (plantation, récolte) s'en déduit.
  const sowingDate = parseDateInput(form.sowingInput, referenceYear);
  const durations = {
    days_to_transplant: Number(form.daysToTransplant || 0),
    days_to_maturity: Number(form.daysToMaturity || 0),
    harvest_window: Number(form.harvestWindow || 0),
  };
  const preview = sowingDate ? deriveDates(sowingDate, form.plantingType, durations) : null;

  // La saisie est en mètres et en centimètres, le stockage en millimètres et en
  // dixièmes de millimètre : la conversion a lieu ici, au bord.
  const lengthMm = parseLengthMeters(form.lengthMeters) ?? 0;
  const spacingTenths = parseSpacingCentimeters(form.spacingPlants) ?? 0;
  const seedsPerGramStored =
    numberOrNull(form.seedsPerGram) === null
      ? null
      : seedsPerGramToStorage(numberOrNull(form.seedsPerGram)!);
  const yieldStored =
    numberOrNull(form.yieldPerBedMeter) === null
      ? null
      : unitsToThousandths(numberOrNull(form.yieldPerBedMeter)!);
  const computed = seedRequirement({
    plantingType: form.plantingType,
    length: lengthMm,
    rows: Number(form.rows || 0),
    spacingPlants: spacingTenths,
    seedsPerGram: seedsPerGramStored,
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
    if (!form.cropId || !sowingDate) return;
    save.mutate(
      {
        cropId: Number(form.cropId),
        varietyId: form.varietyId ? Number(form.varietyId) : null,
        unitId: form.unitId ? Number(form.unitId) : null,
        containerId: form.containerId ? Number(form.containerId) : null,
        plantingType: form.plantingType,
        inGreenhouse: form.inGreenhouse,
        length: lengthMm,
        rows: Number(form.rows || 0),
        spacingPlants: spacingTenths,
        yieldPerBedMeter: yieldStored,
        pricePerUnit:
          form.priceEuros.trim() === ''
            ? null
            : Math.round(Number(form.priceEuros.replace(',', '.')) * 100),
        seedsPerGram: seedsPerGramStored,
        seedsPerHoleSeedling: numberOrNull(form.seedsPerHoleSeedling),
        seedsPerHoleDirect: numberOrNull(form.seedsPerHoleDirect),
        seedsExtraPercentage: numberOrNull(form.seedsExtraPercentage),
        estimatedGreenhouseLoss: numberOrNull(form.estimatedGreenhouseLoss),
        finished: form.finished,
        sowingDate,
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
              <option value="direct_seeded">{t('planting.types.direct_seeded')}</option>
              <option value="transplant_raised">{t('planting.types.transplant_raised')}</option>
              <option value="transplant_bought">{t('planting.types.transplant_bought')}</option>
              <option value="seedling">{t('planting.types.seedling')}</option>
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
            <div>
              <Field
                label={t('planting.yield')}
                type="number"
                inputMode="numeric"
                value={form.yieldPerBedMeter}
                onChange={(event) => update('yieldPerBedMeter', event.target.value)}
              />
              {/* Le repère publié se **propose** sous le champ, et ne le remplit que sur
                  un clic : « les références ne remplacent jamais les données de la
                  ferme » (brief microfermes, principe directeur). */}
              <SuggestionRendement
                farmId={farmId}
                speciesId={form.cropId ? Number(form.cropId) : null}
                valeurSaisie={form.yieldPerBedMeter}
                largeurPlancheMm={reglagesFerme.data?.bedSettings?.bedWidth ?? null}
                onAccepter={(valeur) => update('yieldPerBedMeter', valeur)}
              />
            </div>
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
              <div>
                <Field
                  label={t('planting.sowingDate')}
                  hint={t('planting.dateHint')}
                  value={form.sowingInput}
                  onChange={(event) => update('sowingInput', event.target.value)}
                  error={sowingDate ? undefined : t('common.required')}
                />
                {/* Sous le champ, au moment où la date se décide — et non dans un écran
                    à part, qu'on consulterait après coup. */}
                <MoonDateHint
                  date={sowingDate}
                  harvestedPart={especeChoisie?.harvestedPart}
                  onPick={(choix) => update('sowingInput', choix)}
                />
              </div>
              <Field
                label={`${t('planting.durationTypes.days_to_transplant')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                disabled={form.plantingType === 'direct_seeded' || form.plantingType === 'seedling'}
                value={form.daysToTransplant}
                onChange={(event) => update('daysToTransplant', event.target.value)}
              />
              <Field
                label={`${t('planting.durationTypes.days_to_maturity')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                disabled={form.plantingType === 'seedling'}
                value={form.daysToMaturity}
                onChange={(event) => update('daysToMaturity', event.target.value)}
              />
              <Field
                label={`${t('planting.durationTypes.harvest_window')} (${t('common.days')})`}
                type="number"
                inputMode="numeric"
                disabled={form.plantingType === 'seedling'}
                value={form.harvestWindow}
                onChange={(event) => update('harvestWindow', event.target.value)}
              />
            </div>
            {preview ? (
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(preview.dates).map(([type, date]) => (
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
                {preview.harvestPeriod ? (
                  <li className="flex justify-between gap-2 rounded-lg bg-earth-100 px-3 py-2 dark:bg-earth-700">
                    <span>{t('planting.harvestPeriod')}</span>
                    <span className="tabular-nums">
                      {formatDate(preview.harvestPeriod.begin, locale)} →{' '}
                      {formatDate(preview.harvestPeriod.end, locale)}
                    </span>
                  </li>
                ) : null}
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
            <StatTile
              label={t('planting.seedlings')}
              value={Math.round(computed.seedlings).toLocaleString(locale)}
            />
            <StatTile
              label={t('planting.holes')}
              value={Math.round(computed.holes).toLocaleString(locale)}
            />
            <StatTile
              label={t('planting.seedsNumber')}
              value={Math.round(computed.seedsNumber).toLocaleString(locale)}
              hint={
                computed.seedsWeightGrams === null
                  ? undefined
                  : formatSeedWeight(computed.seedsWeightGrams, locale)
              }
            />
            <StatTile label={t('planting.containers')} value={computed.containers ?? '—'} />
          </div>

          {existing.data ? (
            <div className="card space-y-2">
              <p className="text-sm font-semibold">{t('planting.expectedYield')}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatQuantity(
                  existing.data.computed.expectedYield,
                  locale,
                  existing.data.unit?.name,
                )}
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

      {/* Les notes d'une série n'ont de sens qu'une fois la série créée : sur l'écran de
          création, il n'y a pas encore d'identifiant auquel les rattacher. */}
      {plantingId && can('notes', 'read') ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">{t('notes.title')}</h2>
          <NoteList farmId={farmId} plantingId={plantingId} />
        </section>
      ) : null}
    </>
  );
}
