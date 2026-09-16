# Sillon — planification maraîchère libre

Sillon est une application libre de **planification et de suivi des cultures maraîchères** :
plan de culture, tâches de la semaine, assolement et rotations, commandes de semences,
récoltes et statistiques. Elle s'utilise au champ depuis un smartphone (PWA installable,
mode hors ligne) et au bureau depuis un PC.

C'est une réécriture de [Brinjel](https://framagit.org/brinjel/brinjel)
(© André Hoarau, AGPL-3.0-or-later) en React 19 + TypeScript + Node + PostgreSQL.
Le modèle de données, les règles métier et les parcours utilisateurs viennent de Brinjel ;
les fichiers qui en dérivent conservent son copyright (convention REUSE / SPDX).

---

## Ce qui fonctionne aujourd'hui

| Domaine                                                                                                           | État |
| ----------------------------------------------------------------------------------------------------------------- | ---- |
| Comptes, sessions Argon2, rôles (propriétaire / chef·fe de culture / équipe), invitations                         | ✅   |
| Fermes multi-utilisateurs, isolation par `farm_id` **et** Row-Level Security PostgreSQL                           | ✅   |
| Référentiel : familles → espèces → variétés, fournisseurs, unités, plaques, étiquettes, types → méthodes → outils | ✅   |
| Séries : CRUD, duplication échelonnée, filtres, tri, traitement par lot, diagramme de Gantt                       | ✅   |
| Dates saisies en date (`15/03`) ou en semaine (`S12`), prévu **et** réalisé                                       | ✅   |
| Calcul des semences, des alvéoles, des plaques de pépinière, du rendement et du produit escomptés                 | ✅   |
| Tâches : feuille de la semaine, retards, validation en deux touches, impression                                   | ✅   |
| Itinéraires techniques : génération des tâches et **recalage** quand les dates de la série bougent                | ✅   |
| Assolement : arbre jardins → planches (`ltree`), placement, emplacements disponibles, contrôle des rotations      | ✅   |
| Commandes de semences et de plants, export CSV                                                                    | ✅   |
| Récoltes, notes, photos                                                                                           | ✅   |
| Statistiques : rendements prévu/réalisé, temps de travail, avancement                                             | ✅   |
| PWA : installation, cache des lectures, file d'attente des saisies hors ligne                                     | ✅   |
| Interface fr/en, mode sombre, cibles tactiles ≥ 44 px, feuilles d'impression                                      | ✅   |
| Export complet des données de la ferme (RGPD, auto-service)                                                       | ✅   |
| Abonnements, centres de formation, TOTP : **tables présentes, interface à écrire**                                | ⏳   |
| Courriels (invitations, confirmation), tâches de fond BullMQ, stockage S3                                         | ⏳   |

Les points marqués ⏳ ont leur place dans le schéma et dans l'architecture, mais pas encore
d'implémentation : voir « Ce qui reste à faire ».

---

## Démarrage rapide

### Avec Docker

```bash
cp .env.example .env          # choisissez un SESSION_SECRET
docker compose up --build
```

L'interface est sur <http://localhost:8080>, l'API sur <http://localhost:3000>,
la documentation OpenAPI sur <http://localhost:3000/docs>.

### Sans Docker

Prérequis : Node 22+, PostgreSQL 16 avec les extensions `citext`, `unaccent` et `ltree`.

```bash
# 1. Base de données (le rôle applicatif ne doit être ni superutilisateur ni BYPASSRLS)
sudo -u postgres psql -c "CREATE ROLE sillon LOGIN PASSWORD 'sillon' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE sillon_dev OWNER sillon;"
sudo -u postgres psql -c "CREATE DATABASE sillon_test OWNER sillon;"
for db in sillon_dev sillon_test; do
  sudo -u postgres psql -d $db -c "CREATE EXTENSION IF NOT EXISTS citext;
                                   CREATE EXTENSION IF NOT EXISTS unaccent;
                                   CREATE EXTENSION IF NOT EXISTS ltree;"
done

# 2. Dépendances, migrations, jeu de démonstration
npm install
cp apps/api/.env.example apps/api/.env
npm run build -w @sillon/core
npm run db:migrate
npm run db:seed        # compte : maraichere@example.org / sillon-demonstration

# 3. API (port 3000) et interface (port 5173)
npm run dev
```

### Tester sur un smartphone

