-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Les extensions demandent le rôle superutilisateur : elles sont installées à la création
-- du conteneur, avant la première migration Prisma (qui les retrouve déjà en place).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS ltree;
