-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Le type MIME d'une photo n'était nulle part, et la route de contenu répondait
-- `application/octet-stream`. Comme `helmet` pose `X-Content-Type-Options: nosniff`,
-- le navigateur refusait d'afficher la vignette : la fonctionnalité existait et ne
-- s'affichait pas.
--
-- Les photos téléversées à partir de maintenant sont toutes réencodées en JPEG
-- (voir `apps/api/src/images.ts`), d'où la valeur par défaut. Les lignes antérieures
-- peuvent avoir été stockées dans un autre format ; elles seront servies comme du JPEG,
-- ce qu'on accepte faute de production à ce jour — et ces vignettes-là ne s'affichaient
-- de toute façon pas. La valeur par défaut est ensuite retirée : une photo enregistrée
-- sans son type serait le retour du même défaut.

ALTER TABLE "photos" ADD COLUMN "content_type" TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE "photos" ALTER COLUMN "content_type" DROP DEFAULT;
