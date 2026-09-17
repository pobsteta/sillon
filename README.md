# Sillon — planification maraîchère libre

<!-- badges: start -->

[![CI](https://github.com/pobsteta/sillon/actions/workflows/ci.yml/badge.svg)](https://github.com/pobsteta/sillon/actions/workflows/ci.yml)
[![Release](https://github.com/pobsteta/sillon/actions/workflows/release.yml/badge.svg)](https://github.com/pobsteta/sillon/actions/workflows/release.yml)
[![Version](https://img.shields.io/github/v/release/pobsteta/sillon?sort=semver&logo=github&label=version&color=blue)](https://github.com/pobsteta/sillon/releases/latest)
[![REUSE](https://api.reuse.software/badge/github.com/pobsteta/sillon)](https://api.reuse.software/info/github.com/pobsteta/sillon)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg?logo=gnu)](https://www.gnu.org/licenses/agpl-3.0)

<!-- badges: end -->

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
| Récoltes, notes, photos (réduites au navigateur **et** au serveur, purgées de leurs métadonnées)                  | ✅   |
| Statistiques : rendements prévu/réalisé, temps de travail, avancement                                             | ✅   |
| PWA : installation, cache des lectures, file d'attente des saisies hors ligne                                     | ✅   |
| Interface fr/en, mode sombre, cibles tactiles ≥ 44 px, feuilles d'impression                                      | ✅   |
| Export complet des données de la ferme (RGPD, auto-service)                                                       | ✅   |
| Abonnements, centres de formation, TOTP : **tables présentes, interface à écrire**                                | ⏳   |
| Courriels : invitation, confirmation d'adresse, mot de passe oublié                                               | ✅   |
| Tâches de fond : file des courriels (BullMQ + Redis), worker distinct                                             | ✅   |
| Stockage objet compatible S3 (Scaleway, OVH, Hetzner) ou dossier local                                            | ✅   |

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
la documentation OpenAPI sur <http://localhost:3000/docs>. Les migrations sont appliquées
au démarrage du conteneur ; la base part vide, on crée son compte et sa ferme depuis
l'écran de connexion.

L'API se connecte sous `sillon_app`, un rôle **ordinaire** créé par
`infra/postgres-init.sql` — pas sous le superutilisateur de l'image PostgreSQL, qui
ignorerait les politiques RLS et rendrait l'isolation des fermes inopérante sans rien
signaler.

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

### Sur Windows

Les deux chemins ci-dessus marchent tels quels ; seules changent les commandes du shell.

**Avec Docker Desktop** (le plus simple) — installez Docker Desktop avec le moteur WSL 2,
puis dans PowerShell, à la racine du dépôt :

```powershell
copy .env.example .env
docker compose up --build
```

L'interface répond sur <http://localhost:8080>. Pour tout arrêter : `docker compose down`
(ajoutez `-v` pour effacer aussi la base).

**Sans Docker** — Node 22+ et PostgreSQL 16, par exemple avec winget :

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.16
```

L'installateur PostgreSQL ajoute `psql` dans `C:\Program Files\PostgreSQL\16\bin` ;
ouvrez un nouveau PowerShell pour que le `PATH` soit à jour. Créez ensuite le rôle et les
bases (le mot de passe demandé est celui du superutilisateur `postgres` choisi à
l'installation) :

```powershell
psql -U postgres -c "CREATE ROLE sillon LOGIN PASSWORD 'sillon' CREATEDB;"
psql -U postgres -c "CREATE DATABASE sillon_dev OWNER sillon;"
psql -U postgres -c "CREATE DATABASE sillon_test OWNER sillon;"
psql -U postgres -d sillon_dev  -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS ltree;"
psql -U postgres -d sillon_test -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS ltree;"
```

Puis le projet :

```powershell
npm install
copy apps\api\.env.example apps\api\.env
npm run build -w @sillon/core
npm run db:migrate
npm run db:seed        # compte : maraichere@example.org / sillon-demonstration
npm run dev            # API sur 3000, interface sur http://localhost:5173
```

`npm run dev` démarre les deux serveurs dans la même fenêtre (`scripts/dev.mjs`), sous
PowerShell comme sous cmd.exe ; Ctrl+C les arrête tous les deux.

Pour rejouer la suite de tests, il faut que PostgreSQL tourne :

```powershell
npm run typecheck
npm test               # unitaires + intégration
npm run test:e2e       # Playwright ; `npx playwright install chromium` la première fois
```

### Courriels

Trois messages partent : l'invitation à rejoindre une ferme, la confirmation d'adresse à
l'inscription, et le lien de réinitialisation du mot de passe.

**Sans configuration, rien ne part et tout s'affiche.** Le transport par défaut écrit le
message dans la console du serveur, lien compris : de quoi dérouler un parcours complet en
développement sans serveur SMTP.

```
─── courriel non envoyé (transport console) ───
  à      : maraichere@example.org
  objet  : Confirmez votre adresse Sillon
  …
  http://localhost:5173/confirmation/nDq8…
───────────────────────────────────────────────
```

En production, `SMTP_URL` bascule sur un vrai serveur. S'il est absent, l'API le dit au
démarrage — une invitation qui ne part pas est un défaut silencieux, et c'est bien le
genre de chose qu'on découvre trop tard.

**Avec `REDIS_URL`, les envois sortent du chemin de la requête.** Le message part dans une
file BullMQ et un worker distinct s'en charge : un serveur SMTP lent ne fait plus attendre
la personne qui s'inscrit ou qui invite un collègue. Les routes n'ont pas changé — elles
appellent toujours `app.mailer.send()`, c'est le transport qui est enveloppé.

```bash
npm run dev -w @sillon/api          # l'API met en file
npm run dev:worker -w @sillon/api   # le worker la vide
```

Sous `docker compose`, le service `worker` fait ce travail ; il partage l'image de l'API.
**Sans worker, les courriels s'empilent dans Redis sans jamais partir.** Avec une file, c'est
lui qui parle à SMTP : `SMTP_URL` et `MAIL_FROM` doivent être donnés **au worker**, et la
sortie du transport console s'y lit (`docker compose logs worker`). L'API garde ces variables
pour le seul cas où elle doit envoyer elle-même, Redis étant injoignable ; `APP_URL`, qui
fabrique les liens, reste de son côté.

Chaque envoi est retenté cinq fois, à intervalle exponentiel à partir de dix secondes, soit
un peu plus de deux minutes et demie — de quoi traverser le redémarrage d'un serveur SMTP.
Les travaux réussis disparaissent au bout d'une heure, les échoués restent une semaine :
c'est la trace qui permet de répondre à « je n'ai jamais reçu l'invitation ».

Si Redis est injoignable au moment de la mise en file, l'API **envoie quand même**, en
direct, et le journalise. Perdre une invitation serait pire que rendre la main une seconde
plus tard. Deux garde-fous s'en chargent, et il en faut bien deux : l'API ne s'adresse pas à
une file dont la connexion n'est pas prête — c'est le cas courant d'un Redis arrêté, et le
seul qui garantisse l'absence de doublon — et elle borne l'attente à trois secondes pour le
reste, car `Queue.add()` commence par attendre une connexion prête, sans échéance. La
connexion étant par ailleurs paresseuse et ouverte en tâche de fond, l'API démarre aussi
lorsque Redis est absent.

| Variable           | Rôle                                                      | Défaut                               |
| ------------------ | --------------------------------------------------------- | ------------------------------------ |
| `SMTP_URL`         | `smtps://utilisateur:motdepasse@serveur:465`              | _absent_ → console                   |
| `MAIL_FROM`        | Expéditeur                                                | `Sillon <ne-pas-repondre@localhost>` |
| `APP_URL`          | Adresse publique de l'interface, base des liens envoyés   | `http://localhost:5173`              |
| `TOKEN_HOURS`      | Validité des liens de confirmation et de réinitialisation | `24`                                 |
| `REDIS_URL`        | File de fond ; absent, l'envoi se fait dans la requête    | _absent_ → envoi direct              |
| `MAIL_CONCURRENCY` | Courriels traités de front par le worker                  | `4`                                  |

Les liens sont à usage unique : le jeton est détruit dès qu'il est validé, et une nouvelle
demande annule la précédente. Réinitialiser un mot de passe ferme toutes les sessions
ouvertes, y compris sur d'autres appareils. Enfin, la demande de réinitialisation répond
la même chose que l'adresse soit inscrite ou non.

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
| `npm run dev:worker -w @sillon/api`     | Worker des files de fond (courriels) ; exige `REDIS_URL`                         |

---

## Architecture

```
sillon/
├── packages/core/     @sillon/core — règles métier pures, sans base ni navigateur
├── apps/api/          Fastify 5 + Prisma 6 + PostgreSQL 16 (REST + OpenAPI)
├── apps/web/          React 19 + Vite + TanStack Router/Query + Tailwind 4 (PWA)
├── e2e/               Parcours Playwright (smartphone et bureau)
├── specs/             Brief, modèle de données, schéma Prisma d'origine
├── scripts/           Outils de développement multiplateformes (dev.mjs)
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

### Photos : normalisées à l'arrivée, puis rangées

La photo est réduite **deux fois, pour deux raisons différentes**. Dans le navigateur
d'abord (`apps/web/src/lib/image.ts`), parce qu'au champ c'est le **transfert** qui coûte :
sur un partage de connexion qui hoquette, envoyer 6 Mo prend une minute et échoue souvent,
en envoyer 400 Ko passe. Puis sur le serveur, parce qu'une API publique doit se protéger de
ce qu'on lui envoie — et parce que le navigateur ne sait pas toujours faire.

Côté navigateur, rien n'est promis : sans `createImageBitmap`, sur une image que le
décodeur refuse, ou si le réencodage alourdit le fichier — ce qui arrive aux captures
d'écran, le JPEG ne battant pas le PNG sur de grands aplats —, c'est l'original qui part.
Une photo un peu lourde vaut mieux qu'une photo perdue.

Une photo prise au champ pèse 4 à 8 Mo pour 4 000 pixels de large, porte son orientation
dans une étiquette EXIF plutôt que dans ses pixels, et emporte les **coordonnées GPS de la
parcelle**. Les trois posent problème, et `apps/api/src/images.ts` les règle en une passe :
orientation appliquée puis retirée, métadonnées non recopiées, côté long ramené à
2 048 pixels, réencodage en JPEG. Une photo de téléphone y perd plus de la moitié de son
poids sans rien de visible en moins — ce qui compte quand on la recharge au champ.

Le format de sortie est unique, et c'est délibéré : le stockage devient homogène et le type
servi n'est plus une devinette. Le JPEG l'emporte sur le WebP parce que le brief compte
parmi ses utilisateurs des « appareils parfois anciens ou bas de gamme », et qu'une photo
qu'on ne peut pas ouvrir ne vaut rien.

Le type est enregistré en base et servi tel quel. Il ne l'était pas : la route répondait
`application/octet-stream`, que `X-Content-Type-Options: nosniff` — posé par `helmet` sur
toutes les réponses — interdit d'afficher. La vignette existait dans le code et restait
blanche à l'écran.

Les photos vont sur un stockage objet compatible S3 dès que `S3_BUCKET` est décrit, et dans
un dossier local sinon. C'est la même interface des deux côtés : les routes ne savent pas
laquelle elles ont sous la main.

| Variable               | Rôle                                                              | Défaut                   |
| ---------------------- | ----------------------------------------------------------------- | ------------------------ |
| `S3_BUCKET`            | Seau du stockage objet ; absent, les photos vont sur disque       | _absent_ → dossier local |
| `S3_ENDPOINT`          | Serveur compatible S3, hors AWS                                   | _absent_                 |
| `S3_REGION`            | Région                                                            | `fr-par`                 |
| `S3_ACCESS_KEY_ID`     | Clé d'accès ; absente, la chaîne d'identification habituelle joue | _absent_                 |
| `S3_SECRET_ACCESS_KEY` | Secret associé                                                    | _absent_                 |
| `S3_PREFIX`            | Préfixe des clés, pour partager un seau                           | _absent_                 |
| `S3_FORCE_PATH_STYLE`  | URL en `serveur/seau/clé` plutôt qu'en sous-domaine               | `true`                   |
| `UPLOAD_DIR`           | Dossier des photos sans stockage objet                            | `uploads/`               |

L'aller-retour — dépôt, relecture, préfixe, type, suppression — a été joué contre un MinIO
local, forme chemin comprise :

```bash
docker run -d -p 9000:9000 -e MINIO_ROOT_USER=… -e MINIO_ROOT_PASSWORD=… \
  quay.io/minio/minio server /data
```

---

### Files de fond : un second processus

Avec `REDIS_URL`, un déploiement compte **deux processus** issus de la même image : le
serveur web (`dist/server.js`) et le worker (`dist/worker.js`). L'un remplit les files, l'autre
les vide. Oublier le worker ne casse rien de visible — les courriels s'accumulent simplement
dans Redis sans jamais partir, ce qui est exactement le genre de panne qu'on découvre trois
jours plus tard.

Les deux bouts ne configurent pas Redis pareil, et c'est délibéré : côté API la mise en file
échoue tout de suite si Redis manque, pour que l'envoi direct prenne le relais sans faire
attendre la requête ; côté worker la connexion est patiente, parce qu'il n'a personne à faire
patienter. `apps/api/src/queue.ts` porte le détail.

---

## Portage depuis Brinjel : ce qui a été vérifié

La première version de Sillon a été écrite sans le code Elixir sous la main (Framagit filtre
les accès automatisés) : huit points du modèle avaient reçu une valeur explicite, marquée
« à confirmer ». Le code de Brinjel a depuis été lu ligne à ligne. **Six de ces huit
hypothèses étaient fausses** ; elles ont été corrigées, et la migration
`20260916090000_align_sur_brinjel` convertit les données existantes.

| Point                    | Hypothèse initiale                      | Ce que fait Brinjel                                                                                                                    | Où                              |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Unité de `BedLength`     | centimètres                             | **millimètres** ; l'espacement est en **dixièmes de millimètre**                                                                       | `packages/core/src/units.ts`    |
| `labor_time`             | minutes                                 | **secondes**                                                                                                                           | `packages/core/src/units.ts`    |
| Poquets par planche      | `floor(longueur / espacement)`, arrondi | `longueur × 10 / espacement × rangs`, **sans arrondi** — le flottant se propage jusqu'à la commande                                    | `packages/core/src/seeds.ts`    |
| Perte en pépinière       | augmente le nombre d'alvéoles semées    | **divise** les graines par alvéole et le nombre de plants (`/ (1 − perte)`), le nombre de poquets ne bouge pas                         | `packages/core/src/seeds.ts`    |
| Marge de sécurité        | s'applique à toute série                | n'entre **que dans la commande**, et **seulement en semis direct**                                                                     | `packages/core/src/seeds.ts`    |
| Rôles `farm_memberships` | trois rôles sur une échelle             | **cinq** rôles, et une **matrice** de permissions : le saisonnier saisit des récoltes sans voir les commandes, le consultant l'inverse | `packages/core/src/roles.ts`    |
| `families.interval`      | délai de retour en années               | confirmé — années, comparées en jours (`365`)                                                                                          | `packages/core/src/rotation.ts` |
| Occupation d'une planche | de la mise en place à la fin de récolte | confirmé — la pépinière n'occupe pas la planche                                                                                        | `packages/core/src/planting.ts` |

Les rôles méritent un mot : ce n'est **pas** une hiérarchie. Une première version rangeait
les cinq rôles sur une échelle (consultant < saisonnier < employé < chef de culture <
propriétaire), ce qui renvoyait 403 au saisonnier sur les tâches et les récoltes — le
travail pour lequel le rôle existe. La matrice de `Brinjel.Admin.Role` est portée telle
quelle dans `packages/core/src/roles.ts` ; l'API la fait respecter par
`requirePermission(domaine, action)` sur les routes de terrain et de lecture, et garde
`requireFarm(rôle)` là où la hiérarchie `owner > manager` est bien ce que décrit Brinjel
(réglages, équipe, plan de culture en écriture).

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

| Niveau       | Où                                | Contenu                                                                                                                                                                                                                                                                             |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitaire     | `packages/core/src/*.test.ts`     | 99 tests : dates et semaines ISO, chaîne des dates d'une série, semences et plaques, **matrice des permissions**, itinéraires techniques, disponibilité des planches, rotations, rendements, commandes, CSV, montants                                                               |
| Unitaire     | `apps/web/src/lib/image.test.ts`  | compression avant envoi : dimensions visées, résultat gardé seulement s'il allège, nom du fichier, repli sur l'original quand le navigateur ne sait pas faire                                                                                                                       |
| Unitaire     | `apps/web/src/lib/outbox.test.ts` | file d'attente hors ligne : ordre, rejeu, abandon d'une saisie refusée, reprise après panne                                                                                                                                                                                         |
| Unitaire     | `apps/api/src/mail.test.ts`       | file des courriels : mise en file plutôt qu'envoi, repli en direct si Redis manque, livraison par le worker, échec relancé pour que la file réessaie                                                                                                                                |
| Unitaire     | `apps/api/src/images.test.ts`     | photos : réduction, orientation EXIF appliquée, métadonnées GPS retirées, réencodage, contenu illisible refusé ; choix du stockage et garde-fou du dossier local                                                                                                                    |
| Intégration  | `apps/api/src/api.test.ts`        | 41 tests sur une vraie base : inscription, **courriels transactionnels**, **rôles et permissions**, **isolation RLS**, trigger `ltree`, filtres, lot, duplication, rotations, génération et recalage des tâches, commandes CSV, statistiques, export, **type servi pour une photo** |
| Bout en bout | `e2e/parcours.spec.ts`            | 5 parcours joués au **smartphone** et au **bureau** sur le build de production : vignette réellement décodée, et photo de 14 Mo que seule la compression du navigateur fait passer                                                                                                  |

```bash
npm test          # unitaires + intégration (PostgreSQL requis)
npm run test:e2e  # Playwright ; PLAYWRIGHT_CHROMIUM_PATH permet d'utiliser un Chromium déjà installé
npm run lint      # ESLint : peu de règles, mais qui attrapent de vraies fautes
```

Les fichiers d'essai sont **typés comme le reste**. Ils ne l'étaient pas : le `tsconfig` de
construction les écarte — ils n'ont rien à faire dans `dist` — et le typage suivait cette
exclusion. Un essai pouvait donc appeler une méthode avec le mauvais nombre d'arguments
sans que rien ne le dise avant l'exécution, ce qui est précisément arrivé en écrivant
`images.test.ts`. `tsconfig.typecheck.json` reprend la même configuration sans rien exclure ;
il n'a révélé aucune erreur existante, ce qui rendait la correction gratuite.

Le style est l'affaire de Prettier, pas d'ESLint : la configuration ne contient aucune
règle de mise en forme. Elle vise les fautes que le typage ne voit pas — promesse oubliée,
variable morte, règles des hooks React. Les `any` restants sont des avertissements, et
`--max-warnings` fige leur nombre : la dette existante ne bloque personne, mais elle ne
grandit pas sans qu'on s'en aperçoive.

---

## Versions et publication

Rien ne se tague ni ne se publie à la main. Deux workflows s'en chargent.

### Les messages de commit pilotent la version

Le dépôt suit les [Conventional Commits](https://www.conventionalcommits.org/fr/). Seul le
préfixe est contraint ; la description reste en français :

```
feat(web): affiche la période de récolte sur la fiche d'une série
fix(api): rétablit l'isolation RLS sous Docker
docs: ajoute la section Windows
```

| Préfixe                       | Version (avant la 1.0) | Version (après) | Dans le CHANGELOG      |
| ----------------------------- | ---------------------- | --------------- | ---------------------- |
| `feat:`                       | mineure (0.1.0→0.2.0)  | mineure         | Fonctionnalités        |
| `!` ou `BREAKING CHANGE:`     | mineure (0.1.0→0.2.0)  | **majeure**     | Changements de rupture |
| `fix:`                        | corrective             | corrective      | Corrections            |
| `perf:`, `refactor:`, `docs:` | corrective             | corrective      | leur propre rubrique   |
| `ci:`, `test:`, `chore:`      | corrective             | corrective      | _masqué_               |

Avant la 1.0, une rupture ne propulse pas le projet en 1.0.0 : c'est le réglage
`bump-minor-pre-major` de `.release-please-config.json`. Les types masqués font quand même
avancer le numéro de version — ils n'ajoutent simplement pas de ligne au CHANGELOG.

Types acceptés : `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
`revert`. **Un message hors convention n'échoue nulle part : il disparaît simplement de la
release.** C'est le seul vrai piège.

### Ce qui se passe ensuite

1. Vous fusionnez une PR sur `main`.
2. `release.yml` ouvre — ou met à jour — une **PR de release** intitulée
   `chore(main): release X.Y.Z`. Elle ne contient que le `CHANGELOG.md` et les numéros de
   version (racine et les trois workspaces, tenus en phase).
3. Cette PR reste ouverte et s'enrichit à chaque fusion. **Rien n'est publié tant qu'elle
   n'est pas fusionnée** : c'est là que vous décidez du moment.
4. En la fusionnant : le tag `vX.Y.Z` est posé, la GitHub Release est créée avec les notes
   du CHANGELOG, et les images Docker partent sur ghcr.io.

### Images publiées

```bash
docker pull ghcr.io/pobsteta/sillon-api:latest
docker pull ghcr.io/pobsteta/sillon-web:0.2      # ou :0.2.0, ou :0
```

Elles sont construites depuis le tag, pas depuis la pointe de `main` : l'image correspond
exactement au code publié.

### Réglage indispensable du dépôt

Par défaut, GitHub interdit à ses propres Actions d'ouvrir une pull request. Sans ce
réglage, `release.yml` fait tout son travail — il calcule la version, écrit le CHANGELOG,
crée la branche `release-please--branches--main--components--sillon` et son commit — puis
échoue à la dernière ligne :

```
##[error] GitHub Actions is not permitted to create or approve pull requests.
```

Il faut donc cocher une case, **une seule fois**, dans
**Settings → Actions → General → Workflow permissions** :

> ☑ Allow GitHub Actions to create and approve pull requests

Puis relancer le workflow Release, ou pousser n'importe quoi sur `main`. Si vous préférez
ne pas l'autoriser globalement, l'alternative est un jeton personnel en
`secrets.RELEASE_PLEASE_TOKEN`, passé à l'action via son entrée `token` — il règle du même
coup le point suivant.

### Deux points à connaître

- Les PR ouvertes par `release.yml` utilisent le `GITHUB_TOKEN` intégré, et **GitHub ne
  déclenche pas de workflow depuis un workflow** : la CI ne tourne pas sur la PR de release.
  Ce n'est pas gênant — elle ne change que le CHANGELOG et des numéros de version — mais si
  une règle de protection de branche exige des checks, il faut le jeton personnel évoqué
  ci-dessus.
- Le premier passage crée la release `0.2.0` depuis la version `0.1.0` déclarée dans
  `.release-please-manifest.json`. Ce fichier est la source de vérité : ne l'éditez pas à la
  main, release-please le met à jour lui-même.

---

## Poids et performance

Le bundle initial pèse **144 kio compressés** (JS) + 6 kio de CSS ; les écrans de bureau
(assolement, commandes, statistiques, paramètres) sont chargés à la demande. Cela tient dans
la cible « moins de 300 ko hors images » du brief. Les graphiques (Gantt, barres) sont dessinés
en SVG et en CSS : aucune bibliothèque de visualisation n'est téléchargée.

---

## Ce qui reste à faire

- **Tâches de fond** : la file des courriels tourne (BullMQ + Redis, worker distinct) ;
  restent à y faire passer les exports volumineux et la régénération massive des tâches.
  `apps/api/src/queue.ts` accueille les files suivantes.
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
