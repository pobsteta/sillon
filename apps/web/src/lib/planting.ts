// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Petits accesseurs d'affichage sur une série. Porté de Brinjel
// (https://framagit.org/brinjel/brinjel, © André Hoarau) — AGPL-3.0-or-later.

import type { IsoDate } from '@sillon/core';
import type { Planting } from './types.js';

/**
 * Date qui situe la série dans le calendrier : la mise en place au champ quand
 * elle existe, sinon le semis (cas d'une production de plants).
 */
export function mainDate(planting: Planting): IsoDate | null {
  return planting.fieldDate ?? planting.dates.sowing?.planned ?? null;
}

/** Début de la première fenêtre de récolte, `null` si aucune n'est calculée. */
export function firstHarvestDate(planting: Planting): IsoDate | null {
  return planting.harvestPeriods[0]?.begin ?? null;
}

/** Fin de la dernière fenêtre de récolte. */
export function lastHarvestDate(planting: Planting): IsoDate | null {
  return planting.harvestPeriods.at(-1)?.end ?? null;
}
