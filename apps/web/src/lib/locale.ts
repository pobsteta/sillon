// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from 'react-i18next';

/** Langue active, toujours définie : i18next peut renvoyer `undefined` avant l'initialisation. */
export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? 'fr';
}
