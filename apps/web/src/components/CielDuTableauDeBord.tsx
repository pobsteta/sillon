// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Le ciel du jour, sur le tableau de bord.
//
// Un enrobage court autour de `CielDuJour`, et non une seconde version : il apporte la
// date d'aujourd'hui, les deux requêtes, et un lien vers la fiche complète.
//
// **Trois règles du brief lunaire passent par ce fichier**, et aucune n'est décorative :
//
// 1. **éteint par défaut.** Le composant ne rend rien tant que la ferme n'a pas allumé le
//    calendrier — « qui ne pratique pas ne doit pas voir un mot de plus à l'écran ». Le
//    tableau de bord est la première page qu'on ouvre : c'est l'endroit où cette règle
//    compte le plus ;
// 2. **on décrit, on n'affirme pas.** Ce bandeau donne l'état du ciel. L'indice chiffré et
//    les conseils restent dans la fiche du jour, derrière le bouton qui les explique —
//    les remonter ici les afficherait à quelqu'un qui n'a rien demandé ;
// 3. **rien ne clignote en attendant.** Tant que la fiche n'est pas arrivée, le composant
//    ne rend rien plutôt qu'un cadre vide : un tableau de bord qui saute au chargement se
//    lit mal, et l'information n'est pas urgente.

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { today } from '@sillon/core';
import { useMoonDayDetail, useWeather } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import { CielDuJour } from './CielDuJour.js';

export function CielDuTableauDeBord() {
  const { t } = useTranslation();
  const { farm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const allume = farm?.moonCalendar === true;
  const date = today();

  const fiche = useMoonDayDetail(farmId, date, allume && farmId > 0);
  const meteo = useWeather(farmId, date, allume && farmId > 0);

  if (!allume || !fiche.data) return null;
  const jour = fiche.data;

  return (
    <section className="mb-4" aria-label={t('moon.title')}>
      <CielDuJour
        jour={jour}
        // Seule la décroissance change le dessin : pleine et nouvelle n'ont pas de sens
        // de marche, et le disque est alors symétrique de toute façon.
        croissante={jour.phase !== 'decroissante'}
        meteo={meteo.data ?? null}
      />
      <p className="mt-1 text-right text-xs">
        {/* Vers la fiche du jour : c'est là que vivent l'indice et les conseils, et le
            chemin doit être court depuis la page qu'on ouvre en premier. */}
        <Link
          to="/calendrier-lunaire/$date"
          params={{ date }}
          className="underline underline-offset-2"
        >
          {t('moon.day.open')}
        </Link>
      </p>
    </section>
  );
}
