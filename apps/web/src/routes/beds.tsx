// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Assolement : arbre du parcellaire, plan des planches sur une période, historique
// de rotation d'une planche.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { today } from '@sillon/core';
import { useCurrentSession, useFarmId } from '../lib/session.js';
import { useAssignmentPlan, useFarmMutation, useLocations, usePlantings } from '../lib/queries.js';
import { api, ApiError } from '../lib/api.js';
import { BedPlan, type BedOccupation, type PlacementEnCours } from '../components/BedPlan.js';
import {
  Drawer,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  Select,
  Toggle,
} from '../components/ui.js';
import { moveAssignment, parseLengthMeters, placeWholeOnBed } from '@sillon/core';
import { formatDate, formatLength } from '../lib/format.js';
import type { Planting } from '../lib/types.js';

export function BedsPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const { canEdit } = useCurrentSession();
  const navigate = useNavigate();

  const year = Number(today().slice(0, 4));
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const [placing, setPlacing] = useState<PlacementEnCours | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    parentId: '',
    lengthMeters: '30',
    widthCm: '80',
    greenhouse: false,
  });

  const locations = useLocations(farmId);
  const plan = useAssignmentPlan(farmId, from, to);
  const history = useHistory(farmId, historyFor);
  // Les séries de la saison qui n'occupent encore aucune planche : la matière du panneau
  // « à placer ». Le filtre `placed` existe déjà côté API.
  const unplaced = usePlantings(farmId, { year, placed: false });

  const place = useFarmMutation(
    farmId,
    ({
      plantingId,
      assignments,
      force,
    }: {
      plantingId: number;
      assignments: { locationId: number; length: number }[];
      force: boolean;
    }) =>
      api(`/api/farms/${farmId}/plantings/${plantingId}/assignments`, {
        method: 'PUT',
        body: { assignments, force },
      }),
  );

  const createLocation = useFarmMutation(farmId, (body: Record<string, unknown>) =>
    api(`/api/farms/${farmId}/locations`, { method: 'POST', body }),
  );

  /**
   * Dépôt d'une série sur une planche, quel que soit le geste qui l'a amenée là. Le
   * placement remplace ce que la série occupait ailleurs quand elle vient du panneau ;
   * quand un tronçon a été saisi sur une planche, seul ce tronçon bouge.
   */
  const deposer = async (locationId: number) => {
    if (!placing) return;
    const bed = (locations.data ?? []).find((location) => location.id === locationId);
    if (!bed) return;

    // Deux gestes, deux sources. Une série venue du panneau n'occupe rien : c'est sa
    // longueur de planche qu'il faut placer. Un tronçon saisi sur une planche connaît déjà
    // sa longueur, et seul lui doit bouger — d'où la liste complète des tronçons.
    const { assignments, remaining } =
      placing.sourceLocationId === null
        ? placeWholeOnBed(
            bed,
            (unplaced.data ?? []).find((serie) => serie.id === placing.plantingId)?.length ?? 0,
          )
        : moveAssignment(
            (plan.data?.occupations ?? [])
              .filter((occupation: BedOccupation) => occupation.plantingId === placing.plantingId)
              .map((occupation: BedOccupation) => ({
                locationId: occupation.locationId,
                length: occupation.length,
              })),
            placing.sourceLocationId,
            bed,
          );

    setPlacementError(null);
    try {
      await place.mutateAsync({ plantingId: placing.plantingId, assignments, force: false });
    } catch (cause) {
      // La rotation est la seule alerte bloquante : l'API refuse, et c'est à la personne
      // de trancher. Tout le reste (dépassement de longueur) passe avec un avertissement.
      const rotation =
        cause instanceof ApiError && /rotation/i.test(cause.message)
          ? window.confirm(t('beds.rotationConfirm'))
          : false;
      if (!rotation) {
        setPlacementError(cause instanceof ApiError ? cause.message : String(cause));
        return;
      }
      await place.mutateAsync({ plantingId: placing.plantingId, assignments, force: true });
    }

    setPlacing(null);
    if (remaining > 0)
      setPlacementError(t('beds.overflow', { length: formatLength(remaining, locale) }));
  };

  if (locations.isLoading) return <Loading />;

  const all = locations.data ?? [];
  const occupations = (plan.data?.occupations ?? []) as Parameters<
    typeof BedPlan
  >[0]['occupations'];

  return (
    <>
      <PageHeader title={t('beds.title')}>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
        {canEdit ? (
          <button type="button" className="btn-primary no-print" onClick={() => setCreating(true)}>
            {t('beds.newLocation')}
          </button>
        ) : null}
      </PageHeader>

      <div className="no-print mb-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="label">{t('common.from')}</span>
          <input
            type="date"
            className="field"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="label">{t('common.to')}</span>
          <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {canEdit ? (
        <ToPlacePanel
          plantings={unplaced.data ?? []}
          placing={placing}
          onPick={(planting) =>
            setPlacing(
              placing?.plantingId === planting.id && placing.sourceLocationId === null
                ? null
                : {
                    plantingId: planting.id,
                    name: planting.crop.name,
                    sourceLocationId: null,
                  },
            )
          }
          onCancel={() => setPlacing(null)}
          error={placementError}
        />
      ) : null}

      {all.length === 0 ? (
        <EmptyState message={t('beds.noBeds')} />
      ) : (
        <BedPlan
          locations={all}
          occupations={occupations}
          onSelectBed={setHistoryFor}
          onSelectPlanting={(plantingId) =>
            void navigate({ to: '/plan/$plantingId', params: { plantingId: String(plantingId) } })
          }
          placing={canEdit ? placing : null}
          onGrabPlaced={
            canEdit
              ? (occupation: BedOccupation) =>
                  setPlacing({
                    plantingId: occupation.plantingId,
                    name: occupation.cropName ?? t('beds.bed'),
                    sourceLocationId: occupation.locationId,
                  })
              : undefined
          }
          onDropOnBed={canEdit ? (locationId) => void deposer(locationId) : undefined}
        />
      )}

      <Drawer open={creating} title={t('beds.newLocation')} onClose={() => setCreating(false)}>
        <div className="space-y-4">
          <Field
            label={t('common.name')}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <Select
            label={t('beds.parent')}
            value={draft.parentId}
            onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
          >
            <option value="">— {t('beds.garden')} —</option>
            {all.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          <Field
            label={`${t('beds.bedLength')} (${t('common.meters')})`}
            type="number"
            step="0.1"
            value={draft.lengthMeters}
            onChange={(event) => setDraft({ ...draft, lengthMeters: event.target.value })}
          />
          <Field
            label={`${t('beds.bedWidth')} (${t('common.centimeters')})`}
            type="number"
            value={draft.widthCm}
            onChange={(event) => setDraft({ ...draft, widthCm: event.target.value })}
          />
          <Toggle
            label={t('beds.greenhouse')}
            checked={draft.greenhouse}
            onChange={(value) => setDraft({ ...draft, greenhouse: value })}
          />
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!draft.name}
            onClick={() =>
              createLocation.mutate(
                {
                  name: draft.name,
                  parentId: draft.parentId ? Number(draft.parentId) : null,
                  bedLength: parseLengthMeters(draft.lengthMeters) ?? 0,
                  bedWidth: draft.widthCm ? Math.round(Number(draft.widthCm) * 10) : null,
                  greenhouse: draft.greenhouse,
                },
                {
                  onSuccess: () => {
                    setCreating(false);
                    setDraft({ ...draft, name: '' });
                  },
                },
              )
            }
          >
            {t('common.save')}
          </button>
        </div>
      </Drawer>

      <Drawer
        open={historyFor !== null}
        title={t('beds.history')}
        onClose={() => setHistoryFor(null)}
      >
        {history.isLoading ? (
          <Loading />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState message={t('common.empty')} />
        ) : (
          <ul className="space-y-2">
            {(history.data ?? []).map((entry) => (
              <li key={`${entry.plantingId}-${entry.range.begin}`} className="card py-3">
                <p className="font-medium">
                  {entry.planting?.crop?.name}
                  {entry.planting?.variety ? ` — ${entry.planting.variety.name}` : ''}
                </p>
                <p className="text-sm text-earth-700 dark:text-earth-200">
                  {entry.planting?.crop?.family?.name} · {formatLength(entry.length, locale)}
                </p>
                <p className="text-xs tabular-nums">
                  {formatDate(entry.range.begin, locale)} → {formatDate(entry.range.end, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}

interface HistoryEntry {
  plantingId: number;
  length: number;
  range: { begin: string; end: string };
  planting: {
    crop: { name: string; family?: { name: string } };
    variety: { name: string } | null;
  } | null;
}

function useHistory(farmId: number, locationId: number | null) {
  return useQuery<HistoryEntry[]>({
    queryKey: ['farm', farmId, 'location-history', locationId],
    queryFn: () => api<HistoryEntry[]>(`/api/farms/${farmId}/locations/${locationId}/history`),
    enabled: locationId !== null,
  });
}

/**
 * Panneau des séries qui n'occupent encore aucune planche. C'est le point de départ des
 * deux gestes : on fait glisser une puce sur une planche, ou on la touche puis on touche
 * « Placer ici ». La puce reste un `<button>` — au clavier, c'est le seul chemin, et le
 * glisser-déposer natif HTML ignore le toucher de toute façon.
 */
function ToPlacePanel({
  plantings,
  placing,
  onPick,
  onCancel,
  error,
}: {
  plantings: Planting[];
  placing: PlacementEnCours | null;
  onPick: (planting: Planting) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { t } = useTranslation();

  return (
    <section className="no-print mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('beds.toPlace')}</h2>
        {placing ? (
          <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
            {t('beds.stopPlacing')}
          </button>
        ) : null}
      </div>

      {placing ? (
        <p role="status" className="mb-2 text-xs text-sillon-800 dark:text-sillon-200">
          {t('beds.placing', { name: placing.name })}
        </p>
      ) : (
        <p className="mb-2 text-xs text-earth-700 dark:text-earth-200">{t('beds.placeHint')}</p>
      )}

      {error ? <ErrorNotice error={error} /> : null}

      {plantings.length === 0 ? (
        <p className="text-xs text-earth-700 dark:text-earth-200">{t('beds.toPlaceNone')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {plantings.map((planting) => {
            const choisie =
              placing?.plantingId === planting.id && placing.sourceLocationId === null;
            return (
              <li key={planting.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={() => {
                    if (!choisie) onPick(planting);
                  }}
                  onClick={() => onPick(planting)}
                  aria-pressed={choisie}
                  className={`chip cursor-grab ${
                    choisie
                      ? 'bg-sillon-600 text-white'
                      : 'bg-earth-100 text-earth-900 dark:bg-earth-700 dark:text-earth-50'
                  }`}
                  style={choisie ? undefined : { borderLeft: `4px solid ${planting.crop.color}` }}
                >
                  {planting.crop.name}
                  {planting.variety ? ` · ${planting.variety.name}` : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
