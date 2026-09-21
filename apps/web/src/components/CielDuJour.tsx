// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Le bandeau du ciel : la lune, sa phase, ses heures, et ce que le lieu ajoute.
//
// **Partagé entre la fiche du jour et le tableau de bord**, et non recopié. Les deux
// écrans disent la même chose du même ciel ; deux exemplaires auraient divergé à la
// première retouche — un glyphe changé ici, une phase renommée là — et rien n'aurait
// signalé l'écart, puisque les deux resteraient plausibles.
//
// Les règles du brief lunaire tiennent toujours : ce bandeau décrit l'état du ciel, il
// n'en tire aucune recommandation. L'indice chiffré et ses conseils vivent dans la fiche
// du jour, derrière un bouton qui les explique — pas ici.

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '../lib/locale.js';
import { MoonDisc } from './MoonDisc.js';
import type { MoonDayDetail, Weather } from '../lib/types.js';

/** Un glyphe par élément. Décoratif, donc `aria-hidden`. */
export const GLYPHE_ELEMENT: Record<MoonDayDetail['element'], string> = {
  feu: '🔥',
  terre: '🥕',
  air: '🌸',
  eau: '🌿',
};

export const TEINTE_TYPE: Record<MoonDayDetail['dayType'], string> = {
  racine: 'text-amber-700 dark:text-amber-300',
  feuille: 'text-emerald-700 dark:text-emerald-300',
  fleur: 'text-sky-700 dark:text-sky-300',
  fruit: 'text-rose-700 dark:text-rose-300',
};

/**
 * Code WMO 4677 vers une famille de temps.
 *
 * Les bornes sont celles de la table : les intervalles ne sont pas contigus, et un
 * `switch` sur les valeurs exactes manquerait la moitié des codes qu'Open-Meteo rend.
 */
function familleMeteo(code: number | null): string {
  if (code === null) return 'unknown';
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 86) return 'showers';
  return 'thunder';
}

const PICTO_METEO: Record<string, string> = {
  clear: '☀️',
  partly: '🌤️',
  cloudy: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  rain: '🌧️',
  snow: '❄️',
  showers: '🌦️',
  thunder: '⛈️',
  unknown: '·',
};

/** Un dixième d'unité en nombre lisible. Les entiers sont la règle ; l'affichage est un bord. */
const dixiemes = (valeur: number | null, locale: string): string | null =>
  valeur === null ? null : (valeur / 10).toLocaleString(locale, { maximumFractionDigits: 1 });

/**
 * L'échéance de lunaison la plus proche : pleine ou nouvelle lune.
 *
 * Toujours annoncer la pleine lune donnerait « dans 26 jours » les veilles de nouvelle
 * lune — exact, et sans intérêt pour qui règle ses semis sur ce cycle.
 */
function prochaineLunaison(jour: MoonDayDetail, t: TFunction): string {
  const pleine = jour.nextFullMoon.inDays <= jour.nextNewMoon.inDays;
  const echeance = pleine ? jour.nextFullMoon : jour.nextNewMoon;
  const cle = pleine ? 'fullMoon' : 'newMoon';
  return echeance.inDays === 0
    ? t(`moon.day.${cle}Today`)
    : t(`moon.day.${cle}In`, { count: echeance.inDays });
}

/** Le bandeau du haut : la lune, le ciel, et ce que le lieu ajoute. */
export function CielDuJour({
  jour,
  croissante,
  meteo,
}: {
  jour: MoonDayDetail;
  croissante: boolean;
  meteo: Weather | null;
}) {
  const { t } = useTranslation();
  // La langue vient du hook, et non d'une propriété : deux appelants la passaient à
  // l'identique, ce qui n'était qu'un passe-plat de plus à tenir à jour.
  const locale = useLocale();

  /** « 16h31 → 00h06 », ou ce qu'on peut en dire quand l'un des deux manque. */
  const heuresLune = () => {
    if (jour.moonrise && jour.moonset) {
      return t('moon.day.moonTimes', { rise: jour.moonrise, set: jour.moonset });
    }
    if (jour.moonrise) return t('moon.day.moonTimesRiseOnly', { rise: jour.moonrise });
    if (jour.moonset) return t('moon.day.moonTimesSetOnly', { set: jour.moonset });
    return t('moon.day.moonTimesNone');
  };

  // La température du moment quand elle existe — elle n'est rendue que pour aujourd'hui —
  // et le maximum du jour sinon.
  const temperature = meteo?.temperatureNow ?? meteo?.temperatureMax ?? null;
  const famille = familleMeteo(meteo?.weatherCode ?? null);

  return (
    <section className="card">
      <div className="flex items-start gap-3">
        <MoonDisc illumination={jour.illumination} waxing={croissante} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{t(`moon.phaseDetail.${jour.phaseDetail}`)}</h2>
            <p className="text-sm text-sillon-700 dark:text-sillon-300">
              <span aria-hidden>{jour.trend === 'montante' ? '↑' : '↓'}</span>{' '}
              {t(`moon.trend.${jour.trend}`)}
            </p>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={TEINTE_TYPE[jour.dayType]}>
              <span aria-hidden>{GLYPHE_ELEMENT[jour.element]}</span>{' '}
              {t(`moon.element.${jour.element}`)}
            </span>
            <span className="text-earth-700 dark:text-earth-200">
              <span aria-hidden>🌙</span> {heuresLune()}
            </span>
          </p>

          {/* La plus proche des deux, et non systématiquement la pleine lune : trois jours
              avant la nouvelle lune, « pleine lune dans 26 jours » est exact et inutile. */}
          <p className="mt-1 text-sm text-earth-700 dark:text-earth-200">
            {prochaineLunaison(jour, t)}
          </p>

          {jour.singularities.length > 0 ? (
            <p className="mt-1 text-sm text-earth-700 dark:text-earth-200">
              {jour.singularities.map((point) => t(`moon.singularity.${point}`)).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      {/* La ligne du lieu. Sans position, la fiche dit pourquoi elle n'a pas d'heures
          plutôt que de faire silence — sans quoi on chercherait une panne. */}
      <div className="mt-3 border-t border-earth-200 pt-3 text-sm dark:border-earth-700">
        {jour.observer === null ? (
          <p className="text-earth-700 dark:text-earth-200">{t('moon.day.noPosition')}</p>
        ) : (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-earth-700 dark:text-earth-200">
            {meteo ? (
              <span>
                <span aria-hidden>{PICTO_METEO[famille]}</span> {t(`moon.weather.${famille}`)}
                {temperature !== null ? ` · ${dixiemes(temperature, locale)} °C` : null}
              </span>
            ) : null}
            {jour.sunrise && jour.sunset ? (
              <span>
                <span aria-hidden>☀</span>{' '}
                {t('moon.day.sunTimes', { rise: jour.sunrise, set: jour.sunset })}
              </span>
            ) : null}
          </p>
        )}
      </div>
    </section>
  );
}
