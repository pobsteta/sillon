-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Centres de formation : plusieurs fermes modèles par centre, et une fin de formation qui
-- laisse la ferme à l'apprenant plutôt que de la supprimer.

CREATE TABLE "training_center_templates" (
    "training_center_id" INTEGER NOT NULL,
    "template_farm_id" INTEGER NOT NULL,
    "label" TEXT,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_center_templates_pkey" PRIMARY KEY ("training_center_id","template_farm_id")
);

CREATE INDEX "training_center_templates_template_farm_id_idx"
  ON "training_center_templates"("template_farm_id");

ALTER TABLE "training_center_templates"
  ADD CONSTRAINT "training_center_templates_training_center_id_fkey"
  FOREIGN KEY ("training_center_id") REFERENCES "training_centers"("farm_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_center_templates"
  ADD CONSTRAINT "training_center_templates_template_farm_id_fkey"
  FOREIGN KEY ("template_farm_id") REFERENCES "farms"("farm_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Le modèle par défaut figure toujours dans la liste : sans cette reprise, un centre créé
-- avant cette migration n'aurait aucun modèle listé alors qu'il en a un.
INSERT INTO "training_center_templates" ("training_center_id", "template_farm_id")
SELECT "farm_id", "default_template_farm_id" FROM "training_centers"
ON CONFLICT DO NOTHING;

ALTER TABLE "student_farms" ADD COLUMN "ended_at" TIMESTAMP(3);
