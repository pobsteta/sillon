-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Repères à l'échelle de l'exploitation (lot A, complément du 20 septembre 2026).
--
-- **Une table à part, et non une colonne de plus sur `reference_values`.** Les deux
-- grandeurs n'ont ni la même clé ni les mêmes unités : une valeur par culture se cherche
-- par `crop_key` et se mesure en kg/m² ; un repère d'exploitation n'a pas de culture du
-- tout, et se mesure en m² par équivalent temps plein, en centimes par m², en secondes par
-- an. Les loger ensemble aurait imposé une `crop_key` nulle et trois colonnes vides sur
-- chaque ligne, c'est-à-dire un schéma qui ment sur ce qu'il contient.
--
-- Hors RLS, comme `reference_values` : ce sont des faits publiés, lus par toutes les
-- fermes et écrits par le seul seed.

CREATE TABLE "reference_farm_values" (
  "id"        serial PRIMARY KEY,
  "source_id" text NOT NULL REFERENCES "reference_sources"("id") ON DELETE CASCADE,
  -- L'une des métriques de `@sillon/core` : chacune porte son unité de stockage, et une
  -- valeur sans sa métrique serait un nombre sans sens.
  "metric"    text NOT NULL,
  -- { systeme: text, conduite: text|null }
  "context"   jsonb NOT NULL,
  -- { low: int|null, median: int, high: int|null }, dans l'unité de la métrique.
  "range"     jsonb NOT NULL,
  "n"         integer,
  "page_ref"  text NOT NULL,
  "notes"     text NOT NULL DEFAULT '',
  "inserted_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamp(3) NOT NULL
);

CREATE INDEX "reference_farm_values_metric" ON "reference_farm_values" ("metric");
CREATE INDEX "reference_farm_values_source" ON "reference_farm_values" ("source_id");
