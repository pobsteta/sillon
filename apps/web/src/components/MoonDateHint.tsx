// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Type du jour sous une date de semis, et les deux dates voisines du type que la culture
// appelle (lot 3 de `brief/jardinage-lunaire.md`).
//
// « Corrige au moment où l'on décide, pas après » : c'est tout l'intérêt de le mettre là
// plutôt que dans un écran séparé. Les deux règles qui encadrent cet affichage :
//
// - **la lune ne commande rien** : les dates proposées sont des boutons, jamais une
//   correction automatique, et la date saisie reste valable quoi qu'il arrive ;
// - **on décrit, on n'affirme pas** : « jour feuille » est un fait ; le reste serait une
//   promesse d'efficacité que Sillon ne fait pas.

import { useTranslation } from 'react-i18next';
import { addDays, type IsoDate } from '@sillon/core';
import { useMoonYear } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import type { MoonDay } from '../lib/types.js';

const TYPE_ATTENDU: Record<string, MoonDay['dayType']> = {
  root: 'racine',
  leaf: 'feuille',
  flower: 'fleur',
  fruit: 'fruit',
};

export function MoonDateHint({
  date,
  harvestedPart,
  onPick,
}: {
  date: IsoDate | null;
  harvestedPart: string | null | undefined;
  onPick: (date: IsoDate) => void;
}) {
  const { t } = useTranslation();
  const { farm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const allume = farm?.moonCalendar === true;

  const annee = date ? Number(date.slice(0, 4)) : 0;
  const calendrier = useMoonYear(farmId, annee, allume && farmId > 0 && annee > 0);

  if (!allume || !date) return null;
  const parDate = new Map((calendrier.data ?? []).map((jour) => [jour.date, jour]));
  const jour = parDate.get(date);
  if (!jour) return null;

  const attendu = harvestedPart ? TYPE_ATTENDU[harvestedPart] : undefined;
  const correspond = attendu !== undefined && jour.dayType === attendu;

  // Les deux dates les plus proches du bon type, dans la fenêtre de trois jours que le
  // brief impose. Au-delà, c'est l'agronomie qui commande.
  const proches: IsoDate[] = [];
  if (attendu && !correspond) {
    for (let ecart = 1; ecart <= 3 && proches.length < 2; ecart += 1) {
      for (const candidat of [addDays(date, -ecart), addDays(date, ecart)]) {
        if (proches.length >= 2) break;
        if (parDate.get(candidat)?.dayType === attendu) proches.push(candidat);
      }
    }
  }

  return (
    <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
      {t(`moon.dayType.${jour.dayType}`)} · {t(`moon.trend.${jour.trend}`)}
      {correspond ? ` · ${t('moon.matchesCrop')}` : null}
      {proches.length > 0 ? (
        <>
          {' · '}
          {t('moon.nearby', { type: t(`moon.dayType.${attendu!}`) })}{' '}
          {proches.map((candidat) => (
            <button
              key={candidat}
              type="button"
              className="ml-1 underline underline-offset-2"
              onClick={() => onPick(candidat)}
            >
              {candidat.slice(8)}/{candidat.slice(5, 7)}
            </button>
          ))}
        </>
      ) : null}
    </p>
  );
}
