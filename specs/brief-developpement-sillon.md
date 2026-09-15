# Brief de développement — Sillon

*Application libre de planification et de suivi des cultures maraîchères, réécriture de Brinjel*

*Version 1.2 — 15 septembre 2026*

---

## 1. Contexte et objectif

Brinjel (https://brinjel.com) est un logiciel libre (licence AGPLv3) de planification et de suivi des cultures en maraîchage, créé par André Hoarau (successeur de Qrop). Il est proposé en SaaS par abonnement, hébergé dans l'UE, et vise les maraîchères et maraîchers de toutes tailles (du grand potager amateur à la ferme mécanisée de 5 ha), ainsi que les centres de formation agricole.

**Objectif du projet :** développer **Sillon**, une application équivalente, accessible depuis un smartphone (usage au champ, dans la pépinière) et depuis un PC (usage bureau pour la planification hivernale), avec une expérience adaptée à chaque support.

**Décision de cadrage (15/09/2026) :** l'application sera **réécrite dans une nouvelle stack**, en s'appuyant sur le code source de Brinjel (https://framagit.org/brinjel/brinjel) comme référence pour le modèle de données, les règles métier et les parcours utilisateurs. Le résultat sera **publié sous AGPLv3**, ce qui autorise la reprise directe de portions de code (schémas, algorithmes, traductions) à condition de conserver les mentions de copyright d'origine (voir section 5).

---

## 2. Utilisateurs cibles

| Profil | Usage principal | Support privilégié |
|---|---|---|
| Chef·fe de culture / maraîcher·e indépendant·e | Plan de culture, assolement, commandes de semences | PC (planification), smartphone (suivi) |
| Membre d'équipe / saisonnier | Tâches de la semaine, saisie des récoltes | Smartphone |
| Formateur / apprenant (lycée agricole, CFPPA) | Simulation de plans de culture, pédagogie | PC |
| Station expérimentale | Suivi précis, statistiques, export | PC |

**Contraintes terrain :** mains sales ou gantées, luminosité forte, connexion réseau intermittente au champ, appareils parfois anciens ou bas de gamme.

---

## 3. Périmètre fonctionnel

### 3.1 Plan de culture (cœur du produit)
- Référentiel paramétrable : familles botaniques → espèces → variétés.
- **Séries** (unité de base) : espèce, variété, mode d'implantation (semis direct, plantation, semis en pépinière), dates (semis, plantation, début/fin récolte), longueur de planche, espacements, densité, rendement escompté, prix, lieu (plein champ / sous abri), étiquettes libres.
- Saisie des dates en date complète **ou** en numéro de semaine (ex. « S12 », « 15/03 »).
- CRUD complet : créer, dupliquer, modifier, supprimer.
- **Traitement par lot** : modifier plusieurs séries d'un coup (variété, durées, dates, prix, rendement…).
- Tri et filtres : famille, espèce, variété, état, mode d'implantation, lieu, étiquettes.
- **Visualisation graphique** : diagramme de Gantt des séries sur la saison, vue multi-saisons.

### 3.2 Tâches
- Tâches hebdomadaires : semis, plantation, désherbage, palissage, irrigation, récolte… (types paramétrables).
- **Génération automatique** des tâches de semis et plantation depuis le plan de culture, avec calcul des quantités de semences et du nombre de caisses/plaques à semer en pépinière.
- **Itinéraires techniques** : modèles de suites de tâches réutilisables, affectables à des séries.
- Filtres : type, famille/espèce/variété, état (en retard / à faire / terminé).
- Impression de la feuille de tâches de la semaine.

### 3.3 Assolement et rotations
- Parcellaire : jardins → planches (longueur, largeur, abri ou plein champ).
- Placement des séries sur les planches (glisser-déposer sur PC, sélection tactile sur mobile).
- Historique des cultures par planche pour respecter les rotations (alerte si même famille trop récente).
- Filtre « emplacements disponibles » pour une série donnée.
- Impression du plan d'assolement.

### 3.4 Commandes de semences et plants
- Génération automatique des listes de semences/plants à commander depuis le plan.
- Filtres : espèce, variété, fournisseur ; option « uniquement les séries placées sur l'assolement ».
- Période : année, semestre, trimestre.
- Impression et **export CSV**.

### 3.5 Suivi et analyse
- Récoltes : saisie des quantités par série ; calcul automatique des rendements par série et par espèce.
- Notes et photos associées aux séries.
- Temps de travail par tâche.
- Graphiques et statistiques : rendements, temps de travail, écart prévisionnel/réalisé.

### 3.6 Collaboration et compte
- Espace par ferme, multi-utilisateurs.
- Rôles et droits : propriétaire, chef·fe de culture, membre de l'équipe (lecture seule ou saisie limitée).
- Invitation par courriel.
- Export complet des données de la ferme (auto-service, à tout moment).

### 3.7 Paramétrage
- Familles, espèces, variétés, types de tâches, fournisseurs, unités, étiquettes.
- Langues : anglais (langue de développement) et français au minimum ; architecture prête pour l'espagnol et le néerlandais.

### 3.8 Hors périmètre (V1)
- Comptabilité et facturation.
- Vente / gestion de paniers (AMAP).
- Météo, capteurs, IoT.
- Cartographie GPS des parcelles (possible en V2).

---

## 4. Stack technique de Brinjel (existant)

Informations issues du site officiel et du dépôt public. Les éléments marqués *(déduit)* sont des inférences fortes mais non confirmées par le README (accès bloqué par une protection anti-bot).

| Couche | Technologie | Source |
|---|---|---|
| Langage back-end | **Elixir** (sur la machine virtuelle BEAM/Erlang) | Site officiel (FAQ « fiabilité ») |
| Framework web | **Phoenix** + **Phoenix LiveView** *(déduit — stack standard Elixir pour une app web interactive)* | Inférence |
| Base de données | **PostgreSQL** via Ecto *(déduit — défaut Phoenix)* | Inférence |
| Front-end | HTML rendu serveur, CSS léger, JS minimal (approche écoconception) | Site officiel |
| Site vitrine | **Astro** (v6) | Balises meta du site |
| Hébergement | Serveurs en Allemagne, sauvegardes chiffrées répliquées en Europe, photos sur stockage objet dans une autre zone | Site officiel |
| Traductions | Weblate | Badges du dépôt |
| Forge | GitLab (Framagit), CI avec couverture de tests | Dépôt |
| Licence | AGPL v3, conformité REUSE | Dépôt |
| Supervision | Page d'état publique (status.brinjel.com), disponibilité ≈ 99,99 % | Site officiel |

**Approche multi-support de Brinjel :** application web unique, responsive, sans application native. Le choix de LiveView (rendu serveur, pages légères) répond explicitement à l'objectif de fonctionner sur des appareils anciens.

---

## 5. Exploitation du code source existant

Le dépôt Elixir sert de **spécification exécutable**. Avant d'écrire une ligne de la nouvelle appli, l'équipe réalise une phase d'extraction (lot 0) :

| Où regarder dans le dépôt | Ce qu'on en tire | Réutilisation |
|---|---|---|
| `priv/repo/migrations/` et `lib/*/schemas` (Ecto) | Modèle de données complet, contraintes, index | Traduire en schéma Prisma/Drizzle — quasi 1:1 |
| `lib/brinjel/` (contextes Phoenix) | Règles métier : génération des tâches, calcul des quantités de semences et caisses, rendements, rotations, disponibilité des planches | Porter les algorithmes en TypeScript, avec les mêmes tests |
| `test/` | Cas de test métier, valeurs attendues | Convertir en tests Vitest pour garantir l'iso-fonctionnalité |
| `lib/*_web/live/` (LiveViews) | Parcours utilisateurs, filtres, actions par lot, écrans d'impression | Base des maquettes ; à repenser pour mobile |
| `priv/gettext/` | Traductions fr/en complètes | Reprendre les fichiers .po → JSON i18next |
| `priv/repo/seeds` | Référentiel de départ (familles, espèces, types de tâches, unités) | Importer tel quel |
| `CHANGELOG.md`, issues Framagit | Historique des choix, demandes récurrentes des utilisateurs | Priorisation du backlog |

**Obligations AGPL :** conserver les en-têtes de copyright « André Hoarau » sur tout fichier repris ou traduit, mentionner Brinjel dans le README et les crédits de l'appli, publier le dépôt sous AGPLv3 avant la mise en ligne du service. Appliquer la convention REUSE (SPDX) comme le fait Brinjel.

**Accès au dépôt :** Framagit protège le site par un défi JavaScript ; cloner en ligne de commande fonctionne normalement (`git clone https://framagit.org/brinjel/brinjel.git`).

---

## 6. Stack retenue

| Couche | Choix | Justification |
|---|---|---|
| Front-end | **React 19 + TypeScript**, Vite, TanStack Router/Query | Écosystème large, responsive natif, PWA facile |
| UI | Tailwind CSS + composants headless (Radix / shadcn) | Accessible, léger, adaptable mobile/desktop |
| Gantt / assolement | Bibliothèque SVG maison ou **visx / D3** | Contrôle fin, performance sur mobile |
| Hors ligne | **PWA** : service worker + IndexedDB (Dexie) + synchronisation différée | Usage au champ sans réseau |
| Back-end | **Node.js (NestJS ou Fastify) en TypeScript** *ou* Python (FastAPI / Django) | Un seul langage full-stack avec Node ; Django si l'équipe est Python |
| API | REST + OpenAPI (ou tRPC si full TypeScript) | Documentation générée, client typé |
| Base de données | **PostgreSQL 16** | Relationnel, contraintes, JSONB pour les étiquettes |
| ORM | Prisma ou Drizzle (Node) / Django ORM | Migrations versionnées |
| Fichiers/photos | Stockage objet S3-compatible (Scaleway, OVH, Hetzner) | Hébergement UE, redimensionnement à l'upload |
| Auth | Sessions + mots de passe hachés (Argon2), TOTP optionnel, invitations par jeton | Simplicité, RGPD |
| Tâches de fond | BullMQ (Node) / Celery (Python) + Redis | Exports, courriels, génération de tâches |
| i18n | i18next (front) + fichiers JSON, Weblate | Traduction communautaire |
| Tests | Vitest + Playwright (E2E mobile et desktop) | Couverture des deux formats |
| CI/CD | GitLab CI ou GitHub Actions, Docker | Déploiement reproductible |
| Hébergement | VPS/Kubernetes en UE (Hetzner, Scaleway, OVH) | Souveraineté des données |
| Supervision | Uptime Kuma / Better Stack + Sentry | Page d'état publique |

**Alternative native (non recommandée en V1) :** Capacitor pour empaqueter la PWA en app iOS/Android si une présence sur les stores devient nécessaire ; ou Flutter/React Native si des fonctions natives (caméra avancée, notifications push riches) sont exigées.

---

## 7. Exigences multi-support

### 7.1 Principes
- **Responsive « mobile-first »** : une seule base de code, points de rupture 360 px / 768 px / 1024 px / 1440 px.
- **PWA installable** sur Android, iOS et desktop (Chrome, Edge, Safari).
- Fonctionnement acceptable sur un smartphone milieu de gamme de 2020 et sur une connexion 3G.

### 7.2 Adaptation des écrans clés

| Écran | Smartphone | PC |
|---|---|---|
| Plan de culture | Liste en cartes, filtres en tiroir, édition plein écran | Tableau dense multi-colonnes, édition en ligne, Gantt côte à côte |
| Gantt | Défilement horizontal, zoom pincé, une saison | Vue multi-saisons, glisser-déposer des barres |
| Tâches de la semaine | Vue par défaut, cases à cocher larges, filtres rapides | Tableau avec colonnes, impression |
| Assolement | Liste des planches + sélection tactile | Plan 2D avec glisser-déposer |
| Récoltes / notes / photos | Saisie rapide, appareil photo intégré | Formulaires complets |
| Statistiques | Graphiques empilés, un par écran | Tableau de bord multi-graphiques |

### 7.3 Ergonomie terrain
- Cibles tactiles ≥ 44 px, contrastes élevés (WCAG AA), mode sombre.
- Saisie rapide des récoltes et validation des tâches en deux touches maximum.
- Prise de photo directe depuis l'app, compression côté client.
- Mode hors ligne : lecture des tâches de la semaine et de l'assolement, saisie des récoltes/notes/tâches réalisées avec synchronisation au retour du réseau.

---

## 8. Exigences non fonctionnelles

- **Performance :** premier affichage < 2 s en 3G, pages < 300 ko hors images (écoconception).
- **Données et RGPD :** hébergement UE, aucun tiers analytique, pas d'utilisation des données pour l'IA, export complet en auto-service, suppression de compte.
- **Sécurité :** HTTPS, CSP, protection CSRF, hachage Argon2, journal des accès, sauvegardes chiffrées plusieurs fois par jour dans au moins deux centres de données.
- **Disponibilité :** objectif 99,9 %, page d'état publique, fenêtres de maintenance < 1 h.
- **Accessibilité :** navigation clavier, lecteurs d'écran sur les parcours principaux.
- **Impression :** feuilles de style dédiées (tâches, assolement, commandes) et export PDF.
- **Multilinguisme :** fr et en dès la V1, dates et unités localisées.

---

## 9. Modèle de données (schéma simplifié)

```
Farm ──< User (via Membership: role)
Farm ──< Family ──< Species ──< Variety ──< Supplier
Farm ──< Garden ──< Bed (length, width, sheltered)
Farm ──< Series (species, variety, dates, bed_length, spacing, yield, price, method, tags[])
Series ──< Placement (bed, start, end)      → historique par planche
Series ──< Task (type, date, status, duration, generated_from_protocol?)
Series ──< Harvest (date, quantity, unit)
Series ──< Note (text, photos[])
Farm ──< Protocol (itinéraire technique) ──< ProtocolStep (task_type, offset)
Farm ──< TaskType, Unit, Tag
```

---

## 10. Lots et planning indicatif

| Lot | Contenu | Durée estimée |
|---|---|---|
| 0 | Extraction depuis le code Elixir (modèle, règles métier, tests, traductions), maquettes mobile + desktop, mise en place CI | 4 semaines |
| 1 | Authentification, fermes, membres, référentiel (familles/espèces/variétés), parcellaire | 4 semaines |
| 2 | Séries : CRUD, filtres, traitement par lot, Gantt | 6 semaines |
| 3 | Tâches, itinéraires techniques, génération automatique, impression | 5 semaines |
| 4 | Assolement, rotations, emplacements disponibles | 5 semaines |
| 5 | Commandes, export CSV, récoltes, notes/photos | 4 semaines |
| 6 | Statistiques, PWA hors ligne, i18n, accessibilité, tests E2E | 5 semaines |
| 7 | Bêta avec 5–10 fermes pilotes, corrections, mise en production | 4 semaines |

**Total indicatif : ~9 mois** pour une équipe de 2 développeur·euses full-stack + 1 designer UX à mi-temps. Une personne lisant l'Elixir (même sans le pratiquer) est indispensable au lot 0.

---

## 11. Livrables attendus

- Code source versionné avec README d'installation et Docker Compose de développement.
- Documentation utilisateur (fr/en) et documentation d'API.
- Maquettes Figma mobile et desktop validées.
- Jeux de tests automatisés (unitaires, intégration, E2E mobile et desktop).
- Procédures de sauvegarde/restauration et de déploiement.
- Page d'état et supervision opérationnelles.

---

## 12. Identité

- **Nom :** Sillon (la ligne tracée avant de semer). Signature : « Sillon — planification maraîchère libre ».
- **Domaines à réserver :** sillon.app (principal), sillon.farm ; sous-domaines app., docs., status.
- **Marque :** vérifier la disponibilité sur data.inpi.fr et EUIPO en classes 9 et 42, puis déposer. Attention au magazine « Le Sillon » (John Deere) : secteur agricole, mais classes différentes.
- **Dépôt de code :** `sillon/sillon`, paquet npm `@sillon/core`.

---

## 13. Points à trancher avant lancement

1. Modèle économique : SaaS payant (comme Brinjel), gratuit, ou auto-hébergeable ?
2. Niveau de mode hors ligne attendu en V1 (lecture seule ou saisie différée) ?
3. Présence sur les stores (App Store / Play Store) dès la V1 ou PWA uniquement ?
4. Langues cibles au-delà du français et de l'anglais ?

---

## Sources

- Site officiel : https://brinjel.com/fr/
- Code source : https://framagit.org/brinjel/brinjel
- Documentation : https://docs.brinjel.com
- Cas d'usage Elixir cités par Brinjel : https://elixir-lang.org/cases.html
