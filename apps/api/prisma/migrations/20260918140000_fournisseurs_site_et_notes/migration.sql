-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Le site et les notes d'un fournisseur : de quoi rendre la feuille de commande utilisable
-- telle quelle. Ni catalogue, ni tarifs, ni disponibilités — ce sont des données tierces et
-- changeantes, que personne ne tiendrait à jour.

ALTER TABLE "providers"
  ADD COLUMN "url" TEXT,
  ADD COLUMN "notes" TEXT;
