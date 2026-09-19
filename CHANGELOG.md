# Changelog

## [0.7.0](https://github.com/pobsteta/sillon/compare/v0.6.0...v0.7.0) (2026-09-19)


### Fonctionnalités

* **carte:** faire pivoter le parcellaire, carte plus haute et plus zoomable ([#40](https://github.com/pobsteta/sillon/issues/40)) ([00f8de2](https://github.com/pobsteta/sillon/commit/00f8de28035e09fabc0764a9d67b435ab0b19993))
* **carte:** Nominatim en recours, mesure applicable, plan imprimable ([#37](https://github.com/pobsteta/sillon/issues/37)) ([4f166b7](https://github.com/pobsteta/sillon/commit/4f166b7f8854d950a3f177c1c3796b4c94e43167))
* **docker:** APP_URL et CORS_ORIGINS se posent dans .env ([#33](https://github.com/pobsteta/sillon/issues/33)) ([7401114](https://github.com/pobsteta/sillon/commit/7401114bfa83ecc1a01ae80bebbacf7c4f9f650c))
* **fournisseurs:** trois semenciers de plus, et un jardin d'exemple ([#32](https://github.com/pobsteta/sillon/issues/32)) ([5679a90](https://github.com/pobsteta/sillon/commit/5679a9053542f075cf2daf47072d12c9ef5f6287))
* **web:** add polished login visual design ([e5bc204](https://github.com/pobsteta/sillon/commit/e5bc20423766a3324a2f0b8b3d20b7da6e595afe))
* **web:** redesign login page ([64b74a1](https://github.com/pobsteta/sillon/commit/64b74a101435b04b1e0ddb689eb1292627721003))
* **web:** redesign Sillon dashboard ([44080f8](https://github.com/pobsteta/sillon/commit/44080f8b0cd9f6b40939739f1382e8afc259651a))
* **web:** style Sillon dashboard ([dd16c25](https://github.com/pobsteta/sillon/commit/dd16c2592f48e68b329e0730a667d7779b269056))


### Corrections

* **docker:** tout ce que .env contient arrive au conteneur ([#38](https://github.com/pobsteta/sillon/issues/38)) ([8c79c5f](https://github.com/pobsteta/sillon/commit/8c79c5f57755bfb004f342284d647e7c9ed4c566))
* **web:** nginx suit l'API quand son conteneur change d'adresse ([#39](https://github.com/pobsteta/sillon/issues/39)) ([7a4ad2c](https://github.com/pobsteta/sillon/commit/7a4ad2c8998e8af6a36d63e333b69a8a589a4a71))


### Documentation

* **brief:** dessiner son jardin sur une carte ([#34](https://github.com/pobsteta/sillon/issues/34)) ([bde6222](https://github.com/pobsteta/sillon/commit/bde6222d9998dcf1c200e32752aef26e1464cbc2))

## [0.6.0](https://github.com/pobsteta/sillon/compare/v0.5.1...v0.6.0) (2026-09-18)


### Fonctionnalités

* **api:** le droit d'écrire devient une question posée une fois ([80677a8](https://github.com/pobsteta/sillon/commit/80677a8aba535d111671539c56037a5bbeb578cc))


### Corrections

* **docker:** le lien de confirmation devient cliquable ([3661268](https://github.com/pobsteta/sillon/commit/3661268db6e4c59d2fc74cb967431049325f35cc))
* **docker:** les ports publiés cessent d'être en dur ([1ee7008](https://github.com/pobsteta/sillon/commit/1ee7008b546ebe97405e889eb3bb8ebe1868714f))


### Documentation

* brief des abonnements, des centres de formation et de l'hébergement ([43b46e8](https://github.com/pobsteta/sillon/commit/43b46e87caef43fe0e520ed3ac31b00f24b4cc42))
* l'encaissement sort du code, la réforme de la facturation le décide ([3e0bf6d](https://github.com/pobsteta/sillon/commit/3e0bf6d5ad85861182fd17d9314f806a691c9082))
* le dépôt est enregistré auprès de l'API REUSE ([eae36c5](https://github.com/pobsteta/sillon/commit/eae36c538317d0265306f9d8b084dd7a6940c3dd))

## [0.5.1](https://github.com/pobsteta/sillon/compare/v0.5.0...v0.5.1) (2026-09-17)


### Corrections

* **api:** le décalage par lot emmène les tâches avec lui ([568bf0b](https://github.com/pobsteta/sillon/commit/568bf0b15302d9ecad72b2c5ad9891ae85e21333))


### Documentation

* brief d'intégration d'un calendrier lunaire ([4833f95](https://github.com/pobsteta/sillon/commit/4833f95c7a1fe5225194e9dd08115f18a6688c8a))

## [0.5.0](https://github.com/pobsteta/sillon/compare/v0.4.0...v0.5.0) (2026-09-17)


### Fonctionnalités

* **api:** second facteur par code temporaire ([a66c989](https://github.com/pobsteta/sillon/commit/a66c989697ca4b6b03831f362bc4e158a41e082c))
* **api:** sondes de supervision et remontée des erreurs ([4110305](https://github.com/pobsteta/sillon/commit/411030531fce9eff39b16a3b47bb4bbbcc15d51e))

## [0.4.0](https://github.com/pobsteta/sillon/compare/v0.3.0...v0.4.0) (2026-09-17)


### Fonctionnalités

* **api:** export complet des données de la ferme ([fbe2a3e](https://github.com/pobsteta/sillon/commit/fbe2a3eb53e6d1cc43cf9cc4c9d95a6b05b473b3))
* **api:** normalise les photos et les range sur un stockage objet ([9f8814c](https://github.com/pobsteta/sillon/commit/9f8814cda8309e6a3f5297ec490de1e76b3bc418))
* **api:** sort les courriels du chemin de la requête ([c9efbdc](https://github.com/pobsteta/sillon/commit/c9efbdc57e4a2aeb8eeadf748f3f9b3f8a7ac1c5))
* **web:** compresse la photo avant de l'envoyer ([a5d4b9c](https://github.com/pobsteta/sillon/commit/a5d4b9c8c32a7aab6461dae773ba0c6c64786802))
* **web:** place une série sur une planche, au doigt comme à la souris ([aefc02a](https://github.com/pobsteta/sillon/commit/aefc02ad0070e5701446e36d850f857da25675bb))


### Corrections

* **test:** sérialise vraiment les tests d'API entre fichiers ([a1a1ee3](https://github.com/pobsteta/sillon/commit/a1a1ee3d96da7469763a7bb12abd88a8fd04d48f))


### Documentation

* étude d'opportunité sur la reprise des données Mesclun ([482b235](https://github.com/pobsteta/sillon/commit/482b235928f5bfd02771637353b58c482223aa00))
* explique pourquoi le badge REUSE reste gris ([119cd6b](https://github.com/pobsteta/sillon/commit/119cd6bdbdcf55e4744f33634d4f4b7b018bc00b))

## [0.3.0](https://github.com/pobsteta/sillon/compare/v0.2.1...v0.3.0) (2026-09-17)


### Fonctionnalités

* **api:** envoie les courriels d'invitation, de confirmation et de mot de passe oublié ([8a49735](https://github.com/pobsteta/sillon/commit/8a49735482f71ea0d1289a00daa882b5108d1d3e))
* **web:** écrans de mot de passe oublié et de confirmation d'adresse ([0c77d94](https://github.com/pobsteta/sillon/commit/0c77d94c9d7c4295c9efc7b0e284353b8c20d3fb))
* **web:** journal de notes et photos ([15f66c2](https://github.com/pobsteta/sillon/commit/15f66c296ddbe8d7b31fba438edd8389e3a629a7))


### Corrections

* **api:** ouvre le téléversement de photos au saisonnier ([f04366f](https://github.com/pobsteta/sillon/commit/f04366fbedc2597a5060577e928f9975573c6206))
* **ci:** écrit la configuration ESLint qui manquait depuis le début ([62432c3](https://github.com/pobsteta/sillon/commit/62432c3f9d598eb67b37d4e87c349df232399240))


### Documentation

* retire un doublon de la rubrique Documentation de la 0.2.0 ([7af063e](https://github.com/pobsteta/sillon/commit/7af063e999bca3cfbbf7b09aa8be76697c89dd67))

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
* corrige les compteurs de tests du README ([f44e482](https://github.com/pobsteta/sillon/commit/f44e482a404d752bda7f42c31abc85a0020692e4))
