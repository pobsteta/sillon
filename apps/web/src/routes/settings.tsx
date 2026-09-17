// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Paramétrage : référentiel de la ferme, équipe, réglages, compte et export RGPD.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentSession, useFarmId } from '../lib/session.js';
import {
  useContainers,
  useCrops,
  useFamilies,
  useFarmMutation,
  useMembers,
  useProviders,
  useTags,
  useTaskTypes,
  useUnits,
  useVarieties,
} from '../lib/queries.js';
import { api } from '../lib/api.js';
import { Field, Loading, PageHeader, Select } from '../components/ui.js';

type ResourceKey =
  'families' | 'crops' | 'varieties' | 'providers' | 'units' | 'containers' | 'tags' | 'task-types';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const farmId = useFarmId();
  const { farm, canEdit, canManageFarm, can } = useCurrentSession();
  const [tab, setTab] = useState<ResourceKey>('families');

  const families = useFamilies(farmId);
  const crops = useCrops(farmId);
  const varieties = useVarieties(farmId);
  const providers = useProviders(farmId);
  const units = useUnits(farmId);
  const containers = useContainers(farmId);
  const tags = useTags(farmId);
  const taskTypes = useTaskTypes(farmId);
  const members = useMembers(farmId);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('');

  const create = useFarmMutation(farmId, (input: { resource: ResourceKey; body: unknown }) =>
    api(`/api/farms/${farmId}/${input.resource}`, { method: 'POST', body: input.body }),
  );
  const remove = useFarmMutation(farmId, (input: { resource: ResourceKey; id: number }) =>
    api(`/api/farms/${farmId}/${input.resource}/${input.id}`, { method: 'DELETE' }),
  );
  const invite = useFarmMutation(farmId, (email: string) =>
    api(`/api/farms/${farmId}/invitations`, { method: 'POST', body: { email } }),
  );

  const lists: Record<ResourceKey, { id: number; name: string }[]> = {
    families: families.data ?? [],
    crops: crops.data ?? [],
    varieties: varieties.data ?? [],
    providers: providers.data ?? [],
    units: units.data ?? [],
    containers: containers.data ?? [],
    tags: tags.data ?? [],
    'task-types': taskTypes.data ?? [],
  };

  const labels: Record<ResourceKey, string> = {
    families: t('settings.families'),
    crops: t('settings.crops'),
    varieties: t('settings.varieties'),
    providers: t('settings.providers'),
    units: t('settings.units'),
    containers: t('settings.containers'),
    tags: t('settings.tags'),
    'task-types': t('settings.taskTypes'),
  };

  const buildBody = (): Record<string, unknown> | null => {
    const name = (draft.name ?? '').trim();
    if (!name) return null;
    switch (tab) {
      case 'families':
        return { name, color: draft.color ?? '#4d7c0f', interval: Number(draft.interval ?? 3) };
      case 'crops':
        return draft.familyId
          ? { name, color: draft.color ?? '#4d7c0f', familyId: Number(draft.familyId) }
          : null;
      case 'varieties':
        return draft.cropId && draft.providerId
          ? { name, cropId: Number(draft.cropId), providerId: Number(draft.providerId) }
          : null;
      case 'containers':
        return { name, size: Number(draft.size ?? 60) };
      case 'tags':
      case 'task-types':
        return { name, color: draft.color ?? '#4d7c0f' };
      default:
        return { name };
    }
  };

  if (!farm) return <Loading />;

  return (
    <>
      <PageHeader title={t('settings.title')} />

      <section className="card mb-6">
        <h2 className="mb-3 text-lg font-semibold">{t('settings.reference')}</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(lists) as ResourceKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              className={tab === key ? 'btn-primary' : 'btn-ghost'}
              onClick={() => {
                setTab(key);
                setDraft({});
              }}
            >
              {labels[key]}
            </button>
          ))}
        </div>

        {canEdit ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label={t('common.name')}
              value={draft.name ?? ''}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {tab === 'families' ? (
              <Field
                label={t('settings.rotationInterval')}
                type="number"
                value={draft.interval ?? '3'}
                onChange={(event) => setDraft({ ...draft, interval: event.target.value })}
              />
            ) : null}
            {tab === 'crops' ? (
              <Select
                label={t('planting.family')}
                value={draft.familyId ?? ''}
                onChange={(event) => setDraft({ ...draft, familyId: event.target.value })}
              >
                <option value="">—</option>
                {(families.data ?? []).map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {tab === 'varieties' ? (
              <>
                <Select
                  label={t('planting.crop')}
                  value={draft.cropId ?? ''}
                  onChange={(event) => setDraft({ ...draft, cropId: event.target.value })}
                >
                  <option value="">—</option>
                  {(crops.data ?? []).map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label={t('orders.provider')}
                  value={draft.providerId ?? ''}
                  onChange={(event) => setDraft({ ...draft, providerId: event.target.value })}
                >
                  <option value="">—</option>
                  {(providers.data ?? []).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
            {tab === 'containers' ? (
              <Field
                label={t('planting.holes')}
                type="number"
                value={draft.size ?? '60'}
                onChange={(event) => setDraft({ ...draft, size: event.target.value })}
              />
            ) : null}
            {['families', 'crops', 'tags', 'task-types'].includes(tab) ? (
              <Field
                label={t('common.color')}
                type="color"
                value={draft.color ?? '#4d7c0f'}
                onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              />
            ) : null}
            <div className="flex items-end">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => {
                  const body = buildBody();
                  if (!body) return;
                  create.mutate({ resource: tab, body }, { onSuccess: () => setDraft({}) });
                }}
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        ) : null}

        <ul className="divide-y divide-earth-100 dark:divide-earth-700">
          {lists[tab].map((item) => (
            <li key={item.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span>{item.name}</span>
              {canEdit ? (
                <button
                  type="button"
                  className="btn-ghost px-3 text-sm"
                  onClick={() => {
                    if (!window.confirm(t('common.confirmDelete'))) return;
                    remove.mutate({ resource: tab, id: item.id });
                  }}
                >
                  {t('common.delete')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {can('team', 'read') ? (
        <section className="card mb-6">
          <h2 className="mb-3 text-lg font-semibold">{t('settings.team')}</h2>
          <ul className="mb-4 divide-y divide-earth-100 dark:divide-earth-700">
            {(members.data ?? []).map(
              (member: { userId: number; role: string; user: { email: string } }) => (
                <li
                  key={member.userId}
                  className="flex min-h-11 items-center justify-between gap-3 py-2"
                >
                  <span className="truncate">{member.user.email}</span>
                  <span className="chip bg-earth-100 dark:bg-earth-700">
                    {t(`settings.roles.${member.role}`)}
                  </span>
                </li>
              ),
            )}
          </ul>
          {canManageFarm ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={t('settings.invite')}
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={!inviteEmail}
                onClick={() => invite.mutate(inviteEmail, { onSuccess: () => setInviteEmail('') })}
              >
                {t('common.add')}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* §3.6 : « export complet des données de la ferme, auto-service, à tout moment ».
          Un lien nu plutôt qu'un appel fetch : le navigateur enchaîne le téléchargement
          avec le cookie de session, et l'archive ne transite pas par la mémoire de la page. */}
      {canEdit ? (
        <section className="card mb-6">
          <h2 className="mb-3 text-lg font-semibold">{t('settings.export')}</h2>
          <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
            {t('settings.exportHint')}
          </p>
          <a className="btn-ghost" href={`/api/farms/${farm?.id}/export.zip`} download>
            {t('settings.exportDownload')}
          </a>
        </section>
      ) : null}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t('settings.account')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t('common.language')}
            value={i18n.resolvedLanguage}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </Select>
          {canManageFarm ? (
            <a className="btn-ghost" href={`/api/farms/${farmId}/export`} download>
              {t('settings.exportData')}
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
}
