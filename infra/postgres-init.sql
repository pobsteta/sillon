-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Exécuté une seule fois, à la création du conteneur, sous POSTGRES_USER — que l'image
-- PostgreSQL crée **superutilisateur**.
--
-- Les extensions demandent ce rôle : elles sont installées ici, avant la première
-- migration Prisma (qui les retrouve déjà en place).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS ltree;

-- Un superutilisateur **ignore** la Row-Level Security : l'application qui se connecterait
-- sous POSTGRES_USER verrait toutes les fermes, et l'isolation ne serait testée nulle part.
-- On crée donc un rôle applicatif ordinaire, propriétaire de la base pour pouvoir appliquer
-- les migrations — la même condition qu'en production et qu'en intégration continue.
-- Mot de passe de développement uniquement, comme POSTGRES_PASSWORD juste à côté.
CREATE ROLE sillon_app LOGIN PASSWORD 'sillon';
ALTER DATABASE sillon_dev OWNER TO sillon_app;
