-- SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Alignement du schéma sur le code d'origine de Brinjel, après lecture de sa source.
-- Deux natures de changement, appliquées dans cet ordre :
--   1. les valeurs d'énumération, remplacées type par type (PostgreSQL ne sait pas
--      renommer et ajouter dans la même transaction sans risque : on crée le nouveau
--      type, on convertit la colonne, on supprime l'ancien) ;
--   2. les unités de stockage, plus fines que celles retenues jusqu'ici, donc
--      converties par simple multiplication — aucune donnée n'est perdue.

-- La migration tourne sous le rôle applicatif, donc sous Row-Level Security : sans
-- cette dérogation, les lectures de `plantings` ne verraient aucune ligne et les
-- conversions d'unités s'appliqueraient à zéro enregistrement, en silence.
SELECT set_config('app.bypass_rls', 'on', true);

-- ─────────────────────────── Rôles ───────────────────────────
-- L'index partiel « un seul propriétaire par ferme » porte un prédicat sur l'ancien
-- type : il doit disparaître le temps de la conversion, puis être recréé à l'identique.
DROP INDEX "farm_memberships_single_owner";

CREATE TYPE "FarmRole_new" AS ENUM ('owner', 'manager', 'employee', 'seasonal', 'consultant');

ALTER TABLE "farm_memberships"
  ALTER COLUMN "role" TYPE "FarmRole_new"
  USING (CASE "role"::text WHEN 'member' THEN 'employee' ELSE "role"::text END)::"FarmRole_new";
ALTER TABLE "invitations"
  ALTER COLUMN "role" TYPE "FarmRole_new"
  USING (CASE "role"::text WHEN 'member' THEN 'employee' ELSE "role"::text END)::"FarmRole_new";

DROP TYPE "FarmRole";
ALTER TYPE "FarmRole_new" RENAME TO "FarmRole";

CREATE UNIQUE INDEX "farm_memberships_single_owner"
  ON "farm_memberships" ("farm_id")
  WHERE "role" = 'owner';

-- ─────────────────────────── Fournisseurs ───────────────────────────
CREATE TYPE "ProviderType_new" AS ENUM ('seed', 'transplant');

ALTER TABLE "providers"
  ALTER COLUMN "type" TYPE "ProviderType_new"
  USING (CASE "type"::text WHEN 'seeds' THEN 'seed' ELSE 'transplant' END)::"ProviderType_new";

DROP TYPE "ProviderType";
ALTER TYPE "ProviderType_new" RENAME TO "ProviderType";

-- ─────────────────────────── Mode d'implantation ───────────────────────────
-- `seedling` (production de plants) n'existait pas : aucune ligne ne peut en porter.
CREATE TYPE "PlantingType_new" AS ENUM ('direct_seeded', 'transplant_bought', 'transplant_raised', 'seedling');

ALTER TABLE "plantings"
  ALTER COLUMN "planting_type" TYPE "PlantingType_new"
  USING (CASE "planting_type"::text
           WHEN 'direct_seed' THEN 'direct_seeded'
           ELSE "planting_type"::text
         END)::"PlantingType_new";

DROP TYPE "PlantingType";
ALTER TYPE "PlantingType_new" RENAME TO "PlantingType";

-- ─────────────────────────── Raison de clôture ───────────────────────────
-- `other` n'a pas d'équivalent dans le vocabulaire d'origine : la colonne est
-- remise à NULL plutôt que de lui prêter une raison qu'elle n'avait pas.
CREATE TYPE "FinishReason_new" AS ENUM ('harvesting_finished', 'crop_failure', 'crop_never_seeded', 'crop_never_planted');

ALTER TABLE "plantings"
  ALTER COLUMN "finish_reason" TYPE "FinishReason_new"
  USING (CASE "finish_reason"::text
           WHEN 'harvested' THEN 'harvesting_finished'
           WHEN 'failed' THEN 'crop_failure'
           ELSE NULL
         END)::"FinishReason_new";

