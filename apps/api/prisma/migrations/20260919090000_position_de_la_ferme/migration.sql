-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Position de la ferme, en degrés décimaux WGS 84.
--
-- Nulle par défaut, et elle le reste : Sillon ne devine aucune position, et retire déjà
-- celles que portent les photos prises au champ. Celle-ci se pose volontairement.

ALTER TABLE "farms"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;
