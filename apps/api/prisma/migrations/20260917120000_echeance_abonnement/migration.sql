-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Échéance d'abonnement d'une ferme.
--
-- `Subscription` existe depuis le portage de Brinjel, mais c'est un miroir de prestataire :
-- tous ses champs sont des `provider*`. Le droit d'écrire ne peut pas en dépendre, sans quoi
-- un déploiement sans prestataire — l'auto-hébergement, le lycée — n'aurait aucun moyen de
-- l'exprimer.
--
-- Cette colonne est donc la source de vérité, et le miroir viendra l'alimenter le jour où un
-- prestataire existera. Nulle par défaut : sans échéance, c'est l'essai qui commande, et sous
-- la politique par défaut (`ouverte`) rien de tout cela ne s'applique.

ALTER TABLE "farms" ADD COLUMN "paid_until" DATE;
