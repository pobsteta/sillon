// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Bandeau lunaire de la semaine, sur la feuille de tâches.
//
// Trois règles du brief tiennent dans ce fichier, et elles ne sont pas décoratives :
//
// 1. **Sillon affiche, n'affirme pas.** « Jour racine », « lune descendante » décrivent un
//    état du ciel : ce sont des faits. Aucun mot du type « favorable », « idéal » ou
//    « meilleur moment » n'apparaît ici.
// 2. **La lune ne commande rien.** Ce bandeau n'empêche aucune tâche, ne déplace rien et
//    n'avertit de rien. Il se lit, ou pas.
// 3. **Éteint par défaut.** Le composant ne rend rien tant que la ferme ne l'a pas allumé :
//    qui ne pratique pas ne doit pas voir un mot de plus à l'écran.

import { useTranslation } from 'react-i18next';
import { addDays, type IsoDate } from '@sillon/core';
import { useMoonYear } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import type { MoonDay } from '../lib/types.js';

/** Un glyphe par type de jour : la feuille de tâches est déjà dense. */
const SIGNE: Record<MoonDay['dayType'], string> = {
  racine: '⌄',
  feuille: '❦',
  fleur: '✽',
  fruit: '●',
};

export function MoonStrip({ from }: { from: IsoDate }) {
  const { t } = useTranslation();
  const { farm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const allume = farm?.moonCalendar === true;

  const jours = [0, 1, 2, 3, 4, 5, 6].map((decalage) => addDays(from, decalage));
  // La semaine peut chevaucher deux années : on demande les deux, chacune étant gardée.
  const annees = [...new Set(jours.map((jour) => Number(jour.slice(0, 4))))];
  const premiere = useMoonYear(farmId, annees[0]!, allume && farmId > 0);
  const seconde = useMoonYear(farmId, annees[1] ?? annees[0]!, allume && farmId > 0);

  if (!allume) return null;

  const parDate = new Map(
    [...(premiere.data ?? []), ...(seconde.data ?? [])].map((jour) => [jour.date, jour]),
  );
  if (parDate.size === 0) return null;

  return (
    <section
      className="mb-4 rounded-lg border border-earth-200 bg-white p-2 dark:border-earth-700 dark:bg-earth-800"
      aria-label={t('moon.week')}
    >
      <ul className="grid grid-cols-7 gap-1 text-center">
        {jours.map((date) => {
          const jour = parDate.get(date);
          if (!jour) return <li key={date} />;
          return (
            <li key={date} className="text-xs">
              <p className="text-earth-700 dark:text-earth-200">{date.slice(8)}</p>
              <p className="text-lg leading-tight" aria-hidden>
                {SIGNE[jour.dayType]}
              </p>
              <p className="truncate">{t(`moon.dayType.${jour.dayType}`)}</p>
              <p className="truncate text-earth-700 dark:text-earth-200">
                {t(`moon.trend.${jour.trend}`)}
              </p>
              {jour.dayTypeChanges.length > 0 ? (
                <p className="truncate text-[10px] text-earth-700 dark:text-earth-200">
                  {/* « puis jour racine à 14h08 » : ce que disent les calendriers
                      imprimés, et sans quoi la journée serait décrite en trop simple. */}
                  {t('moon.then', {
                    type: t(`moon.dayType.${jour.dayTypeChanges.at(-1)!.to}`),
                    at: jour.dayTypeChanges.at(-1)!.at,
                  })}
                </p>
              ) : null}
              {jour.singularities.map((point) => (
                <p key={point} className="truncate text-[10px] text-earth-700 dark:text-earth-200">
                  {t(`moon.singularity.${point}`)}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
