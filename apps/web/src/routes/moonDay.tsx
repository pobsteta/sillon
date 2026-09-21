// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fiche d'une journée du calendrier lunaire.
//
// **Cet écran s'écarte de la règle 5 du brief lunaire, et c'est délibéré.** Le §7 de
// `brief/jardinage-lunaire.md` interdit « favorable », « idéal », « meilleur moment » ;
// le §10 met en garde contre l'attente d'un contenu éditorial. On trouve ici les deux : un
// indice chiffré et des conseils par type de jour et par mois. C'est une demande explicite,
// tranchée le 20 septembre 2026, et consignée au §11 du brief plutôt que laissée tacite.
//
// Ce qui tient toujours, et qu'il ne faut pas laisser filer à la prochaine retouche :
//
// 1. **l'indice s'ouvre.** Le bouton « Comment cet indice est calculé » dit d'où viennent
//    les points retirés et rappelle que rien n'a jamais été mesuré. Un chiffre affiché gros
//    au milieu d'un écran passe pour une mesure : c'est ce bouton qui l'en empêche ;
// 2. **la lune ne commande rien** (§7 règles 1 à 3). Les tâches suggérées ne s'ajoutent à
//    aucun plan, aucune date n'est refusée, aucune série ne bouge ;
// 3. **les conseils ne recopient aucun calendrier publié.** Ce sont des travaux d'usage
//    écrits pour Sillon, et la fiche le dit en toutes lettres en bas de page ;
// 4. **éteint par défaut.** Rien de tout cela n'existe tant que la ferme n'a pas allumé.
//
// La valeur propre à Sillon est plus bas, et c'est elle qui justifie cet écran plutôt qu'un
// calendrier du commerce : les espèces **du référentiel de la ferme** qui correspondent au
// type du jour, et les **tâches réellement prévues** ce jour-là, marquées quand elles
// correspondent. Lunaterra doit demander ce qu'on cultive ; Sillon le sait déjà.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCrops, useMoonDayDetail, useTasks, useWeather } from '../lib/queries.js';
import { useCurrentSession, useFarmId } from '../lib/session.js';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../components/ui.js';
import { CielDuJour, GLYPHE_ELEMENT, TEINTE_TYPE } from '../components/CielDuJour.js';
import type { Crop, MoonDayDetail, Task } from '../lib/types.js';

/** Le pivot du brief §4 : ce qu'on récolte, et le type de jour qui s'y rattache. */
const PARTIE_PAR_TYPE: Record<MoonDayDetail['dayType'], Crop['harvestedPart']> = {
  racine: 'root',
  feuille: 'leaf',
  fleur: 'flower',
  fruit: 'fruit',
};

/**
 * Espèces nommées avant de passer au décompte. Douze noms tiennent sur trois lignes de
 * téléphone ; au-delà, la liste cesse de se lire et devient un pavé.
 */
const ESPECES_MONTREES = 12;

