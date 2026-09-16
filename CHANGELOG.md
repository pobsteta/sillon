# Changelog

## [0.2.1](https://github.com/pobsteta/sillon/compare/v0.2.0...v0.2.1) (2026-09-16)


### Corrections

* **ci:** exclut le CHANGELOG de la vérification Prettier ([970d16f](https://github.com/pobsteta/sillon/commit/970d16f8922bcf0907242f81c106df301a475b52))
* **docker:** copie le schéma Prisma avant npm ci dans l'image de l'API ([dfa09a7](https://github.com/pobsteta/sillon/commit/dfa09a7ff7a9046173924a6ca944e8fe4ac771fe))

## [0.2.0](https://github.com/pobsteta/sillon/compare/v0.1.0...v0.2.0) (2026-09-16)


### ⚠ BREAKING CHANGES

* **web:** La fiche d'une série part de la date de semis et expose les trois durées d'origine. Les libellés des énumérations changent : quatre types de série, trois types de date, trois durées, quatre natures de tâche, cinq rôles.
* **api:** Huit énumérations changent de valeurs, les dates de récolte deviennent une liste `harvest_periods`, et `planting_dates.type` est remappé selon le type de série. La migration `20260916090000_align_sur_brinjel` convertit les données existantes ; une base antérieure doit l'appliquer.
* **core:** Les unités de stockage, les énumérations et le modèle des dates changent de forme : longueurs en millimètres, espacements en dixièmes de millimètre, rendements en millièmes d'unité, densité de semences en graines par kilogramme, temps de travail en secondes. Les formules de semences suivent Brinjel, poquets non arrondis compris.

### Fonctionnalités

* **api:** migre le schéma et l'API vers le modèle d'origine ([be856eb](https://github.com/pobsteta/sillon/commit/be856eb3de926f155024399df8cfc929820168d0))
* **ci:** automatise le versionnage, les tags et les releases ([7a342a7](https://github.com/pobsteta/sillon/commit/7a342a7c6064037c7149b418233c45e194a6e178))
* **core:** aligne le noyau métier sur le code d'origine de Brinjel ([8dd11c1](https://github.com/pobsteta/sillon/commit/8dd11c1322d56176c7861683adfb7b56dd8dd577))
* **web:** aligne l'interface, les traductions et la documentation sur Brinjel ([4e284f6](https://github.com/pobsteta/sillon/commit/4e284f667078e9f14ed422ef1b68abc0c38d0e49))


### Corrections

* **api:** porte la matrice des permissions au lieu d'une échelle de rôles ([c736c73](https://github.com/pobsteta/sillon/commit/c736c73bd8aecb5937e0bee4c16127b7b5d2fe94))
* **docker:** rétablit l'isolation RLS et rend `npm run dev` portable ([41b9982](https://github.com/pobsteta/sillon/commit/41b998250d31f31e722e5ff7d4954db9ce2962ee))


### Documentation

* ajoute les badges et le réglage de dépôt qu'exige release-please ([52c65a9](https://github.com/pobsteta/sillon/commit/52c65a970ccf3d063cde017ef3b953de08db2c9e))
* badges et réglage de dépôt qu'exige release-please ([#3](https://github.com/pobsteta/sillon/issues/3)) ([91cc72e](https://github.com/pobsteta/sillon/commit/91cc72e70895a488adaa0a0250a2353ff10418e9))
* corrige les compteurs de tests du README ([f44e482](https://github.com/pobsteta/sillon/commit/f44e482a404d752bda7f42c31abc85a0020692e4))
