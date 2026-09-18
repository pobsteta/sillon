-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Calendrier lunaire : un réglage par ferme, éteint par défaut, et le fuseau qui découpe
-- la journée civile — sans lui, le calendrier se décale d'un jour hors de France
-- métropolitaine sans que rien n'ait l'air cassé.

CREATE TYPE "ZodiacConvention" AS ENUM ('tropical', 'constellations');

ALTER TABLE "farms"
  ADD COLUMN "moon_calendar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moon_convention" "ZodiacConvention" NOT NULL DEFAULT 'constellations',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';
