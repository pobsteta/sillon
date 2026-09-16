# Sillon

Réécriture AGPL de Brinjel (https://framagit.org/brinjel/brinjel, © André Hoarau)
en React 19 + TypeScript + Node + PostgreSQL, PWA responsive smartphone/PC.
Le code source de référence est dans ../brinjel (Elixir/Phoenix). Ne pas le modifier.
Lire brief-developpement-sillon.md et sillon-modele-de-donnees.md avant toute tâche.
Conventions : mesures en entiers, aux unités de stockage de Brinjel — longueurs de
planche en millimètres, espacements en dixièmes de millimètre, rendements et quantités
récoltées en millièmes d'unité, densité de semences en graines par kilogramme, montants
en centimes, durées de culture en jours, temps de travail en secondes. La conversion
n'a lieu qu'aux bords (saisie et affichage) : voir `packages/core/src/units.ts`.
farm_id partout, RLS.
Conserver les en-têtes SPDX et le crédit Brinjel sur tout code porté.
