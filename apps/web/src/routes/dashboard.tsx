// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from '@tanstack/react-router';
import { useLocale } from '../lib/locale.js';
import { today, weekRange } from '@sillon/core';
import { useFarmId, useCurrentSession } from '../lib/session.js';
import { usePlantings, useStats, useTasks } from '../lib/queries.js';
import { EmptyState, Loading, PageHeader } from '../components/ui.js';
import { formatDate, formatLaborTime } from '../lib/format.js';
import { TaskList } from './tasks.js';

export function DashboardPage() {
  const locale = useLocale();
  const farmId = useFarmId();
  const { farm } = useCurrentSession();
  const week = weekRange(today());
  const year = Number(today().slice(0, 4));
  const tasks = useTasks(farmId, { week: week.begin, includeLate: true });
  const stats = useStats(farmId, year);
  const upcoming = usePlantings(farmId, { sort: 'date', order: 'asc', year });

  if (tasks.isLoading || stats.isLoading) return <Loading />;

  const allTasks = tasks.data ?? [];
  const late = allTasks.filter((task) => task.status === 'late');
  const todayTasks = allTasks.filter((task) => task.status === 'today');
  const doneThisWeek = allTasks.filter((task) => task.done).length;
  const nextSowings = (upcoming.data ?? [])
    .map((planting) => ({ planting, sowing: planting.dates.sowing?.planned ?? null }))
    .filter((entry) => entry.sowing !== null && entry.sowing >= today())
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const placed = stats.data?.plantings.placed ?? 0;
  const totalPlantings = stats.data?.plantings.total ?? 0;
  const done = stats.data?.tasks.done ?? 0;
  const totalTasks = stats.data?.tasks.total ?? 0;
  const placedPct = Math.min(100, (placed / Math.max(1, totalPlantings)) * 100);
  const donePct = Math.min(100, (done / Math.max(1, totalTasks)) * 100);

  return (
    <div className="dashboard">
      <PageHeader title="Tableau de bord">
        <Link to="/plan/nouvelle" className="btn-primary dashboard-add">
          <span aria-hidden>＋</span> Nouvelle série
        </Link>
      </PageHeader>

      <section className="dashboard-hero">
        <div>
          <div className="dashboard-eyebrow">
            <span className="dashboard-leaf">⌁</span> {farm?.name ?? 'Votre ferme'}
          </div>
          <h1>
            {greeting}, <span>maraîcher.</span>
          </h1>
          <p>Voici ce qui vous attend au champ aujourd’hui.</p>
        </div>
        <div className="dashboard-date">
          <strong>
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </strong>
          <span>Saison {year}</span>
        </div>
      </section>

      <section className="dashboard-kpis">
        <article className="dashboard-kpi kpi-green">
          <div className="kpi-icon">✓</div>
          <div>
            <span>Tâches cette semaine</span>
            <strong>{stats.data?.tasks.total ?? 0}</strong>
            <small>
              {doneThisWeek} terminée{doneThisWeek > 1 ? 's' : ''}
            </small>
          </div>
        </article>
        <article className="dashboard-kpi kpi-amber">
          <div className="kpi-icon">!</div>
          <div>
            <span>À faire aujourd’hui</span>
            <strong>{todayTasks.length}</strong>
            <small>{late.length ? late.length + ' en retard' : 'Aucun retard'}</small>
          </div>
        </article>
        <article className="dashboard-kpi kpi-earth">
          <div className="kpi-icon">▦</div>
          <div>
            <span>Séries en culture</span>
            <strong>{totalPlantings}</strong>
            <small>{placed} sur l’assolement</small>
          </div>
        </article>
        <article className="dashboard-kpi kpi-revenue">
          <div className="kpi-icon">€</div>
          <div>
            <span>Produit prévisionnel</span>
            <strong>
              {((stats.data?.yields.expectedRevenue ?? 0) / 100).toLocaleString(locale, {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </strong>
            <small>
              {formatLaborTime(stats.data?.tasks.labor.effective ?? 0)} de travail saisi
            </small>
          </div>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-tasks">
          <div className="dashboard-card-head">
            <div>
              <h2>À faire cette semaine</h2>
              <p>Vos travaux planifiés et leur avancement</p>
            </div>
            <Link to="/taches">Tout voir →</Link>
          </div>
          {allTasks.length > 0 ? (
            <TaskList tasks={allTasks.slice(0, 7)} farmId={farmId} compact />
          ) : (
            <EmptyState message="Aucune tâche cette semaine" />
          )}
        </section>

        <aside className="dashboard-card dashboard-sowing">
          <div className="dashboard-card-head">
            <div>
              <h2>Prochains semis</h2>
              <p>Les prochaines implantations</p>
            </div>
            <Link to="/plan">Plan →</Link>
          </div>
          {nextSowings.length > 0 ? (
            <ul className="sowing-list">
              {nextSowings.map(({ planting, sowing }) => (
                <li key={planting.id}>
                  <span className="sowing-dot" style={{ backgroundColor: planting.crop.color }} />
                  <div>
                    <Link to="/plan/$plantingId" params={{ plantingId: String(planting.id) }}>
                      {planting.crop.name}
                      {planting.variety ? ' · ' + planting.variety.name : ''}
                    </Link>
                    <small>{planting.inGreenhouse ? 'Sous abri' : 'Plein champ'}</small>
                  </div>
                  <time>{formatDate(sowing!, locale)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              message="Aucune série à venir"
              action={
                <Link to="/plan" className="btn-primary">
                  Ouvrir le plan
                </Link>
              }
            />
          )}
        </aside>
      </div>

      <section className="dashboard-card dashboard-season">
        <div className="dashboard-card-head">
          <div>
            <h2>La saison {year} en un coup d’œil</h2>
            <p>État de votre plan de culture</p>
          </div>
          <Link to="/statistiques">Statistiques →</Link>
        </div>
        <div className="season-progress">
          <div>
            <div className="progress-label">
              <span>Séries placées</span>
              <strong>
                {placed} / {totalPlantings}
              </strong>
            </div>
            <div className="progress-track">
              <i style={{ width: placedPct + '%' }} />
            </div>
          </div>
          <div>
            <div className="progress-label">
              <span>Tâches réalisées</span>
              <strong>
                {done} / {totalTasks}
              </strong>
            </div>
            <div className="progress-track">
              <i style={{ width: donePct + '%' }} />
            </div>
          </div>
          <div className="season-summary">
            <span>Travail effectif</span>
            <strong>{formatLaborTime(stats.data?.tasks.labor.effective ?? 0)}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
