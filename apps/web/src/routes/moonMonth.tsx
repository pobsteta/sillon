// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vue mois du calendrier lunaire (lot 3 de `brief/jardinage-lunaire.md`).
//
// Ce que cet écran remplace : le calendrier papier sur le mur de la remise. D'où la forme —
// un mois en grille, qu'on lit d'un coup d'œil et qu'on imprime — et non une liste.
//
// Les tâches posées dessus sont ce que Sillon ajoute à un calendrier du commerce : celui-ci
// dit « jour racine » ; celui-là dit « jour racine, et vous avez trois semis de carottes
// prévus ». Rien n'est pour autant recommandé ni déplacé : la lune ne commande rien.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { addDays, toIsoDate, type IsoDate } from '@sillon/core';
import { useMoonYear, useTasks } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import { EmptyState, Loading, PageHeader } from '../components/ui.js';
import type { MoonDay, Task } from '../lib/types.js';

/** Fond par type de jour. Des teintes sourdes : la grille se lit, elle ne clignote pas. */
const FOND: Record<MoonDay['dayType'], string> = {
  racine: 'bg-amber-50 dark:bg-amber-950',
  feuille: 'bg-emerald-50 dark:bg-emerald-950',
  fleur: 'bg-sky-50 dark:bg-sky-950',
  fruit: 'bg-rose-50 dark:bg-rose-950',
};

const premierDuMois = (date: IsoDate): IsoDate => `${date.slice(0, 7)}-01`;

/** Les jours à afficher : le mois, précédé des cases vides qui alignent le lundi. */
function grilleDuMois(mois: IsoDate): (IsoDate | null)[] {
  const premier = new Date(`${mois}T00:00:00Z`);
  // `getUTCDay` compte dimanche = 0 ; la semaine française commence le lundi.
  const avant = (premier.getUTCDay() + 6) % 7;
  const suivant = new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 1, 1));
  const nombre = Math.round((suivant.getTime() - premier.getTime()) / 86_400_000);

  return [
    ...Array.from({ length: avant }, () => null),
    ...Array.from({ length: nombre }, (_, index) => addDays(mois, index)),
  ];
}

export function MoonMonthPage() {
  const { t, i18n } = useTranslation();
  const { farm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const allume = farm?.moonCalendar === true;

  const [mois, setMois] = useState<IsoDate>(() => premierDuMois(toIsoDate(new Date())));
  const annee = Number(mois.slice(0, 4));

  const calendrier = useMoonYear(farmId, annee, allume && farmId > 0);
  const cases = grilleDuMois(mois);
  const dernier = cases.at(-1)!;
  const taches = useTasks(farmId, { from: mois, to: dernier });

  if (!allume) {
    return (
      <>
        <PageHeader title={t('moon.title')} />
        <EmptyState message={t('moon.disabled')} />
      </>
    );
  }
  if (calendrier.isLoading) return <Loading />;

  const parDate = new Map((calendrier.data ?? []).map((jour) => [jour.date, jour]));
  const tachesParDate = new Map<string, Task[]>();
  for (const tache of taches.data ?? []) {
    const jour = tache.effectiveDate ?? tache.plannedDate;
    if (!tachesParDate.has(jour)) tachesParDate.set(jour, []);
    tachesParDate.get(jour)!.push(tache);
  }

  const libelleMois = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'fr', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${mois}T00:00:00Z`));

  const deplacer = (pas: number) => {
    const base = new Date(`${mois}T00:00:00Z`);
    setMois(
      toIsoDate(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + pas, 1))) as IsoDate,
    );
  };

  return (
    <>
      <PageHeader title={t('moon.title')}>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </PageHeader>

      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => deplacer(-1)}
          aria-label={t('moon.previousMonth')}
        >
          ‹
        </button>
        <p className="font-semibold capitalize">{libelleMois}</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => deplacer(1)}
          aria-label={t('moon.nextMonth')}
        >
          ›
        </button>
      </div>

      <h2 className="mb-3 hidden text-lg font-semibold capitalize print:block">{libelleMois}</h2>

      <div
        className="grid grid-cols-7 gap-1 text-xs"
        role="grid"
        aria-label={t('moon.monthGrid', { month: libelleMois })}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <p key={index} className="pb-1 text-center font-semibold" role="columnheader">
            {t(`moon.weekday.${index}`)}
          </p>
        ))}
        {cases.map((date, index) => {
          if (!date) return <div key={`vide-${index}`} role="gridcell" />;
          const jour = parDate.get(date);
          const duJour = tachesParDate.get(date) ?? [];
          return (
            <div key={date} role="gridcell" className="contents">
              {/* Toute la case est un lien, et non un `div` muni d'un `onClick` : on
                  l'ouvre au clavier, dans un nouvel onglet, on l'imprime avec son adresse.
                  Un gestionnaire de clic aurait l'air de marcher et ne ferait rien de tout
                  cela. */}
              {/* Pas d'`aria-label` : il **remplacerait** le contenu de la case au lieu de
                  s'y ajouter, et un lecteur d'écran annoncerait « journée du 15 » là où il
                  lit aujourd'hui « 15, Fruit, montante, 2 tâches ». Le contenu de la case
                  est déjà le meilleur nom qu'on puisse lui donner. */}
              <Link
                to="/calendrier-lunaire/$date"
                params={{ date }}
                className={`block min-h-20 rounded-lg border border-earth-200 p-1 hover:border-sillon-600 dark:border-earth-700 ${
                  jour ? FOND[jour.dayType] : ''
                }`}
              >
                <p className="font-semibold tabular-nums">{date.slice(8)}</p>
                {jour ? (
                  <>
                    <p className="truncate">{t(`moon.dayType.${jour.dayType}`)}</p>
                    <p className="truncate text-earth-700 dark:text-earth-200">
                      {t(`moon.trend.${jour.trend}`)}
                    </p>
                    {jour.singularities.map((point) => (
                      <p key={point} className="truncate text-earth-700 dark:text-earth-200">
                        {t(`moon.singularity.${point}`)}
                      </p>
                    ))}
                  </>
                ) : null}
                {duJour.length > 0 ? (
                  <p className="mt-1 font-medium">
                    {t('moon.tasksOnDay', { count: duJour.length })}
                  </p>
                ) : null}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-earth-700 dark:text-earth-200">{t('moon.disclaimer')}</p>
    </>
  );
}