Le téléphone et l'ordinateur doivent être sur le même réseau local. Relevez l'adresse
locale de l'ordinateur (`192.168.x.y`) : Vite l'affiche au démarrage sous « Network ».

**Coup d'œil rapide, avec rechargement à chaud** — l'API sur son port habituel, l'interface
ouverte au réseau :

```bash
npm run dev -w @sillon/api
npm run dev -w @sillon/web -- --host     # affiche l'URL « Network »
```

Sur le téléphone : `http://192.168.x.y:5173`. Le proxy de Vite relaie `/api` vers l'API
depuis l'ordinateur ; rien d'autre n'est à ouvrir sur le réseau.

**Mode hors ligne et installation** — il faut le vrai build, car le service worker est
désactivé en développement :

```bash
npm run build -w @sillon/web
npm run preview -w @sillon/web -- --host
```

Sur le téléphone : `http://192.168.x.y:4173`.

Attention : les navigateurs réservent le service worker et l'installation aux **contextes
sécurisés**. Sur une adresse `http://` du réseau local, l'application fonctionne, mais
l'installation sur l'écran d'accueil et le mode hors ligne restent inactifs. Pour les
essayer, exposez le port en HTTPS — par exemple `cloudflared tunnel --url http://localhost:4173`
ou `ngrok http 4173` — et ouvrez l'adresse `https://…` obtenue : « Ajouter à l'écran
d'accueil » apparaît alors, et couper les données mobiles permet de vérifier que la feuille
de la semaine reste lisible et que les récoltes saisies partent en file d'attente.

Le port de l'API derrière le proxy se change avec `API_PORT` (3000 par défaut).

### Commandes utiles

| Commande                                | Effet                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `npm test`                              | Tests unitaires (noyau métier, hors ligne) et d'intégration (API sur PostgreSQL) |
| `npm run test:e2e`                      | Tests de bout en bout Playwright, en smartphone **et** en bureau                 |
| `npm run typecheck`                     | TypeScript strict sur les trois paquets                                          |
| `npm run build`                         | Construit `@sillon/core`, l'API et l'interface                                   |
| `npm run db:migrate:dev -w @sillon/api` | Crée une migration après modification du schéma                                  |

---

## Architecture

```
sillon/
├── packages/core/     @sillon/core — règles métier pures, sans base ni navigateur
├── apps/api/          Fastify 5 + Prisma 6 + PostgreSQL 16 (REST + OpenAPI)
├── apps/web/          React 19 + Vite + TanStack Router/Query + Tailwind 4 (PWA)
├── e2e/               Parcours Playwright (smartphone et bureau)
├── specs/             Brief, modèle de données, schéma Prisma d'origine
└── infra/             Initialisation PostgreSQL pour Docker
```

### Le noyau métier est séparé

Tout ce qui se calcule vit dans `packages/core`, sans dépendance à Prisma ni au DOM :
chaîne des dates d'une série, quantités de semences et de plaques, expansion d'un
itinéraire technique, disponibilité des planches, délai de retour d'une famille,
rendements. L'API et l'interface appliquent **les mêmes fonctions** — l'aperçu des dates et
le calcul des semences s'affichent donc sans aller-retour serveur, et restent justes hors ligne.

### Tout est entier, dans les unités de Brinjel

Les unités de stockage sont reprises telles quelles des types Ecto de Brinjel
(`lib/brinjel/ecto_types/`), pour qu'une base Brinjel ou Qrop se reprenne sans arrondi :

| Grandeur                     | Unité de stockage         | Type Brinjel   |
| ---------------------------- | ------------------------- | -------------- |
| Longueur de planche          | **millimètre**            | `BedLength`    |
| Espacement sur le rang       | **dixième de millimètre** | `Distance`     |
| Rendement, quantité récoltée | **millième d'unité**      | `Yield`        |
| Densité de semences          | **graine par kilogramme** | `SeedsPerGram` |
| Prix, produit                | **centime**               | `Money`        |
| Durée de culture             | **jour**                  | —              |
| Temps de travail             | **seconde**               | —              |

Aucun flottant n'approche la base. La conversion n'a lieu qu'aux bords — à la saisie et à
l'affichage — dans `packages/core/src/units.ts` (`metersToMillimeters`,
`centimetersToTenthsOfMillimeter`, `unitsToThousandths`, `minutesToSeconds`…). Le
formulaire d'une série se saisit donc toujours en mètres, en centimètres et en minutes.