DROP TYPE "FinishReason";
ALTER TYPE "FinishReason_new" RENAME TO "FinishReason";

-- ─────────────────────────── Dates de récolte ───────────────────────────
-- Elles ne sont pas des dates de série : elles deviennent une période de récolte.
INSERT INTO "harvest_periods" ("planting_id", "begin", "end", "inserted_at", "updated_at")
SELECT b."planting_id",
       COALESCE(b."effective", b."planned"),
       COALESCE(e."effective", e."planned", COALESCE(b."effective", b."planned")),
       now(), now()
  FROM "planting_dates" b
  LEFT JOIN "planting_dates" e
    ON e."planting_id" = b."planting_id" AND e."type"::text = 'harvest_end'
 WHERE b."type"::text = 'harvest_begin';

DELETE FROM "planting_dates" WHERE "type"::text IN ('harvest_begin', 'harvest_end');

-- ─────────────────────────── Types de dates ───────────────────────────
-- `sowing_planting` désignait deux choses selon le mode d'implantation : le semis
-- en place, ou la plantation. La conversion a donc besoin de `plantings`, ce qu'une
-- clause USING ne permet pas : on passe par une colonne intermédiaire.
CREATE TYPE "PlantingDateType_new" AS ENUM ('sowing', 'planting', 'potting');

ALTER TABLE "planting_dates" ADD COLUMN "type_new" "PlantingDateType_new";

UPDATE "planting_dates" d
   SET "type_new" = (CASE
     WHEN d."type"::text = 'greenhouse_sowing' THEN 'sowing'
     WHEN d."type"::text = 'sowing_planting'
      AND p."planting_type" IN ('transplant_raised', 'transplant_bought') THEN 'planting'
     ELSE 'sowing'
   END)::"PlantingDateType_new"
  FROM "plantings" p
 WHERE p."id" = d."planting_id";

ALTER TABLE "planting_dates" DROP CONSTRAINT "planting_dates_pkey";
ALTER TABLE "planting_dates" DROP COLUMN "type";
ALTER TABLE "planting_dates" RENAME COLUMN "type_new" TO "type";
ALTER TABLE "planting_dates" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "planting_dates" ADD CONSTRAINT "planting_dates_pkey" PRIMARY KEY ("planting_id", "type");

DROP TYPE "PlantingDateType";
ALTER TYPE "PlantingDateType_new" RENAME TO "PlantingDateType";

-- ─────────────────────────── Types de durées ───────────────────────────
CREATE TYPE "PlantingDurationType_new" AS ENUM ('days_to_transplant', 'days_to_maturity', 'harvest_window');

ALTER TABLE "planting_durations"
  ALTER COLUMN "type" TYPE "PlantingDurationType_new"
  USING (CASE "type"::text
           WHEN 'greenhouse' THEN 'days_to_transplant'
           WHEN 'to_harvest' THEN 'days_to_maturity'
           ELSE 'harvest_window'
         END)::"PlantingDurationType_new";

DROP TYPE "PlantingDurationType";
ALTER TYPE "PlantingDurationType_new" RENAME TO "PlantingDurationType";

-- ─────────────────────────── Nature des tâches ───────────────────────────
-- Une tâche de semis devient un semis en pépinière ou un semis direct selon le mode
-- d'implantation de la série qu'elle sert.
CREATE TYPE "TaskDefaultType_new" AS ENUM ('direct_sow', 'greenhouse_sow', 'transplant', 'custom');

ALTER TABLE "tasks" ADD COLUMN "default_type_new" "TaskDefaultType_new";

UPDATE "tasks" t
   SET "default_type_new" = (CASE
     WHEN t."default_type"::text = 'planting' THEN 'transplant'
     WHEN t."default_type"::text = 'sowing' THEN (
       CASE WHEN EXISTS (
         SELECT 1 FROM "planting_tasks" pt
           JOIN "plantings" p ON p."id" = pt."planting_id"
          WHERE pt."task_id" = t."id" AND p."planting_type" = 'direct_seeded'
       ) THEN 'direct_sow' ELSE 'greenhouse_sow' END
     )
     ELSE 'custom'
   END)::"TaskDefaultType_new";

