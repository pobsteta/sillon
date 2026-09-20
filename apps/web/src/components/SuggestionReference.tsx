// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// La suggestion sourcée, sous un champ de saisie (lot A de
// `specs/brief-sillon-references-microfermes.md`).
//
// **Le principe directeur du brief tient dans ce fichier** : « les références ne
// remplacent jamais les données de la ferme ». Quatre conséquences, et aucune n'est
// décorative :
//
// 1. **elle ne paraît que sur un champ vide.** Une valeur saisie par quelqu'un n'est jamais
//    recouverte, ni même discutée — la ferme sait ce qu'elle récolte, la référence non ;
// 2. **rien n'est enregistré sans un clic.** Le bouton remplit le champ ; c'est
//    l'enregistrement du formulaire qui décide, comme pour toute autre saisie ;
// 3. **la provenance est visible sans survol.** Le nom de la source et son année sont
//    écrits ; la licence, la page et l'effectif viennent au survol. Une référence dont on
//    ne peut pas retrouver l'origine n'est plus une référence, c'est une affirmation ;
// 4. **l'unité est convertie**, et c'est le piège principal. Les sources publient des kg
//    par mètre **carré**, Sillon saisit par mètre **de planche**. Sans la largeur de
//    planche de la ferme, la suggestion se tait plutôt que de supposer 80 cm.

import { useTranslation } from 'react-i18next';
import { medianeDesReferences, yieldPerBedMeterFromReference } from '@sillon/core';
import { useLocale } from '../lib/locale.js';
import { useReferences } from '../lib/queries.js';
import type { ReferenceValue } from '../lib/types.js';

/** Une source citée en clair : « Pépinière-Mesclun, Morel 2023 ». */
function citer(valeur: ReferenceValue): string {
  const auteur = valeur.source.auteurs[0]?.split(',')[0] ?? valeur.source.id;
  return `${auteur} ${valeur.source.annee}`;
}

export function SuggestionRendement({
  farmId,
  speciesId,
  /** La saisie en cours. Non vide, la suggestion se retire. */
  valeurSaisie,
  /** Largeur de planche de la ferme, en millimètres. Absente, on se tait. */
  largeurPlancheMm,
  /** Reçoit la valeur en **unités par mètre de planche**, prête pour le champ. */
  onAccepter,
}: {
  farmId: number;
  speciesId: number | null;
  valeurSaisie: string;
  largeurPlancheMm: number | null | undefined;
  onAccepter: (valeur: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const references = useReferences(farmId, speciesId);

  // Un champ déjà rempli ne se discute pas : on ne propose rien par-dessus une saisie.
  if (valeurSaisie.trim() !== '') return null;
  if (!references.data || references.data.values.length === 0) return null;

  const avecRendement = references.data.values.filter((valeur) => valeur.yield !== null);
  if (avecRendement.length === 0) return null;

  const medianeM2 = medianeDesReferences(avecRendement.map((valeur) => valeur.yield!.median));
  if (medianeM2 === null) return null;

  const parMetreDePlanche = yieldPerBedMeterFromReference(medianeM2, largeurPlancheMm);
  if (parMetreDePlanche === null) {
    // La ferme n'a pas de largeur de planche : on dit pourquoi on ne propose rien, plutôt
    // que de disparaître — sans quoi on chercherait une panne.
    return (
      <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
        {t('references.noBedWidth')}
      </p>
    );
  }

  const affiche = (parMetreDePlanche / 1000).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  const sources = [...new Set(avecRendement.map(citer))].join(', ');
  // La page, l'effectif et la licence : de quoi rouvrir la source, au survol.
  const detail = avecRendement
    .map((valeur) => {
      const effectif = valeur.n === null ? '' : ` · n=${valeur.n}`;
      return `${valeur.source.titre} (${valeur.source.licence}) — ${valeur.pageRef}${effectif}`;
    })
    .join('\n');

  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-earth-700 dark:text-earth-200" title={detail}>
        {t('references.suggested', { value: affiche })}
      </span>
      <span
        className="chip bg-earth-100 text-earth-800 dark:bg-earth-700 dark:text-earth-100"
        title={detail}
      >
        {t('references.badge', { source: sources })}
      </span>
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={() => onAccepter(String(parMetreDePlanche / 1000))}
      >
        {t('references.use')}
      </button>
    </p>
  );
}
