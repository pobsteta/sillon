-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Valeurs de référence issues de la recherche (lot A de
-- `specs/brief-sillon-references-microfermes.md`).
--
-- **Deux tables hors Row-Level Security, et c'est délibéré.** Tout le reste du schéma est
-- cloisonné par `farm_id` ; ces données-ci n'appartiennent à aucune ferme. Elles sont
-- publiées, citées, identiques pour tout le monde, et se lisent par toutes les fermes. Y
-- poser une politique d'isolation obligerait à recopier les mêmes lignes ferme par ferme,
-- ce qui multiplierait la donnée sans rien protéger. L'écriture, elle, n'est faite que par
-- le seed (`npm run db:seed:references`) — aucune route de Sillon n'écrit ici.
--
-- **Pas de `species_id`.** Le brief en prévoyait un, nullable. Il ne peut pas exister : les
-- espèces de Sillon sont **par ferme** (`crops.farm_id`), et une table globale qui les
-- référencerait pointerait d'une ferme vers une autre — exactement ce que la RLS interdit.
-- Le rapprochement se fait donc par `crop_key`, et c'est l'API qui traduit l'espèce d'une
-- ferme en clés (`cropKeysFor` dans `@sillon/core`).
--
-- **Les unités sont dans les noms de colonnes.** Le brief nommait `yield_kg_m2` ; le dépôt
-- stocke des entiers (`CLAUDE.md`). Une colonne nommée `yield_kg_m2` contenant 3700 pour
-- 3,7 kg/m² serait le piège le plus sûr de tout ce lot : le nom dirait une unité, la
-- valeur en porterait une autre, et personne ne s'en apercevrait. D'où des noms qui
-- disent ce qu'ils contiennent.

CREATE TABLE "reference_sources" (
  "id"          text PRIMARY KEY,
  "titre"       text NOT NULL,
  "auteurs"     text[] NOT NULL,
  "annee"       integer NOT NULL,
  "url"         text NOT NULL,
  -- Identifiant SPDX quand il en existe un (« etalab-2.0 »), sinon l'une des valeurs
  -- conventionnelles de `@sillon/core/references` : « a-verifier », « reutilisation-autorisee ».
  "licence"     text NOT NULL,
  "notes"       text NOT NULL DEFAULT '',
  "inserted_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamp(3) NOT NULL
);

CREATE TABLE "reference_values" (
  "id"        serial PRIMARY KEY,
  "source_id" text NOT NULL REFERENCES "reference_sources"("id") ON DELETE CASCADE,
  "crop_key"  text NOT NULL,
  -- { abri: bool|null, systeme: text, conduite: text|null } — `null` veut dire « la source
  -- ne distingue pas », et non une valeur par défaut.
  "context"   jsonb NOT NULL,
  -- { low: int|null, median: int, high: int|null } dans l'unité que le nom annonce.
  "yield_milli_kg_m2"   jsonb,
  "labor_seconds_100m2" jsonb,
  "price_cents_kg"      jsonb,
  -- Effectif de l'échantillon, quand la source en est un. Nul pour une base compilée
  -- depuis la bibliographie : l'interface doit alors se taire plutôt qu'afficher un vide.
  "n"         integer,
  "page_ref"  text NOT NULL,
  "notes"     text NOT NULL DEFAULT '',
  "inserted_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamp(3) NOT NULL
);

-- La lecture se fait toujours par clé de culture, parfois filtrée par source.
CREATE INDEX "reference_values_crop_key" ON "reference_values" ("crop_key");
CREATE INDEX "reference_values_source" ON "reference_values" ("source_id");

-- Lecture pour tout le monde, écriture pour personne d'autre que le propriétaire des
-- tables — c'est-à-dire le seed. Le rôle applicatif est ce propriétaire : la protection
-- tient ici au fait qu'aucune route n'écrit, et le contrôle est dans les essais.
