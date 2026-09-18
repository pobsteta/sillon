// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Feuille de tâches de la semaine (§3.2) : vue par défaut au champ, cases à cocher larges,
// validation en deux touches, et impression de la feuille hebdomadaire.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { addDays, formatIsoWeek, today, weekRange, type IsoDate } from '@sillon/core';
import { useFarmId } from '../lib/session.js';
import { useFamilies, useTaskTypes, useTasks } from '../lib/queries.js';
import { api, QueuedOfflineError } from '../lib/api.js';
import { Drawer, EmptyState, Loading, PageHeader, Select, Toggle } from '../components/ui.js';
import { MoonStrip } from '../components/MoonStrip.js';
import { formatDate, formatLaborTime } from '../lib/format.js';
import type { Task } from '../lib/types.js';

const STATUS_STYLES: Record<Task['status'], string> = {
  done: 'bg-earth-100 text-earth-700 dark:bg-earth-700 dark:text-earth-100',
  late: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  today: 'bg-sillon-100 text-sillon-800 dark:bg-sillon-900 dark:text-sillon-100',
  upcoming: 'bg-earth-100 text-earth-700 dark:bg-earth-700 dark:text-earth-100',
};

export function TaskList({
  tasks,
  farmId,
  compact = false,
}: {
  tasks: Task[];
  farmId: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [notice, setNotice] = useState<string | null>(null);

  const queryClient = useQueryClient();

  /**
   * Validation optimiste : la case se coche immédiatement, avant la réponse du serveur.
   * C'est la règle des « deux touches » du §7.3 — au champ, en 3G ou sans réseau,
   * attendre un aller-retour rendrait la saisie pénible.
   */
  const complete = useMutation({
    mutationFn: (input: { ids: number[]; done: boolean }) =>
      api(`/api/farms/${farmId}/tasks/complete`, {
        method: 'POST',
        body: { ids: input.ids, done: input.done, effectiveDate: today() },
        // Validable sans réseau : la requête part alors dans la file d'attente.
        deferrable: t('tasks.markDone'),
      }),
    onMutate: async (input: { ids: number[]; done: boolean }) => {
      const filter = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[0] === 'farm' &&
          query.queryKey[1] === farmId &&
          query.queryKey[2] === 'tasks',
      };
      await queryClient.cancelQueries(filter);
      const snapshot = queryClient.getQueriesData<Task[]>(filter);
      queryClient.setQueriesData<Task[]>(filter, (tasks) =>
        tasks?.map((task) =>
          input.ids.includes(task.id)
            ? { ...task, done: input.done, status: input.done ? 'done' : 'today' }
            : task,
        ),
      );
      return { snapshot };
    },
    onError: (error: unknown, _input, context) => {
      if (error instanceof QueuedOfflineError) {
        // La saisie est conservée dans la file : on garde l'affichage optimiste.
        setNotice(t('app.offline'));
        return;
      }
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      setNotice(t('common.error'));
    },
    onSuccess: () => setNotice(null),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['farm', farmId] });
    },
  });

  const toggle = (task: Task) => complete.mutate({ ids: [task.id], done: !task.done });

  return (
    <>
      {notice ? (
        <p role="status" className="mb-2 rounded-lg bg-amber-100 p-2 text-sm text-amber-950">
          {notice}
        </p>
      ) : null}
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="card flex items-start gap-3 py-3">
            <input
              type="checkbox"
              className="mt-0.5 size-6 shrink-0 accent-sillon-600"
              checked={task.done}
              aria-label={task.done ? t('tasks.markUndone') : t('tasks.markDone')}
              onChange={() => toggle(task)}
            />
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${task.done ? 'line-through opacity-60' : ''}`}>
                {task.type?.name ?? t('tasks.title')}
                {task.method ? ` · ${task.method.name}` : ''}
              </p>
              <p className="truncate text-sm text-earth-700 dark:text-earth-200">
                {task.plantings
                  .map((link) =>
                    link.planting.variety
                      ? `${link.planting.crop.name} — ${link.planting.variety.name}`
                      : link.planting.crop.name,
                  )
                  .join(', ')}
                {task.locations.length > 0
                  ? ` · ${task.locations.map((link) => link.location.name).join(', ')}`
                  : ''}
              </p>
              {task.description && !compact ? (
                <p className="mt-1 text-sm">{task.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`chip ${STATUS_STYLES[task.status]}`}>
                {t(`tasks.status.${task.status}`)}
              </span>
              <span className="text-xs tabular-nums text-earth-700 dark:text-earth-200">
                {formatDate(task.plannedDate, locale)}
              </span>
              {task.plannedLaborTime ? (
                <span className="text-xs text-earth-700 dark:text-earth-200">
                  {formatLaborTime(task.plannedLaborTime)}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TasksPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const farmId = useFarmId();
  const [anchor, setAnchor] = useState<IsoDate>(today());
  const [typeId, setTypeId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const range = weekRange(anchor);
  const taskTypes = useTaskTypes(farmId);
  const families = useFamilies(farmId);
  const tasks = useTasks(farmId, {
    week: range.begin,
    includeLate: true,
    typeId: typeId || undefined,
    familyId: familyId || undefined,
    done: hideDone ? false : undefined,
  });

  return (
    <>
      <PageHeader title={t('tasks.title')}>
        <button type="button" className="btn-ghost no-print" onClick={() => setFiltersOpen(true)}>
          {t('common.filters')}
        </button>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </PageHeader>

      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setAnchor(addDays(anchor, -7))}
          aria-label={t('tasks.previousWeek')}
        >
          ‹
        </button>
        <div className="text-center">
          <p className="font-semibold">{formatIsoWeek(range.begin)}</p>
          <p className="text-xs text-earth-700 dark:text-earth-200">
            {formatDate(range.begin, locale)} → {formatDate(range.end, locale)}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setAnchor(addDays(anchor, 7))}
          aria-label={t('tasks.nextWeek')}
        >
          ›
        </button>
      </div>

      <h2 className="mb-3 hidden text-lg font-semibold print:block">
        {t('tasks.sheet')} — {formatIsoWeek(range.begin)}
      </h2>

      {/* Sans `no-print` : le brief demande le type de jour sur la feuille imprimée, qui
          est ce qu'on emporte au champ. */}
      <MoonStrip from={range.begin} />

      {tasks.isLoading ? (
        <Loading />
      ) : tasks.data && tasks.data.length > 0 ? (
        <TaskList tasks={tasks.data} farmId={farmId} />
      ) : (
        <EmptyState message={t('tasks.empty')} />
      )}

      <Drawer open={filtersOpen} title={t('common.filters')} onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <Select
            label={t('tasks.type')}
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {(taskTypes.data ?? []).map((type: { id: number; name: string }) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('planting.family')}
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {(families.data ?? []).map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </Select>
          <Toggle
            label={t('tasks.status.done')}
            checked={!hideDone}
            onChange={(value) => setHideDone(!value)}
          />
        </div>
      </Drawer>
    </>
  );
}
