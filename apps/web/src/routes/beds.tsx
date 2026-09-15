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
import { useAssignmentPlan, useFarmMutation, useLocations } from '../lib/queries.js';
import { api } from '../lib/api.js';
import { BedPlan } from '../components/BedPlan.js';
import {
  Drawer,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Select,
  Toggle,
} from '../components/ui.js';
import { formatDate, formatLength } from '../lib/format.js';

export function BedsPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const { canEdit } = useCurrentSession();
  const navigate = useNavigate();

  const year = Number(today().slice(0, 4));
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState<number | null>(null);
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

  const createLocation = useFarmMutation(farmId, (body: Record<string, unknown>) =>
    api(`/api/farms/${farmId}/locations`, { method: 'POST', body }),
  );

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
                  bedLength: Math.round(Number(draft.lengthMeters.replace(',', '.')) * 100),
                  bedWidth: draft.widthCm ? Number(draft.widthCm) : null,
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
