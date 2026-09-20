-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Rattrapage de `20260918120000_partie_recoltee`, qui n'a rien écrit.
--
-- **Ce que la migration d'origine a raté, et comment.** Elle posait la colonne, puis
-- remplissait les espèces du référentiel de départ par un `UPDATE … FROM (VALUES …)`.
-- Mais les tables de ferme sont en `FORCE ROW LEVEL SECURITY` : la politique s'applique
-- *aussi* au propriétaire des tables, donc au rôle qui joue les migrations. Sans
-- `app.farm_id` ni `app.bypass_rls`, cet `UPDATE` ne voyait **aucune ligne**. Il n'a pas
-- échoué : il a porté sur zéro enregistrement, sans message, et la migration s'est
-- déclarée appliquée.
--
-- Conséquence, constatée le 20 septembre 2026 : toute ferme créée avant cette migration
-- a ses espèces sans partie récoltée. Le pivot du calendrier lunaire — celui qui relie
-- « jour fruit » au plan de culture (`brief/jardinage-lunaire.md` §4) — est alors inerte
-- chez elle : aucune tâche marquée, aucun calage possible, aucun filtre par partie. Rien
-- n'a l'air cassé, ce qui est exactement le défaut le plus coûteux à trouver.
--
-- Une migration appliquée ne se modifie pas : on rejoue donc le remplissage ici, avec la
-- dérogation qui manquait. L'idiome existe déjà dans `20260916090000_align_sur_brinjel`,
-- et son absence est le seul écart.

-- Sans cette ligne, tout ce qui suit s'applique à zéro ligne, en silence.
SELECT set_config('app.bypass_rls', 'on', true);

-- Les espèces du référentiel de départ, reconnues par leur nom d'origine en français ou
-- en anglais. Seules les valeurs **vides** sont remplies : une ferme qui a qualifié ses
-- espèces à la main garde son choix, et une espèce renommée n'est pas touchée — mieux
-- vaut un champ vide, que le calendrier respecte en se taisant, qu'une valeur fausse.
UPDATE "crops" SET "harvested_part" = v."part"::"HarvestedPart"
FROM (VALUES
  ('Tomate', 'fruit'), ('Tomato', 'fruit'),
  ('Aubergine', 'fruit'), ('Eggplant', 'fruit'),
  ('Poivron', 'fruit'), ('Pepper', 'fruit'),
  ('Courgette', 'fruit'), ('Zucchini', 'fruit'),
  ('Concombre', 'fruit'), ('Cucumber', 'fruit'),
  ('Courge', 'fruit'), ('Winter squash', 'fruit'),
  ('Melon', 'fruit'),
  ('Haricot', 'fruit'), ('Bean', 'fruit'),
  ('Pois', 'fruit'), ('Pea', 'fruit'),
  ('Fève', 'fruit'), ('Broad bean', 'fruit'),
  ('Pomme de terre', 'root'), ('Potato', 'root'),
  ('Navet', 'root'), ('Turnip', 'root'),
  ('Radis', 'root'), ('Radish', 'root'),
  ('Carotte', 'root'), ('Carrot', 'root'),
  ('Betterave', 'root'), ('Beetroot', 'root'),
  ('Oignon', 'root'), ('Onion', 'root'),
  ('Ail', 'root'), ('Garlic', 'root'),
  ('Échalote', 'root'), ('Shallot', 'root'),
  ('Chou', 'leaf'), ('Cabbage', 'leaf'),
  ('Roquette', 'leaf'), ('Rocket', 'leaf'),
  ('Persil', 'leaf'), ('Parsley', 'leaf'),
  ('Céleri', 'leaf'), ('Celery', 'leaf'),
  ('Fenouil', 'leaf'), ('Fennel', 'leaf'),
  ('Laitue', 'leaf'), ('Lettuce', 'leaf'),
  ('Chicorée', 'leaf'), ('Chicory', 'leaf'),
  ('Mâche', 'leaf'), ('Corn salad', 'leaf'),
  ('Poireau', 'leaf'), ('Leek', 'leaf'),
  ('Épinard', 'leaf'), ('Spinach', 'leaf'),
  ('Blette', 'leaf'), ('Chard', 'leaf'),
  -- Les fleurs, absentes du référentiel jusqu'ici : une ferme qui les a saisies
  -- elle-même est reconnue au passage. Voir `reference-data.ts` pour les nouvelles.
  ('Brocoli', 'flower'), ('Broccoli', 'flower'),
  ('Chou-fleur', 'flower'), ('Cauliflower', 'flower'),
  ('Artichaut', 'flower'), ('Artichoke', 'flower')
) AS v("nom", "part")
WHERE "crops"."name" = v."nom" AND "crops"."harvested_part" IS NULL;