### Isolation des fermes : `farm_id` + RLS

Brinjel crée un schéma PostgreSQL par ferme. Sillon garde **un seul schéma** avec une colonne
`farm_id`, et confie l'isolation à la Row-Level Security (migration
`20260915120100_rls_ltree_search`) :

- chaque requête métier s'exécute dans une transaction qui pose `app.farm_id`
  (`apps/api/src/tenant.ts`) ;
- les politiques sont déclarées `FORCE ROW LEVEL SECURITY`, donc elles s'appliquent **aussi**
  au propriétaire des tables, c'est-à-dire à l'API ;
- les opérations transverses (création d'une ferme, amorçage du référentiel, comptes) passent
  explicitement par `withoutFarmScope`, qui pose `app.bypass_rls` ;
- une requête qui oublierait son `where farmId` ne renvoie rien : c'est vérifié par un test
  d'intégration (`apps/api/src/api.test.ts`, « la politique RLS filtre même une requête sans
  clause farm_id »).

Condition d'exploitation : **l'utilisateur de `DATABASE_URL` ne doit être ni superutilisateur
ni `BYPASSRLS`**, sans quoi les politiques sont ignorées.

Les tables de liaison sans `farm_id` (`planting_tags`, `location_assignments`,
`planting_tasks`, `locations_notes`…) ne portent pas de politique : elles sont toujours
interrogées à travers leur parent, lui-même filtré.

### Ce que Prisma ne sait pas déclarer

La deuxième migration ajoute à la main : l'index partiel « un seul propriétaire par ferme »,
le chemin `ltree` des emplacements maintenu par trigger (déplacer un jardin déplace toute sa
descendance), la fonction `sillon_unaccent` immuable et les index de recherche sans accents,
puis les politiques RLS.

### Mode hors ligne

Deux mécanismes complémentaires :

1. **Lectures** — le service worker (`vite-plugin-pwa`, stratégie _network-first_ avec repli
   sur le cache) garde consultables la feuille de la semaine et l'assolement sans réseau ;
2. **Écritures** — les saisies de terrain (validation d'une tâche, saisie d'une récolte)
   partent dans une file d'attente IndexedDB (`apps/web/src/lib/outbox.ts`) et sont rejouées
   dans l'ordre au retour du réseau. Une écriture refusée par le serveur (4xx) est abandonnée
   pour ne pas bloquer les suivantes ; une panne serveur (5xx) laisse la file intacte.

Les écritures structurantes (créer une série, déplacer une planche) exigent le réseau : elles
ont besoin d'une réponse du serveur (identifiants, contrôles de rotation).

---

## Portage depuis Brinjel : ce qui a été vérifié

La première version de Sillon a été écrite sans le code Elixir sous la main (Framagit filtre
les accès automatisés) : huit points du modèle avaient reçu une valeur explicite, marquée
« à confirmer ». Le code de Brinjel a depuis été lu ligne à ligne. **Six de ces huit
hypothèses étaient fausses** ; elles ont été corrigées, et la migration
`20260916090000_align_sur_brinjel` convertit les données existantes.

| Point                    | Hypothèse initiale                      | Ce que fait Brinjel                                                                                            | Où                              |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Unité de `BedLength`     | centimètres                             | **millimètres** ; l'espacement est en **dixièmes de millimètre**                                               | `packages/core/src/units.ts`    |
| `labor_time`             | minutes                                 | **secondes**                                                                                                   | `packages/core/src/units.ts`    |
| Poquets par planche      | `floor(longueur / espacement)`, arrondi | `longueur × 10 / espacement × rangs`, **sans arrondi** — le flottant se propage jusqu'à la commande            | `packages/core/src/seeds.ts`    |
| Perte en pépinière       | augmente le nombre d'alvéoles semées    | **divise** les graines par alvéole et le nombre de plants (`/ (1 − perte)`), le nombre de poquets ne bouge pas | `packages/core/src/seeds.ts`    |
| Marge de sécurité        | s'applique à toute série                | n'entre **que dans la commande**, et **seulement en semis direct**                                             | `packages/core/src/seeds.ts`    |
| Rôles `farm_memberships` | `owner`, `manager`, `member`            | **cinq** rôles : `owner`, `manager`, `employee`, `seasonal`, `consultant`                                      | `apps/api/prisma/schema.prisma` |
| `families.interval`      | délai de retour en années               | confirmé — années, comparées en jours (`365`)                                                                  | `packages/core/src/rotation.ts` |
| Occupation d'une planche | de la mise en place à la fin de récolte | confirmé — la pépinière n'occupe pas la planche                                                                | `packages/core/src/planting.ts` |

