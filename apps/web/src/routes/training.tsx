// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Centres de formation : modèles, apprenants, fin de formation.
//
// L'écran dit ce que le brief promet, et le dit à l'écran plutôt que dans une notice :
// le formateur apparaît dans l'équipe de l'apprenant (rien n'est caché), et terminer une
// formation ne supprime rien. Une action irréversible mal comprise serait pire ici
// qu'ailleurs, puisqu'elle porte sur le travail de quelqu'un d'autre.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { api, keys, useFarmMutation, useStudentFarms, useTrainingCenter } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import { EmptyState, ErrorNotice, Field, Loading, PageHeader, Select } from '../components/ui.js';
import type { StudentFarm, TrainingCenter } from '../lib/types.js';

export function TrainingPage() {
  const { t } = useTranslation();
  const { farm, canEdit, canManageFarm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const estCentre = farm?.trainingCenter === true;

  const centre = useTrainingCenter(farmId, farmId > 0 && estCentre);
  const [voirTerminees, setVoirTerminees] = useState(false);
  const apprenants = useStudentFarms(farmId, farmId > 0 && estCentre, voirTerminees);

  if (!farm) return <Loading />;
  if (!estCentre) {
    return (
      <>
        <PageHeader title={t('training.title')} />
        <EmptyState message={t('training.notACenter')} />
      </>
    );
  }
  if (centre.isLoading) return <Loading />;
  if (centre.error)
    return <ErrorNotice error={centre.error} onRetry={() => void centre.refetch()} />;
  if (!centre.data) return <Loading />;

  return (
    <>
      <PageHeader title={t('training.title')}>
        <span className="chip bg-earth-100 dark:bg-earth-700">
          {t('training.studentCount', {
            active: centre.data.activeStudentCount,
            total: centre.data.studentCount,
          })}
        </span>
      </PageHeader>

      <Modeles centre={centre.data} farmId={farmId} canEdit={canEdit} />

      {canEdit ? <NouvelApprenant centre={centre.data} farmId={farmId} /> : null}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('training.students')}</h2>
          <Select
            label={t('training.filter')}
            value={voirTerminees ? 'ended' : 'active'}
            onChange={(event) => setVoirTerminees(event.target.value === 'ended')}
          >
            <option value="active">{t('training.ongoing')}</option>
            <option value="ended">{t('training.finished')}</option>
          </Select>
        </div>
        {apprenants.isLoading ? <Loading /> : null}
        {(apprenants.data ?? []).length === 0 && !apprenants.isLoading ? (
          <p className="text-sm text-earth-700 dark:text-earth-200">{t('training.noStudent')}</p>
        ) : null}
        <ul className="divide-y divide-earth-100 dark:divide-earth-700">
          {(apprenants.data ?? []).map((apprenant) => (
            <Apprenant
              key={apprenant.farmId}
              apprenant={apprenant}
              farmId={farmId}
              canEdit={canEdit}
            />
          ))}
        </ul>
      </section>

      {canManageFarm ? <FinDuCentre farmId={farmId} centre={centre.data} /> : null}
    </>
  );
}