/** Anneau de progression : le chiffre se lit, l'anneau se voit de loin. */
function Jauge({ score, label }: { score: number; label: string }) {
  const rayon = 26;
  const circonference = 2 * Math.PI * rayon;

  return (
    <svg viewBox="0 0 64 64" width={60} height={60} role="img" aria-label={label}>
      <circle
        cx={32}
        cy={32}
        r={rayon}
        fill="none"
        strokeWidth={5}
        className="stroke-earth-200 dark:stroke-earth-700"
      />
      <circle
        cx={32}
        cy={32}
        r={rayon}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(circonference * score) / 100} ${circonference}`}
        // Départ en haut plutôt qu'à trois heures : un anneau qui commence sur le côté se
        // lit mal, et personne ne saurait dire où il finit.
        transform="rotate(-90 32 32)"
        className="stroke-sillon-600 dark:stroke-sillon-300"
      />
      <text
        x={32}
        y={37}
        textAnchor="middle"
        className="fill-current text-[17px] font-semibold tabular-nums"
      >
        {score}
      </text>
    </svg>
  );
}

export function MoonDayPage({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const farmId = useFarmId();
  const { farm } = useCurrentSession();
  const allume = farm?.moonCalendar === true;
  const [explication, setExplication] = useState(false);

  const fiche = useMoonDayDetail(farmId, date, allume && farmId > 0);
  const meteo = useWeather(farmId, date, allume && farmId > 0);
  const taches = useTasks(farmId, { from: date, to: date });
  const especes = useCrops(farmId);

  const mois = Number(date.slice(5, 7));
  const libelleDate = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'fr', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  const libelleMois = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'fr', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

  if (!allume) {
    return (
      <>
        <PageHeader title={t('moon.title')} />
        <EmptyState message={t('moon.disabled')} />
      </>
    );
  }
  if (fiche.isError)
    return <ErrorNotice error={fiche.error} onRetry={() => void fiche.refetch()} />;
  if (fiche.isLoading || !fiche.data) return <Loading />;

  const jour = fiche.data;
  // Seule la décroissance change le dessin : pleine et nouvelle n'ont pas de sens de
  // marche, et le disque est alors symétrique de toute façon.
  const croissante = jour.phase !== 'decroissante';
  const partie = PARTIE_PAR_TYPE[jour.dayType];

  // Les espèces du référentiel de la **ferme** qui se récoltent de ce type — et non une
  // liste écrite d'avance. C'est la différence entre un calendrier du commerce et un outil
  // qui connaît déjà le plan de culture (brief §2).
  const especesDuType = (especes.data ?? []).filter((espece) => espece.harvestedPart === partie);

  const tachesDuJour = taches.data ?? [];
  // Une tâche « correspond » quand l'une de ses séries porte une espèce de ce type. C'est
  // la seule affirmation de cet écran qui ne soit ni une convention ni un conseil : un
  // fait sur le plan de culture, vérifiable ligne à ligne.
  const idsDuType = new Set(especesDuType.map((espece) => espece.id));
  const correspond = (tache: Task) =>
    tache.plantings.some(({ planting }) => idsDuType.has(planting.crop.id));

  // Conseils et travaux d'usage, par type de jour et par mois. `returnObjects` : ce sont
  // des listes dans les fichiers de traduction, pas des chaînes.
  const conseils = t(`moon.advice.${jour.dayType}.${mois}.tips`, {
    returnObjects: true,
    defaultValue: [],
  }) as string[];
  const suggerees = t(`moon.advice.${jour.dayType}.${mois}.tasks`, {
    returnObjects: true,
    defaultValue: [],
  }) as string[];

  return (
    <>
      <PageHeader title={t('moon.title')}>
        <Link to="/calendrier-lunaire" className="btn-ghost no-print">
          {t('moon.day.back')}
        </Link>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </PageHeader>

      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm capitalize text-earth-700 dark:text-earth-200">{libelleDate}</p>

        <CielDuJour jour={jour} croissante={croissante} meteo={meteo.data ?? null} />

        <IndiceDuJour
          jour={jour}
          ouvert={explication}
          onBascule={() => setExplication((etat) => !etat)}
        />

        <section className="card">
          <p
            className={`flex items-center gap-2 font-semibold uppercase ${TEINTE_TYPE[jour.dayType]}`}
          >
            <span aria-hidden className="text-2xl">
              {GLYPHE_ELEMENT[jour.element]}
            </span>
            {t(`moon.dayType.${jour.dayType}`)}
          </p>

          {jour.dayTypeChanges.length > 0 ? (
            <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
              {/* « puis jour racine à 14h08 » : ce que disent les calendriers imprimés, et
                  sans quoi la journée serait décrite en trop simple. */}
              {t('moon.then', {
                type: t(`moon.dayType.${jour.dayTypeChanges.at(-1)!.to}`),
                at: jour.dayTypeChanges.at(-1)!.at,
              })}
            </p>
          ) : null}

          <h2 className="sr-only">{t('moon.day.cropsTitle')}</h2>
          {especesDuType.length > 0 ? (
            <p className="mt-3 text-lg">
              {especesDuType
                .slice(0, ESPECES_MONTREES)
                .map((espece) => espece.name)
                .join(', ')}
              {/* Le reste se compte plutôt que de disparaître : une liste coupée en
                  silence ferait croire à un référentiel plus court qu'il n'est. */}
              {especesDuType.length > ESPECES_MONTREES
                ? ` ${t('moon.day.cropsMore', { count: especesDuType.length - ESPECES_MONTREES })}`
                : null}
            </p>
          ) : especes.isSuccess ? (
            // Seulement une fois le référentiel arrivé : affiché pendant le chargement, ce
            // message dirait « aucune espèce de ce type » à des fermes qui en ont, le temps
            // d'une requête — et c'est la phrase qu'on retiendrait.
            <p className="mt-3 text-sm text-earth-700 dark:text-earth-200">
              {t('moon.day.cropsNone')}
            </p>
          ) : null}

          <p className="mt-3 text-sm text-sillon-700 dark:text-sillon-300">
            ↗ {t(`moon.period.${jour.dayType}.${jour.trend}`)}
          </p>
        </section>

        {conseils.length > 0 ? (
          <section className="card">
            <h2 className="font-semibold text-orange-700 dark:text-orange-300">
              💡 {t('moon.day.tips')}
            </h2>
            <ul className="mt-2 space-y-1">
              {conseils.map((conseil) => (
                <li key={conseil} className="flex gap-2 text-sm">
                  <span aria-hidden className="text-orange-600 dark:text-orange-400">
                    ●
                  </span>
                  {conseil}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {suggerees.length > 0 ? (
          <section className="card">
            <h2 className="font-semibold">☑ {t('moon.day.suggested')}</h2>
            <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
              {/* Dit d'où viennent ces lignes et qu'elles ne touchent à rien : sans cette
                  phrase, elles ressembleraient à des tâches de la ferme. */}
              {t('moon.day.suggestedHint', {
                type: t(`moon.dayType.${jour.dayType}`).toLowerCase(),
                month: libelleMois,
              })}
            </p>
            <ul className="mt-2 space-y-1">
              {suggerees.map((travail) => (
                <li key={travail} className="flex gap-2 text-sm">
                  <span aria-hidden className="text-earth-700 dark:text-earth-200">
                    ○
                  </span>
                  {travail}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="card">
          <h2 className="font-semibold">{t('moon.day.farmTasks')}</h2>
          {taches.isLoading ? (
            <Loading />
          ) : tachesDuJour.length === 0 ? (
            <p className="mt-2 text-sm text-earth-700 dark:text-earth-200">
              {t('moon.day.farmTasksNone')}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {tachesDuJour.map((tache) => (
                <li key={tache.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span aria-hidden>{tache.done ? '☑' : '☐'}</span>
                  <span>{tache.type?.name ?? t(`tasks.natures.${tache.defaultType}`)}</span>
                  <span className="text-earth-700 dark:text-earth-200">
                    {tache.plantings
                      .map(({ planting }) => planting.crop.name)
                      .filter((nom, index, liste) => liste.indexOf(nom) === index)
                      .join(', ')}
                  </span>
                  {correspond(tache) ? (
                    <span className="chip bg-sillon-100 text-sillon-900 dark:bg-sillon-900 dark:text-sillon-100">
                      {t('moon.day.matches')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-earth-700 dark:text-earth-200">{t('moon.day.disclaimer')}</p>
        <p className="text-xs text-earth-700 dark:text-earth-200">{t('moon.disclaimer')}</p>
      </div>
    </>
  );
}

/**
 * L'indice, et le bouton qui l'ouvre.
 *
 * Le bouton n'est pas un ornement : c'est lui qui tient la promesse faite en tête de
 * fichier. Un indice qu'on ne peut pas ouvrir n'est qu'un argument d'autorité, et le
 * retirer reviendrait à changer la nature de cet écran sans que rien ne casse.
 */
function IndiceDuJour({
  jour,
  ouvert,
  onBascule,
}: {
  jour: MoonDayDetail;
  ouvert: boolean;
  onBascule: () => void;
}) {
  const { t } = useTranslation();
  const { index } = jour;

  return (
    <section className="card border-sillon-200 bg-sillon-50 dark:border-sillon-900 dark:bg-earth-800">
      <div className="flex items-center gap-3">
        <Jauge score={index.score} label={t('moon.day.indexAria', { score: index.score })} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sillon-800 dark:text-sillon-200">
            {t(`moon.indexLabel.${index.label}`)}
          </p>
          {index.window ? (
            <p className="mt-0.5 text-sm text-earth-700 dark:text-earth-200">
              {t(`moon.dayPart.${index.window.part}`)} ·{' '}
              <span className="tabular-nums">
                {t('moon.day.window', { from: index.window.from, to: index.window.to })}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-earth-700 dark:text-earth-200">
              {t('moon.day.noWindow')}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-ghost no-print min-w-11 px-3"
          aria-expanded={ouvert}
          aria-label={t('moon.day.explain')}
          onClick={onBascule}
        >
          <span aria-hidden>ⓘ</span>
        </button>
      </div>

      {ouvert ? (
        <div className="mt-3 border-t border-sillon-200 pt-3 text-sm dark:border-earth-700">
          <h3 className="font-semibold">{t('moon.day.explainTitle')}</h3>
          <p className="mt-1 text-earth-700 dark:text-earth-200">{t('moon.day.explainBody')}</p>

          <h3 className="mt-3 font-semibold">{t('moon.day.reasonsTitle')}</h3>
          {index.reasons.length === 0 ? (
            <p className="mt-1 text-earth-700 dark:text-earth-200">{t('moon.day.reasonsNone')}</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {index.reasons.map((raison) => (
                <li key={raison.code} className="flex justify-between gap-3">
                  <span>{t(`moon.indexReason.${raison.code}`)}</span>
                  <span className="tabular-nums text-earth-700 dark:text-earth-200">
                    {raison.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {index.window ? (
            <p className="mt-3 text-xs text-earth-700 dark:text-earth-200">
              {t('moon.day.windowHint')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