Le modèle des dates a changé de la même façon. Une série ne porte plus une « date de
départ » et deux dates de récolte, mais :

- trois dates possibles — `sowing`, `planting`, `potting` — dont celle qui vaut mise en
  place au champ dépend du type de série (`fieldDate`) ;
- trois durées — `days_to_transplant`, `days_to_maturity`, `harvest_window` ;
- **une liste** de fenêtres de récolte (`harvest_periods`) : une série peut en compter
  plusieurs, ce qu'une paire début/fin ne savait pas représenter.

Le type de série compte désormais quatre valeurs, `seedling` (production de plants, qui
n'occupe pas de planche et ne produit pas de récolte) s'ajoutant aux trois premières.

Chacune de ces corrections est couverte par des tests : ils citent en commentaire le
fichier Elixir dont la formule est tirée.

---

## Tests

| Niveau       | Où                                | Contenu                                                                                                                                                                                            |
| ------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitaire     | `packages/core/src/*.test.ts`     | 90 tests : dates et semaines ISO, chaîne des dates d'une série, semences et plaques, itinéraires techniques, disponibilité des planches, rotations, rendements, commandes, CSV, montants           |
| Unitaire     | `apps/web/src/lib/outbox.test.ts` | file d'attente hors ligne : ordre, rejeu, abandon d'une saisie refusée, reprise après panne                                                                                                        |
| Intégration  | `apps/api/src/api.test.ts`        | 26 tests sur une vraie base : inscription, rôles, **isolation RLS**, trigger `ltree`, filtres, lot, duplication, rotations, génération et recalage des tâches, commandes CSV, statistiques, export |
| Bout en bout | `e2e/parcours.spec.ts`            | parcours complet joué au **smartphone** et au **bureau** sur le build de production                                                                                                                |

```bash
npm test          # unitaires + intégration (PostgreSQL requis)
npm run test:e2e  # Playwright ; PLAYWRIGHT_CHROMIUM_PATH permet d'utiliser un Chromium déjà installé
```

---

## Poids et performance

Le bundle initial pèse **144 kio compressés** (JS) + 6 kio de CSS ; les écrans de bureau
(assolement, commandes, statistiques, paramètres) sont chargés à la demande. Cela tient dans
la cible « moins de 300 ko hors images » du brief. Les graphiques (Gantt, barres) sont dessinés
en SVG et en CSS : aucune bibliothèque de visualisation n'est téléchargée.

---

## Ce qui reste à faire

- **Courriels** : les invitations créent bien un jeton, mais aucun message n'est envoyé —
  l'interface propose le lien à copier. Confirmation d'adresse et réinitialisation de mot de
  passe restent à brancher.
- **Tâches de fond** (BullMQ + Redis) : exports volumineux, envoi des courriels, régénération
  massive des tâches. Le service Redis est déjà dans `docker-compose.yml`.
- **Stockage objet S3** : `apps/api/src/storage.ts` définit l'interface et une implémentation
  locale ; il reste à écrire l'implémentation S3 et le redimensionnement à l'upload.
- **TOTP**, abonnements Paddle, centres de formation et fermes d'apprenants : tables et
  relations présentes, logique à écrire.
- **Glisser-déposer** de l'assolement sur PC : le placement se fait aujourd'hui par la liste
  des emplacements disponibles, qui fonctionne aussi au doigt.
- **Traductions** : les fichiers `apps/web/src/i18n/locales/*.json` sont prêts pour Weblate ;
  l'espagnol et le néerlandais n'attendent qu'un fichier de plus.
- **Supervision** : page d'état publique et Sentry.

---

## Licence et crédits

Sillon est publié sous **AGPL-3.0-or-later** (voir `LICENSE`).

Le modèle de données, les règles métier et les parcours utilisateurs dérivent de **Brinjel**,
© André Hoarau, sous la même licence. Les fichiers concernés portent les deux mentions de
copyright, selon la convention [REUSE](https://reuse.software/) — la CI vérifie leur présence.

> Sillon — planification maraîchère libre.