function Modeles({
  centre,
  farmId,
  canEdit,
}: {
  centre: TrainingCenter;
  farmId: number;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { session } = useCurrentSession();
  const [choix, setChoix] = useState('');

  const ajouter = useFarmMutation(farmId, (templateFarmId: number) =>
    api(`/api/farms/${farmId}/training-center/templates`, {
      method: 'POST',
      body: { templateFarmId },
    }),
  );
  const retirer = useFarmMutation(farmId, (templateFarmId: number) =>
    api(`/api/farms/${farmId}/training-center/templates/${templateFarmId}`, { method: 'DELETE' }),
  );

  // On ne propose que les fermes qu'on encadre : l'API refuse les autres, et proposer ce
  // qui sera refusé est une promesse qu'on ne tient pas.
  const deja = new Set(centre.templates.map((modele) => modele.id));
  const candidates = (session?.farms ?? []).filter(
    (candidate) =>
      !deja.has(candidate.id) && (candidate.role === 'owner' || candidate.role === 'manager'),
  );

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">{t('training.templates')}</h2>
      <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
        {t('training.templatesHint')}
      </p>
      <ul className="mb-4 divide-y divide-earth-100 dark:divide-earth-700">
        {centre.templates.map((modele) => (
          <li key={modele.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
            <span className="truncate">
              {modele.name}
              {modele.label ? (
                <span className="ml-2 text-sm text-earth-700 dark:text-earth-200">
                  {modele.label}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              {modele.isDefault ? (
                <span className="chip bg-sillon-100 dark:bg-sillon-900">
                  {t('training.default')}
                </span>
              ) : null}
              {canEdit && !modele.isDefault ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => retirer.mutate(modele.id)}
                >
                  {t('common.delete')}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {canEdit && candidates.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t('training.addTemplate')}
            value={choix}
            onChange={(event) => setChoix(event.target.value)}
          >
            <option value="">—</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            className="btn-primary"
            disabled={!choix}
            onClick={() => ajouter.mutate(Number(choix), { onSuccess: () => setChoix('') })}
          >
            {t('common.add')}
          </button>
        </div>
      ) : null}
      {ajouter.error ? <ErrorNotice error={ajouter.error} /> : null}
      {retirer.error ? <ErrorNotice error={retirer.error} /> : null}
    </section>
  );
}

function NouvelApprenant({ centre, farmId }: { centre: TrainingCenter; farmId: number }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [modele, setModele] = useState(String(centre.defaultTemplateFarmId));
  const [jours, setJours] = useState(String(centre.defaultTrainingDuration));
  const [bilan, setBilan] = useState<{ nom: string; lignes: number } | null>(null);

  const creer = useFarmMutation(
    farmId,
    () =>
      api<{ farm: { name: string }; copied: Record<string, number> }>(
        `/api/farms/${farmId}/training-center/students`,
        {
          method: 'POST',
          body: {
            email: email.trim(),
            ...(nom.trim() ? { name: nom.trim() } : {}),
            templateFarmId: Number(modele),
            trainingDays: Number(jours),
          },
        },
      ),
    {
      onSuccess: (resultat) => {
        setEmail('');
        setNom('');
        // Ce que la duplication a réellement repris : sans ce compte, une copie vide et
        // une copie complète se ressemblent à l'écran.
        setBilan({
          nom: resultat.farm.name,
          lignes: Object.values(resultat.copied).reduce((total, n) => total + n, 0),
        });
      },
    },
  );

  return (
    <section className="card mb-6">
      <h2 className="mb-1 text-lg font-semibold">{t('training.newStudent')}</h2>
      <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('training.newHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('training.studentEmail')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint={t('training.emailHint')}
        />
        <Field
          label={t('training.farmName')}
          value={nom}
          onChange={(event) => setNom(event.target.value)}
          placeholder={t('training.farmNamePlaceholder')}
        />
        <Select
          label={t('training.template')}
          value={modele}
          onChange={(event) => setModele(event.target.value)}
        >
          {centre.templates.map((candidat) => (
            <option key={candidat.id} value={candidat.id}>
              {candidat.name}
            </option>
          ))}
        </Select>
        <Field
          label={t('training.duration')}
          type="number"
          min={1}
          max={centre.maximumTrainingDuration}
          value={jours}
          onChange={(event) => setJours(event.target.value)}
          hint={t('training.durationHint', { max: centre.maximumTrainingDuration })}
        />
      </div>
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={!email.trim() || creer.isPending}
        onClick={() => creer.mutate(undefined as never)}
      >
        {creer.isPending ? t('training.creating') : t('training.create')}
      </button>
      {creer.error ? <ErrorNotice error={creer.error} /> : null}
      {bilan ? (
        <p role="status" className="mt-3 text-sm text-sillon-800 dark:text-sillon-200">
          {t('training.created', bilan)}
        </p>
      ) : null}
    </section>
  );
}

function Apprenant({
  apprenant,
  farmId,
  canEdit,
}: {
  apprenant: StudentFarm;
  farmId: number;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [confirme, setConfirme] = useState(false);

  const terminer = useFarmMutation(farmId, () =>
    api(`/api/farms/${farmId}/training-center/students/${apprenant.farmId}/end`, {
      method: 'POST',
      body: {},
    }),
  );

  const personne = apprenant.farm.owner?.email ?? apprenant.pendingEmail;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{apprenant.farm.name}</p>
        <p className="truncate text-sm text-earth-700 dark:text-earth-200">
          {personne ?? t('training.noOwner')}
          {apprenant.farm.owner ? null : (
            <span className="ml-2 chip bg-amber-100 dark:bg-amber-900">
              {t('training.pending')}
            </span>
          )}
        </p>
        <p className="text-xs text-earth-700 dark:text-earth-200">
          {apprenant.templateFarm
            ? t('training.fromTemplate', { name: apprenant.templateFarm.name })
            : t('training.templateGone')}
          {' · '}
          {apprenant.endedAt
            ? t('training.endedOn', { date: apprenant.endedAt.slice(0, 10) })
            : t('training.until', { date: apprenant.farm.trialExpiryDate.slice(0, 10) })}
        </p>
      </div>
      {canEdit && !apprenant.endedAt ? (
        confirme ? (
          <span className="flex flex-wrap items-center gap-2">
            {/* Ce qu'on retire et ce qu'on ne retire pas, écrit avant de cliquer. */}
            <span className="text-sm text-earth-700 dark:text-earth-200">
              {t('training.endConfirm')}
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => terminer.mutate(undefined as never)}
            >
              {t('training.endConfirmYes')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirme(false)}>
              {t('common.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setConfirme(true)}>
            {t('training.end')}
          </button>
        )
      ) : null}
      {terminer.error ? <ErrorNotice error={terminer.error} /> : null}
    </li>
  );
}

function FinDuCentre({ farmId, centre }: { farmId: number; centre: TrainingCenter }) {
  const { t } = useTranslation();
  const [confirme, setConfirme] = useState(false);
  const supprimer = useFarmMutation(farmId, () =>
    api(`/api/farms/${farmId}/training-center`, { method: 'DELETE' }),
  );

  return (
    <section className="card mt-6">
      <h2 className="mb-1 text-lg font-semibold">{t('training.closeCenter')}</h2>
      <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
        {centre.activeStudentCount > 0
          ? t('training.closeBlocked', { count: centre.activeStudentCount })
          : t('training.closeHint')}
      </p>
      {confirme ? (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => supprimer.mutate(undefined as never)}
          >
            {t('training.closeConfirm')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setConfirme(false)}>
            {t('common.cancel')}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn-ghost"
          disabled={centre.activeStudentCount > 0}
          onClick={() => setConfirme(true)}
        >
          {t('training.close')}
        </button>
      )}
      {supprimer.error ? <ErrorNotice error={supprimer.error} /> : null}
    </section>
  );
}

/**
 * Déclarer la ferme centre de formation, depuis les paramètres. Le modèle par défaut est
 * la ferme elle-même : c'est le jardin pédagogique de l'établissement, et c'est le seul
 * choix qui ne demande pas d'avoir déjà préparé une autre ferme.
 */
export function DeclareTrainingCenter() {
  const { t } = useTranslation();
  const { farm } = useCurrentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const farmId = farm?.id ?? 0;

  const declarer = useMutation({
    mutationFn: () =>
      api(`/api/farms/${farmId}/training-center`, {
        method: 'PUT',
        body: { defaultTemplateFarmId: farmId, defaultTrainingDuration: 365 },
      }),
    // La navigation lit `trainingCenter` dans la session : sans cette invalidation,
    // l'entrée « Formation » n'apparaîtrait qu'au rechargement de la page.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.session });
      void navigate({ to: '/formation' });
    },
  });

  if (farm?.trainingCenter) {
    return (
      <section className="card mb-6">
        <h2 className="mb-3 text-lg font-semibold">{t('training.title')}</h2>
        <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('training.isCenter')}</p>
        <Link to="/formation" className="btn-ghost">
          {t('training.open')}
        </Link>
      </section>
    );
  }

  return (
    <section className="card mb-6">
      <h2 className="mb-3 text-lg font-semibold">{t('training.title')}</h2>
      <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('training.declareHint')}</p>
      <button
        type="button"
        className="btn-ghost"
        disabled={declarer.isPending}
        onClick={() => declarer.mutate()}
      >
        {t('training.declare')}
      </button>
      {declarer.error ? <ErrorNotice error={declarer.error} /> : null}
    </section>
  );
}