ALTER TABLE "tasks" DROP COLUMN "default_type";
ALTER TABLE "tasks" RENAME COLUMN "default_type_new" TO "default_type";
ALTER TABLE "tasks" ALTER COLUMN "default_type" SET NOT NULL;

DROP TYPE "TaskDefaultType";
ALTER TYPE "TaskDefaultType_new" RENAME TO "TaskDefaultType";

-- ─────────────────── Dates de référence des itinéraires ───────────────────
CREATE TYPE "TemplateDateType_new" AS ENUM ('field_sowing_planting', 'greenhouse_sowing', 'first_harvest', 'last_harvest');

ALTER TABLE "template_tasks"
  ALTER COLUMN "template_date_type" TYPE "TemplateDateType_new"
  USING (CASE "template_date_type"::text
           WHEN 'sowing_planting' THEN 'field_sowing_planting'
           WHEN 'harvest_begin' THEN 'first_harvest'
           WHEN 'harvest_end' THEN 'last_harvest'
           ELSE 'greenhouse_sowing'
         END)::"TemplateDateType_new";
ALTER TABLE "template_task_links"
  ALTER COLUMN "template_date_type" TYPE "TemplateDateType_new"
  USING (CASE "template_date_type"::text
           WHEN 'sowing_planting' THEN 'field_sowing_planting'
           WHEN 'harvest_begin' THEN 'first_harvest'
           WHEN 'harvest_end' THEN 'last_harvest'
           ELSE 'greenhouse_sowing'
         END)::"TemplateDateType_new";

DROP TYPE "TemplateDateType";
ALTER TYPE "TemplateDateType_new" RENAME TO "TemplateDateType";

-- ─────────────────────────── Unités de stockage ───────────────────────────
-- Centimètres → millimètres.
UPDATE "plantings" SET "length" = "length" * 10 WHERE "length" IS NOT NULL;
UPDATE "locations" SET "bed_length" = "bed_length" * 10;
UPDATE "locations" SET "bed_width" = "bed_width" * 10 WHERE "bed_width" IS NOT NULL;
UPDATE "location_assignments" SET "length" = "length" * 10;
UPDATE "bed_settings" SET "bed_length" = "bed_length" * 10 WHERE "bed_length" IS NOT NULL;
UPDATE "bed_settings" SET "bed_width" = "bed_width" * 10 WHERE "bed_width" IS NOT NULL;
UPDATE "bed_settings" SET "path_width" = "path_width" * 10 WHERE "path_width" IS NOT NULL;

-- Centimètres → dixièmes de millimètre.
UPDATE "plantings" SET "spacing_plants" = "spacing_plants" * 100 WHERE "spacing_plants" IS NOT NULL;

-- Unités → millièmes d'unité.
UPDATE "plantings" SET "yield_per_bed_meter" = "yield_per_bed_meter" * 1000 WHERE "yield_per_bed_meter" IS NOT NULL;
UPDATE "harvests" SET "quantity" = "quantity" * 1000;

-- Graines par gramme → graines par kilogramme.
UPDATE "plantings" SET "seeds_per_gram" = "seeds_per_gram" * 1000 WHERE "seeds_per_gram" IS NOT NULL;

-- Minutes → secondes.
UPDATE "tasks" SET "planned_labor_time" = "planned_labor_time" * 60 WHERE "planned_labor_time" IS NOT NULL;
UPDATE "tasks" SET "effective_labor_time" = "effective_labor_time" * 60 WHERE "effective_labor_time" IS NOT NULL;
UPDATE "template_tasks" SET "planned_labor_time" = "planned_labor_time" * 60 WHERE "planned_labor_time" IS NOT NULL;
UPDATE "harvests" SET "labor_time" = "labor_time" * 60 WHERE "labor_time" IS NOT NULL;
