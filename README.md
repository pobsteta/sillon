# Sillon — planification maraîchère libre

<!-- badges: start -->

[![CI](https://github.com/pobsteta/sillon/actions/workflows/ci.yml/badge.svg)](https://github.com/pobsteta/sillon/actions/workflows/ci.yml)
[![Release](https://github.com/pobsteta/sillon/actions/workflows/release.yml/badge.svg)](https://github.com/pobsteta/sillon/actions/workflows/release.yml)
[![Version](https://img.shields.io/github/v/release/pobsteta/sillon?sort=semver&logo=github&label=version&color=blue)](https://github.com/pobsteta/sillon/releases/latest)
[![REUSE status](https://api.reuse.software/badge/github.com/pobsteta/sillon)](https://api.reuse.software/info/github.com/pobsteta/sillon)
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
| Assolement : arbre jardins → planches (`ltree`), placement par glisser-déposer ou au doigt, rotations             | ✅   |
| Commandes de semences et de plants, export CSV                                                                    | ✅   |
| Récoltes, notes, photos (réduites au navigateur **et** au serveur, purgées de leurs métadonnées)                  | ✅   |
| Statistiques : rendements prévu/réalisé, temps de travail, avancement                                             | ✅   |
| PWA : installation, cache des lectures, file d'attente des saisies hors ligne                                     | ✅   |
| Interface fr/en, mode sombre, cibles tactiles ≥ 44 px, feuilles d'impression                                      | ✅   |
| Export complet des données de la ferme (RGPD, auto-service)                                                       | ✅   |
| Abonnements et centres de formation : **tables présentes, interface à écrire**                                    | ⏳   |
| Second facteur TOTP : enrôlement, codes de secours, anti-rejeu                                                    | ✅   |
| Courriels : invitation, confirmation d'adresse, mot de passe oublié                                               | ✅   |
| Tâches de fond : file des courriels (BullMQ + Redis), worker distinct                                             | ✅   |
| Supervision : sondes `/health` et `/ready`, remontée des erreurs (Sentry, désactivée par défaut)                  | ✅   |
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

#### Si un port est déjà pris

`docker compose` publie la base sur 5432, Redis sur 6379, l'API sur 3000 et l'interface sur 8080. Un poste de développement en occupe souvent l'un ou l'autre — auquel cas le démarrage
échoue sur `Bind for 127.0.0.1:5432 failed: port is already allocated`.

Les quatre sont configurables, et il suffit de changer celui qui gêne :

```bash
DB_PORT=5433 docker compose up          # ponctuellement
echo 'DB_PORT=5433' >> .env             # ou une fois pour toutes
```

Les conteneurs se joignent entre eux par le réseau interne de Compose : ces ports ne servent
qu'à les atteindre **depuis la machine hôte**, et les changer n'affecte rien d'autre.

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

### Déployer

Sillon se déploie normalement en **deux conteneurs** — `apps/api/Dockerfile` et
`apps/web/Dockerfile`, comme le montre `docker-compose.yml` — plus un worker si `REDIS_URL`
est configuré. Nginx sert les fichiers statiques mieux que Node, et le worker tourne à part :
c'est la façon recommandée.

Les hébergements gratuits n'accordent en général **qu'un seul service web**. D'où une
seconde image, `apps/api/Dockerfile.monoservice`, où l'API sert aussi l'interface : c'est
`WEB_DIST` qui l'active, et le comportement reproduit celui de la configuration Nginx —
repli sur `index.html` pour les routes du navigateur, `sw.js` jamais mis en cache, fichiers
d'`assets` gardés un an.

#### Sur Koyeb, gratuitement

[Koyeb](https://www.koyeb.com/) est une société française ; choisissez la région
**Francfort** pour rester dans l'UE.

1. **La base** — créez un PostgreSQL depuis la console. Le palier gratuit offre 1 Go, mais
   **5 heures de calcul par mois** : la base s'endort. C'est fait pour montrer
   l'application, pas pour qu'une ferme s'en serve.
2. **Le service** — « Create Web Service », depuis le dépôt GitHub, en choisissant le
   **Dockerfile** `apps/api/Dockerfile.monoservice` et le port **3000**.
3. **Les variables** :

   | Variable         | Valeur                                                    |
   | ---------------- | --------------------------------------------------------- |
   | `DATABASE_URL`   | celle de la base, **avec `?connection_limit=3`** à la fin |
   | `SESSION_SECRET` | 32 caractères au moins, propres à ce déploiement          |
   | `APP_URL`        | l'URL publique du service                                 |
   | `CORS_ORIGINS`   | la même URL                                               |
   | `COOKIE_SECURE`  | `true`                                                    |
   | `NODE_ENV`       | `production`                                              |

`connection_limit` n'est pas une coquetterie : les paliers gratuits plafonnent les
connexions, et Prisma en ouvre par défaut davantage que la base n'en accepte.

Ni `REDIS_URL` ni `S3_BUCKET` ne sont nécessaires : sans eux, les courriels partent dans la
requête et les photos vont sur le disque du conteneur. **Les photos disparaîtront à chaque
redéploiement** — acceptable pour un essai, pas au-delà.

#### Pour une vraie bêta

Un VPS à 4 ou 5 € par mois — [Hetzner](https://www.hetzner.com/) en Allemagne,
[Scaleway](https://www.scaleway.com/) en France — et le `docker-compose.yml` de ce dépôt.
Tout fonctionne alors, y compris ce que les paliers gratuits ne permettent pas : Redis, le
worker, les photos qui survivent, les sauvegardes. C'est la configuration pour laquelle
Sillon est bâti, et elle coûte moins d'efforts qu'un palier gratuit n'en épargne.

---

### Situer la ferme sur une carte

L'écran **Carte** pose la position de la ferme — en cherchant une adresse, en cliquant sur
le fond, ou en saisissant des coordonnées — puis sert à **dessiner le parcellaire** :
choisissez un emplacement, tracez son contour, et Sillon en donne la surface et le plus
grand côté. L'assolement ne bouge pas : la carte sert au plan, la liste au travail.

La mesure **se propose**. Un bouton règle la longueur de planche dessus si vous le
demandez — cette valeur sert aux calculs de semences, de rendement et de commande, et un
tracé approximatif ne doit pas en devenir la base tout seul. Le plan s'imprime, pour
l'emporter ou l'afficher dans la remise.

Deux choses méritent d'être sues avant de s'en servir :

- **la recherche d'adresse est le seul endroit où Sillon parle à l'extérieur.** Elle envoie
  l'adresse saisie au service configuré, ne part jamais pendant la frappe, et s'éteint par
  `GEOCODING=none` — on saisit alors ses coordonnées à la main et rien ne sort. Hors de
  France, `GEOCODING=ban+nominatim` ajoute un recours à Nominatim, sollicité seulement
  quand la Base Adresse Nationale n'a rien trouvé ;
- **Sillon ne livre qu'OpenStreetMap.** `MAP_TILE_URL` ajoute un second fond, que la carte
  propose alors dans un sélecteur — le choix se retient d'une visite à l'autre. Les
  orthophotos de l'IGN, par exemple, pour une ferme française.

  Ce qu'on ne peut pas y mettre : les tuiles de Google, de Bing ou d'Esri. Leurs conditions
  interdisent de les consommer hors de leurs propres bibliothèques, et interdisent la
  redistribution — les inscrire ici ferait porter à chaque personne qui installe Sillon une
  violation qu'elle n'a pas choisie. Si vous avez un contrat avec l'un d'eux, c'est à vous
  de le poser, et à vous seul.

### Ce que `.env` peut régler

Tout ce que le fichier contient arrive dans les conteneurs `api` et `worker` — `SMTP_URL`,
`ACCESS_POLICY`, `GEOCODING`, les fonds de carte, la limite de requêtes. Les valeurs
inscrites dans `docker-compose.yml` gardent la priorité pour ce qui désigne le réseau
interne (`DATABASE_URL`, `REDIS_URL`), que la machine hôte ne sait pas joindre.

`apps/api/src/env.ts` fait foi sur ce qui existe et sur les valeurs par défaut.

### Un jardin d'exemple

Un écran de plan de culture vide ne dit rien de ce que fait l'outil : les statistiques,
l'assolement et la feuille de commande ne se comprennent qu'avec une saison sous les yeux.

```bash
node scripts/jardin-exemple.mjs --email vous@example.org --password '…' --annee 2026
```

Trente-huit séries du 10 janvier au 5 novembre, quarante planches, les tâches, les récoltes
des fenêtres déjà passées et quelques notes de saison. Le script **passe par l'API** : les
dates dérivées, les durées et les quantités de semences sont donc calculées par le vrai
code — un jeu de données posé en SQL serait cohérent avec lui-même et faux vis-à-vis de
l'application.

Le placement respecte la **rotation** : une famille botanique ne revient pas sur une planche
avant son délai de retour. C'est ce qui dimensionne le parcellaire, et non la surface — une
saison de trente-huit séries demande au moins autant de planches distinctes que la famille
la plus représentée en compte.

Il refuse de tourner sur une année qui contient déjà des séries, sauf `--force` : un jeu de
démonstration posé sur des données réelles serait difficile à distinguer du travail de
quelqu'un.

### Tester sur un smartphone

Le téléphone et l'ordinateur doivent être sur le même réseau local. Relevez l'adresse
locale de l'ordinateur (`192.168.x.y`) : Vite l'affiche au démarrage sous « Network », et
`ip -4 addr show scope global` la donne aussi.

**Depuis la pile `docker compose`** — celle qui porte vos données. Posez l'adresse dans
`.env`, sans quoi les liens envoyés par courriel pointeraient vers l'appareil qui les
ouvre, c'est-à-dire nulle part :

```bash
echo 'APP_URL=http://192.168.x.y:8080' >> .env
docker compose up -d api
```

Sur le téléphone : `http://192.168.x.y:8080`. Nginx relaie `/api` sur le même port, donc
tout est de même origine et aucun réglage CORS n'est à toucher. Si la page n'arrive pas,
regardez le pare-feu de l'ordinateur (`sudo ufw status`, puis `sudo ufw allow 8080/tcp`).

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
l'installation sur l'écran d'accueil et le mode hors ligne restent inactifs — c'est-à-dire
précisément ce qui fait sa valeur au champ. Deux façons de les essayer :

- **par le câble** (Android) : `chrome://inspect` sur l'ordinateur, redirection de port
  `8080 → localhost:8080`. Le téléphone voit alors `http://localhost:8080`, **qui est un
  contexte sécurisé** ;
- **par un tunnel HTTPS** : `cloudflared tunnel --url http://localhost:8080` (ou 4173 en
  mode prévisualisation), puis l'adresse `https://…` obtenue.

« Ajouter à l'écran d'accueil » apparaît alors, et couper les données mobiles permet de
vérifier que la feuille de la semaine reste lisible et que les récoltes saisies partent en
file d'attente.

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
| `node scripts/jardin-exemple.mjs`       | Peuple une ferme d'une saison complète, pour montrer Sillon plein                |

---

## Architecture

```
sillon/
├── packages/core/     @sillon/core — règles métier pures, sans base ni navigateur
├── apps/api/          Fastify 5 + Prisma 6 + PostgreSQL 16 (REST + OpenAPI)
├── apps/web/          React 19 + Vite + TanStack Router/Query + Tailwind 4 (PWA)
├── e2e/               Parcours Playwright (smartphone et bureau)
├── specs/             Brief, modèle de données, schéma Prisma d'origine
├── scripts/           Outils de développement multiplateformes (dev.mjs, jardin-exemple.mjs)
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

### Assolement : deux gestes, un seul chemin

Le brief veut le glisser-déposer au bureau (§3.3) et la désignation au doigt sur le
téléphone (§7.2). Les deux aboutissent ici au même appel : `onDropOnBed`, déclenché aussi
bien par le dépôt d'une puce que par le bouton « Placer ici » qui apparaît sur chaque
planche dès qu'une série est désignée.

Ce bouton n'est pas un pis-aller mobile. Le glisser-déposer natif du navigateur ignore le
toucher, et il n'existe pas au clavier : sans lui, l'assolement ne serait utilisable qu'à la
souris. Une puce reste donc un `<button>` porteur d'`aria-pressed`, et la planche affiche une
cible explicite.

Les règles du geste sont dans le noyau, pas dans l'écran : `placeWholeOnBed` place une série
entière sur une planche en rabotant à sa longueur et en annonçant ce qui dépasse,
`moveAssignment` déplace un tronçon d'une planche à l'autre en fusionnant avec ce qui s'y
trouvait déjà — sans quoi l'assolement montrerait deux barres accolées pour une seule
culture. Les deux sont testées sans navigateur.

Le contrôle de rotation reste celui de l'API, qui refuse un placement fautif tant qu'on ne
passe pas `force` ; l'écran repose alors la question plutôt que de décider à la place de
qui sait ce qu'il fait.

---

### Décaler un printemps sans perdre ses tâches

Une gelée tardive, on repousse toute la saison d'une semaine : c'est ce que fait le
traitement par lot du plan de culture. Les tâches engendrées **suivent désormais** les dates
de leur série. Elles ne le faisaient pas : le plan disait une chose et la feuille de tâches
en disait une autre, et personne n'aurait vu l'écart avant d'aller semer aux anciennes dates.

Le recalage existait pourtant, mais dans une route par série (`reschedule-tasks`) qu'aucun
écran n'appelait. Il est remonté dans `apps/api/src/task-scheduling.ts`, d'où la route et le
traitement par lot le partagent.

Les tâches **déjà faites ne bougent pas**. Le travail réalisé est un fait : il s'est passé le
jour où il s'est passé, et repousser le plan ne le déplace pas dans le passé. Une tâche
ajoutée à la main ne bouge pas non plus — personne ne lui a donné de règle à suivre.

L'écran annonce le nombre de tâches déplacées, ce qui évite d'aller vérifier.

---

### Second facteur : ce que valent les refus

Le code se donne dans la **même requête** que le mot de passe, et non après un jeton
intermédiaire « mot de passe accepté, code attendu ». Un tel jeton serait un second
identifiant à émettre, transporter, expirer et révoquer : exactement la pièce qu'on ajoute
pour renforcer la connexion et qui finit par l'affaiblir. Quand le mot de passe est bon et
le code absent, la réponse est un 401 portant le code `totp_required`, et l'interface
affiche le champ.

Ce qui se refuse compte plus que ce qui s'accepte :

- **le mot de passe faux ne réclame rien.** Sinon la réponse dirait « ce compte existe et il
  est protégé » — une information qu'on ne doit pas à qui essaie une adresse au hasard ;
- **un code ne sert qu'une fois.** Il reste valable une demi-minute ; le pas de temps employé
  est mémorisé, et un pas déjà consommé est refusé. Cela vaut aussi pour le code qui a servi
  à activer le second facteur, au moment où le rejeu serait le plus tentant ;
- **un code de secours disparaît en servant.** Ils sont hachés comme des mots de passe : une
  copie de la base ne donne pas de quoi se connecter, et personne — support compris — ne
  peut les relire ;
- **désactiver exige le mot de passe.** Une session ouverte sur un poste laissé sans
  surveillance ne suffit pas à retirer la protection.

L'enrôlement se fait en deux temps : le secret est préparé **désactivé**, puis un premier
code l'active. Activer d'emblée enfermerait dehors qui aurait mal recopié le secret ou dont
le téléphone est à l'heure d'un autre fuseau.

L'algorithme est écrit dans `apps/api/src/totp.ts` plutôt qu'emprunté à une bibliothèque, et
la raison n'est pas l'économie d'une dépendance : la RFC 6238 publie des vecteurs d'essai, et
une implémentation qu'on peut leur confronter vaut mieux qu'une boîte noire. Ils sont dans
les essais, avec ceux de la base32 (RFC 4648).

Le secret est rangé en octets, tel quel, comme le prévoit le schéma porté de Brinjel. Le
chiffrer au repos supposerait une clé à gérer : liée à `SESSION_SECRET`, sa rotation —
aujourd'hui sans conséquence, elle ne fait que déconnecter — enfermerait tout le monde
dehors. Le choix est assumé, et la base doit être protégée comme elle l'est déjà pour le
reste des données d'une ferme.

---

### Le droit d'écrire : une question, trois réponses

Sillon sert trois modèles — auto-hébergement, gratuit, service payant — et l'AGPL garantit
qu'il sera auto-hébergé, que le service existe ou non. La facturation est donc une propriété
d'un **déploiement**, pas du produit : l'application pose une seule question, _cette ferme
peut-elle écrire ?_, et `ACCESS_POLICY` désigne qui répond.

| Politique    | Réponse                         | Pour qui                                         |
| ------------ | ------------------------------- | ------------------------------------------------ |
| `ouverte`    | toujours oui                    | **défaut** — auto-hébergement, lycée, associatif |
| `essai`      | oui jusqu'à `trial_expiry_date` | démonstration, formation                         |
| `abonnement` | oui tant que `paid_until` court | le service payant                                |

**Sans configuration, rien ne change** : aucune échéance ne s'applique et aucun code de
facturation n'entre en jeu. C'est la même façon de faire que `Mailer` et `PhotoStorage`.

Deux règles ne se négocient pas :

- **on ne refuse jamais la lecture.** Une échéance dépassée met la ferme en lecture seule,
  **export compris** — c'est une saison entière de travail, et l'export en libre-service est
  promis par ailleurs. Un essai de bout en bout le vérifie ;
- **l'essai reste acquis.** Sous `abonnement`, un abonnement échu ne reprend pas un essai
  encore en cours : on garde ce qu'on avait donné.

Le verrou tient en **un seul endroit**, `resoudreFerme`, par où passe toute route liée à une
ferme, et la méthode HTTP dit si la requête écrit. Le qualifier route par route donnerait une
liste qu'on oublierait de compléter — et un trou qui ne se verrait pas.

L'état d'accès accompagne chaque ferme dès la session : l'interface affiche un bandeau et
**désarme ses boutons**, plutôt que de laisser saisir une journée de relevés pour découvrir
au moment d'enregistrer qu'on ne peut plus écrire. Le refus, s'il survient, porte le code
`farm_read_only` — distinct d'un `forbidden` ordinaire, parce que ce n'est pas la personne
qui manque de droits mais la ferme qui est en lecture seule.

`Farm.paid_until` est la source de vérité de l'échéance. La table `Subscription`, portée
depuis Brinjel, n'est qu'un miroir de prestataire, qui viendrait l'alimenter le jour où il y
en aurait un — voir `brief/abonnements-et-centres-de-formation.md`.

---

### Supervision : deux sondes, et une nuance

`/health` dit « ce processus est vivant » : elle ne touche à rien et répond tout de suite,
ce qui permet à un répartiteur de charge de l'interroger plusieurs fois par minute.

`/ready` dit « le service peut travailler » : elle interroge PostgreSQL, Redis et le
stockage des photos. C'est celle qu'une page d'état publique surveille.

La nuance est dans le poids des dépendances, et elle décide qui on réveille. Sans
PostgreSQL, il n'y a pas de service : `ko`, et **503**. Sans Redis, les courriels partent
quand même, en direct — c'est `QueuedMailer` qui s'en charge. Sans stockage objet, les
photos ne s'affichent plus mais le plan de culture, les tâches et les récoltes continuent.
Ces deux-là donnent `degraded` et un **200** : une astreinte mérite d'être prévenue, pas
réveillée à trois heures pour une vignette.

```json
{
  "status": "degraded",
  "version": "0.4.0",
  "sondes": [
    { "name": "postgresql", "status": "ok", "ms": 101, "essential": true },
    {
      "name": "redis",
      "status": "ko",
      "ms": 1,
      "essential": false,
      "detail": "Connection is closed."
    },
    { "name": "stockage", "status": "ok", "ms": 1, "essential": false }
  ]
}
```

Chaque sonde est bornée dans le temps : une dépendance qui ne répond plus — le cas le plus
courant, bien avant le refus franc — ferait pendre la sonde, et la page d'état n'afficherait
plus rien. Le détail publié est réduit à la première ligne du message et écourté : la page
est publique, et les messages des pilotes sont bavards.

**Sentry** ne s'initialise qu'avec `SENTRY_DSN`. Sans lui, rien ne sort de la machine — le
brief promet « aucun tiers analytique », et une installation auto-hébergée ne doit pas se
mettre à parler à un service tiers parce qu'une dépendance était dans le paquet. Avec lui,
seules les **erreurs non gérées** remontent : les 4xx sont des réponses prévues, les y
envoyer noierait les vraies pannes. Ni adresse IP, ni cookie, ni en-tête, ni corps de
requête — une requête de Sillon contient des rendements, des prix et des adresses.

| Variable                    | Rôle                          | Défaut             |
| --------------------------- | ----------------------------- | ------------------ |
| `SENTRY_DSN`                | Active la remontée d'erreurs  | _absent_ → inactif |
| `SENTRY_ENVIRONMENT`        | Nom de l'environnement        | `NODE_ENV`         |
| `SENTRY_TRACES_SAMPLE_RATE` | Part des transactions tracées | `0`                |

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

| Niveau       | Où                                 | Contenu                                                                                                                                                                                                                                                                             |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitaire     | `packages/core/src/*.test.ts`      | 107 tests : dates et semaines ISO, chaîne des dates d'une série, semences et plaques, **matrice des permissions**, itinéraires techniques, disponibilité des planches, **placement et déplacement d'un tronçon**, rotations, rendements, commandes, CSV, montants                   |
| Unitaire     | `apps/web/src/lib/image.test.ts`   | compression avant envoi : dimensions visées, résultat gardé seulement s'il allège, nom du fichier, repli sur l'original quand le navigateur ne sait pas faire                                                                                                                       |
| Unitaire     | `apps/web/src/lib/outbox.test.ts`  | file d'attente hors ligne : ordre, rejeu, abandon d'une saisie refusée, reprise après panne                                                                                                                                                                                         |
| Intégration  | `apps/api/src/recalage.test.ts`    | un décalage par lot emmène les tâches avec les dates de leur série, et laisse en place celles qui sont faites                                                                                                                                                                       |
| Unitaire     | `apps/api/src/totp.test.ts`        | second facteur : **vecteurs d'essai des RFC 6238 et 4648**, fenêtre de tolérance, codes de secours lisibles et sans signe ambigu                                                                                                                                                    |
| Intégration  | `apps/api/src/totp-routes.test.ts` | parcours complet : préparer, activer, se connecter, rejeu refusé, code de secours à usage unique, désactivation sous mot de passe                                                                                                                                                   |
| Unitaire     | `apps/api/src/health.test.ts`      | supervision : Redis à terre laisse le service dégradé, PostgreSQL à terre le met en panne, sonde bornée dans le temps, aucun détail d'infrastructure publié                                                                                                                         |
| Unitaire     | `apps/api/src/mail.test.ts`        | file des courriels : mise en file plutôt qu'envoi, repli en direct si Redis manque, livraison par le worker, échec relancé pour que la file réessaie                                                                                                                                |
| Unitaire     | `apps/api/src/images.test.ts`      | photos : réduction, orientation EXIF appliquée, métadonnées GPS retirées, réencodage, contenu illisible refusé ; choix du stockage et garde-fou du dossier local                                                                                                                    |
| Intégration  | `apps/api/src/api.test.ts`         | 41 tests sur une vraie base : inscription, **courriels transactionnels**, **rôles et permissions**, **isolation RLS**, trigger `ltree`, filtres, lot, duplication, rotations, génération et recalage des tâches, commandes CSV, statistiques, export, **type servi pour une photo** |
| Bout en bout | `e2e/parcours.spec.ts`             | 6 parcours joués au **smartphone** et au **bureau** sur le build de production : vignette réellement décodée, photo de 14 Mo que seule la compression du navigateur fait passer, série désignée puis posée sur une planche                                                          |

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

- **Tâches de fond** : la file des courriels tourne (BullMQ + Redis, worker distinct).
  Y faire passer l'export et le décalage par lot **n'est pas justifié** : mesure faite, un
  décalage de 200 séries et 400 tâches prend 2,1 s, et l'export récupère désormais ses
  photos huit de front. `apps/api/src/queue.ts` accueillera les files suivantes le jour où
  une mesure le réclamera, pas avant.
- **Abonnements Paddle, centres de formation et fermes d'apprenants** : tables et relations
  présentes, logique à écrire. Contrairement au reste, ces trois-là attendent des décisions
  qui ne sont pas techniques — compte marchand et grille tarifaire d'un côté, définition de
  ce qu'un centre de formation fait qu'une ferme ne fait pas de l'autre.
- **Traductions** : les fichiers `apps/web/src/i18n/locales/*.json` sont prêts pour Weblate ;
  l'espagnol et le néerlandais n'attendent qu'un fichier de plus.

---

## Licence et crédits

Sillon est publié sous **AGPL-3.0-or-later** (voir `LICENSE`).

Le modèle de données, les règles métier et les parcours utilisateurs dérivent de **Brinjel**,
© André Hoarau, sous la même licence. Les fichiers concernés portent les deux mentions de
copyright, selon la convention [REUSE](https://reuse.software/) — la CI vérifie leur présence.

### Vérifier la conformité REUSE

```bash
pipx install reuse   # ou : pip install reuse
npm run licences     # équivaut à « reuse lint »
```

Le dépôt est conforme à la **spécification REUSE 3.3** : chaque fichier suivi porte une
mention de copyright et une licence, directement en en-tête ou par `REUSE.toml`. La CI
rejoue ce contrôle à chaque PR (job `conformite-licences`).

### Le badge REUSE

Le badge en haut de ce fichier est servi par `api.reuse.software`, auprès de qui le dépôt
est **enregistré** : l'API reteste périodiquement la branche par défaut, et le badge suit
son état réel plutôt qu'une déclaration.

Deux contrôles indépendants portent donc la même exigence, et c'est voulu : la CI refuse une
PR non conforme (job `conformite-licences`), l'API constate l'état de `main` après coup. Le
premier empêche la régression, le second la rendrait visible si elle passait quand même.

Un badge gris n'y signifierait pas « non conforme » mais « dépôt inconnu de l'API » — c'est
l'état d'avant l'enregistrement, qui se fait une seule fois sur
<https://api.reuse.software/register> avec confirmation d'une adresse de courriel.

> Sillon — planification maraîchère libre.
