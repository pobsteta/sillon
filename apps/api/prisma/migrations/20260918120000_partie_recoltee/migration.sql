-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- La partie récoltée : le pivot entre le plan de culture et le calendrier lunaire.
-- Une colonne sur l'espèce, une surcharge sur la série — parce que l'attribut n'est pas
-- toujours vrai de la culture : une carotte porte-graine se mène en jour fruit.

CREATE TYPE "HarvestedPart" AS ENUM ('root', 'leaf', 'flower', 'fruit');

ALTER TABLE "crops" ADD COLUMN "harvested_part" "HarvestedPart";
ALTER TABLE "plantings" ADD COLUMN "harvested_part" "HarvestedPart";

-- Reprise au mieux des espèces du référentiel de départ, reconnues par leur nom d'origine
-- en français ou en anglais. Une espèce renommée par la ferme n'est pas touchée : mieux
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
  ('Blette', 'leaf'), ('Chard', 'leaf')
) AS v("nom", "part")
WHERE "crops"."name" = v."nom" AND "crops"."harvested_part" IS NULL;
