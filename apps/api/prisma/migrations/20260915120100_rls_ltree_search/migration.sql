-- SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (mécanismes d'origine, Brinjel)
-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Ce que Prisma ne sait pas déclarer : index partiel, chemin ltree maintenu par trigger,
-- Row-Level Security. Brinjel isolait les fermes par un schéma PostgreSQL chacune ;
-- Sillon garde un seul schéma et isole par `farm_id` + RLS (cf. specs/sillon-modele-de-donnees.md §1).

-- ───────────────────────── Un seul propriétaire par ferme ─────────────────────────
CREATE UNIQUE INDEX "farm_memberships_single_owner"
  ON "farm_memberships" ("farm_id")
  WHERE "role" = 'owner';

-- ───────────────────────── Chemin matérialisé des emplacements ─────────────────────────
-- `path` vaut le chemin du parent suivi de la position du nœud sur 5 chiffres :
-- trier sur `path` trie l'arbre entier dans l'ordre d'affichage.
CREATE OR REPLACE FUNCTION sillon_location_path() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_path ltree;
BEGIN
  IF NEW."parent_id" IS NULL THEN
    NEW."path" := text2ltree(lpad(NEW."position"::text, 5, '0'));
  ELSE
    SELECT "path" INTO parent_path FROM "locations" WHERE "id" = NEW."parent_id";
    NEW."path" := COALESCE(parent_path, ''::ltree) || text2ltree(lpad(NEW."position"::text, 5, '0'));
  END IF;
  RETURN NEW;
END;
$$;

-- Déplacer un nœud déplace toute sa descendance. Le trigger ne réagit qu'aux colonnes
-- structurantes : l'UPDATE ci-dessous ne le redéclenche donc pas.
CREATE OR REPLACE FUNCTION sillon_location_path_descendants() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."path" IS DISTINCT FROM OLD."path" AND OLD."path" IS NOT NULL THEN
    UPDATE "locations"
       SET "path" = NEW."path" || subpath("path", nlevel(OLD."path"))
     WHERE "path" <@ OLD."path" AND "id" <> NEW."id";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "locations_path_before"
  BEFORE INSERT OR UPDATE OF "parent_id", "position" ON "locations"
  FOR EACH ROW EXECUTE FUNCTION sillon_location_path();

CREATE TRIGGER "locations_path_after"
  AFTER UPDATE OF "parent_id", "position" ON "locations"
  FOR EACH ROW EXECUTE FUNCTION sillon_location_path_descendants();

CREATE INDEX "locations_path_gist" ON "locations" USING GIST ("path");

-- ───────────────────────── Recherche insensible aux accents ─────────────────────────
-- `unaccent()` n'est pas IMMUTABLE (il dépend d'un dictionnaire) : on fige le dictionnaire
-- pour pouvoir indexer l'expression.
CREATE OR REPLACE FUNCTION sillon_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;

CREATE INDEX "families_search" ON "families" (lower(sillon_unaccent("name")));
CREATE INDEX "crops_search" ON "crops" (lower(sillon_unaccent("name")));
CREATE INDEX "varieties_search" ON "varieties" (lower(sillon_unaccent("name")));
CREATE INDEX "locations_search" ON "locations" (lower(sillon_unaccent("name")));

-- ───────────────────────── Isolation des fermes (RLS) ─────────────────────────
-- L'API ouvre une transaction par requête métier et y pose `app.farm_id`
-- (cf. src/lib/tenant.ts). `app.bypass_rls` n'est posé que pour les opérations
-- transverses : création d'une ferme, duplication d'une ferme modèle, migrations.
CREATE OR REPLACE FUNCTION sillon_current_farm() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.farm_id', true), '')::integer
$$;

CREATE OR REPLACE FUNCTION sillon_rls_bypassed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'off') = 'on'
$$;

DO $$
DECLARE
  target text;
  farm_tables text[] := ARRAY[
    'bed_settings', 'families', 'crops', 'providers', 'varieties', 'units', 'containers',
    'tags', 'plantings', 'locations', 'task_types', 'task_methods', 'task_implements',
    'tasks', 'task_templates', 'harvests', 'notes', 'photos'
  ];
BEGIN
  FOREACH target IN ARRAY farm_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    -- FORCE : la politique s'applique aussi au propriétaire des tables, donc à l'API.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY "farm_isolation" ON %I
         USING (sillon_rls_bypassed() OR "farm_id" = sillon_current_farm())
         WITH CHECK (sillon_rls_bypassed() OR "farm_id" = sillon_current_farm())',
      target);
  END LOOP;
END;
$$;
