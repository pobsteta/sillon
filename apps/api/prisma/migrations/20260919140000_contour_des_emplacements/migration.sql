-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Contour des emplacements, en GeoJSON.
--
-- Une colonne JSON plutôt que PostGIS : une ferme compte quelques dizaines de planches, et
-- ce qu'on en tire — surface, centre, plus grand côté — se calcule dans `@sillon/core`.
-- PostGIS coûterait une autre image PostgreSQL et fermerait peut-être la porte aux
-- hébergements gratuits, pour des requêtes spatiales dont personne n'a l'usage ici.
-- Voir `brief/carte-du-jardin.md` §3.

ALTER TABLE "locations" ADD COLUMN "geometry" JSONB;
