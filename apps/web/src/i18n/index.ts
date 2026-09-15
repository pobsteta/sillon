// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// i18next : français et anglais en V1, architecture prête pour l'espagnol et le néerlandais
// (§3.7 du brief). Les fichiers JSON sont destinés à être traduits sur Weblate.

import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export async function setupI18n(): Promise<typeof i18next> {
  await i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { fr: { translation: fr }, en: { translation: en } },
      fallbackLng: 'fr',
      supportedLngs: SUPPORTED_LOCALES as unknown as string[],
      interpolation: { escapeValue: false },
      detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
    });
  return i18next;
}

export default i18next;
