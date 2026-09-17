# Brief — Abonnements, centres de formation, hébergement

_Trois modèles économiques, un paiement européen, et de quoi essayer sans payer_

_17 septembre 2026_

---

## 1. Ce que le schéma décide déjà

Les tables sont là depuis le portage de Brinjel, et elles portent trois décisions qu'il
serait coûteux de défaire.

**Sillon ne calcule pas la facturation, il la reflète.** Tous les champs de `Subscription`
sont des `provider*`, et `lastEventOccurredAt` trahit l'intention : consommer des webhooks
de façon **idempotente**, en ignorant tout événement antérieur au dernier vu. Pas de
prorata, pas de TVA, pas de factures, pas de relances — tout cela reste chez le prestataire.

**Le verrou existe et ne sert à rien.** `Farm.trialExpiryDate` est écrit à la création d'une
ferme (`farm-setup.ts`) et **relu nulle part** ; `Farm.locked` n'est touché par aucune ligne.
Le mécanisme est en place, inerte.

**Tout est une ferme.** Un centre de formation _est_ une ferme avec des attributs en plus ;
une ferme d'apprenant _est_ une ferme rattachée à un centre. `StudentFarm` n'a d'ailleurs pas
de date d'expiration : elle réutilise `trialExpiryDate`, dont le centre fixe la durée. Un
apprenant est donc, techniquement, un essai dont un tiers tient l'échéance.

---

## 2. Trois modèles, et ce qu'ils imposent au code

Sillon doit servir les trois : **auto-hébergement**, **gratuit**, **SaaS payant**. Ce n'est
pas un compromis mais une contrainte de licence : l'AGPL garantit que le projet sera
auto-hébergé, que le service existe ou non.

La conséquence est architecturale. **La facturation est une propriété d'un déploiement, pas
du produit.** L'intégrer au cœur ferait porter à chaque auto-hébergeur du code mort et une
dépendance dont il n'a que faire.

### L'accès : une question, trois réponses

L'application pose **une seule question** — _cette ferme peut-elle écrire ?_ — et la réponse
vient d'une politique interchangeable :

| Politique    | Réponse                        | Pour qui                                         |
| ------------ | ------------------------------ | ------------------------------------------------ |
| `ouverte`    | toujours oui                   | **défaut** — auto-hébergement, lycée, associatif |
| `essai`      | oui jusqu'à `trialExpiryDate`  | démonstration, formation                         |
| `abonnement` | selon le miroir du prestataire | le SaaS                                          |

C'est le motif employé deux fois dans ce projet : `Mailer` (console par défaut, SMTP si
configuré) et `PhotoStorage` (disque par défaut, S3 si configuré). **Sans variable
d'environnement, rien ne change et rien ne sort de la machine** — le code de facturation
n'est même pas chargé.

### Ce qui se passe à l'expiration

**Jamais d'accès refusé.** Une ferme dont l'abonnement lapse passe en **lecture seule,
export compris**. Trois raisons : c'est une saison entière de travail, l'export RGPD en
libre-service est promis par le brief du projet, et couper l'accès aux données de quelqu'un
pour un défaut de paiement est le meilleur moyen de se faire détester.

`Farm.locked` garde alors le sens qu'il doit avoir : la suspension administrative, rare et
manuelle.

---

## 3. L'encaissement : une échéance réglementaire décide à notre place

### La facturation électronique, et ce qu'elle interdit

| Échéance               | Qui                                         | Quoi                                    |
| ---------------------- | ------------------------------------------- | --------------------------------------- |
| **1ᵉʳ septembre 2026** | toutes les entreprises assujetties à la TVA | **recevoir** des factures électroniques |
| **Septembre 2027**     | TPE, PME, micro-entreprises                 | **émettre** des factures électroniques  |

« Facture électronique » ne veut pas dire PDF : il faut un format **structuré** — Factur-X,
UBL ou CII — transmis par une **Plateforme Agréée** certifiée par l'administration. Un PDF
envoyé par courriel ne sera plus conforme.

**Conséquence : Sillon n'écrira jamais de facturation.** Dans un an il faudrait émettre du
Factur-X via une plateforme agréée ; ce n'est pas le métier d'un logiciel de planification
maraîchère, et ce serait une dette permanente pour un projet qui vise d'abord l'usage au
champ.

### Le paysage, et pourquoi on n'en prend rien

| Approche                 | Qui                               | Ce qu'on obtient                                                   | Ce qu'il reste à écrire             |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Plateforme complète      | Stripe Billing (US)               | catalogue, portail hébergé, factures, prorata, TVA, SEPA et cartes | presque rien                        |
| Vendeur de référence     | Paddle (UK)                       | idem, plus la TVA déclarée                                         | rien                                |
| Moteur de prélèvement UE | Mollie (NL)                       | mandats et prélèvements                                            | portail, factures, catalogue        |
| Spécialiste SEPA         | SlimPay (FR), GoCardless (UK)     | mandats SEPA, ~1 % plafonné à 2 €                                  | portail, factures, cartes           |
| **Aucun prestataire**    | **outil de facturation français** | **factures conformes et prélèvement SEPA**                         | **la logique d'abonnement, minime** |

Mollie, d'abord retenu, est un **moteur de prélèvement et non une plateforme de
facturation** : pas de catalogue, pas de prorata, pas de factures, **pas de portail client**.
Tout cela resterait à écrire — au moment même où la réforme interdit d'écrire des factures
soi-même.

### Le choix : pas de prestataire de paiement dans le code

Un outil de facturation agréé sera **de toute façon nécessaire** d'ici septembre 2027. Or
les outils français du marché émettent déjà des **factures récurrentes conformes** et
encaissent par **prélèvement SEPA**. Autrement dit : **l'outil de facturation est le moteur
d'abonnement**, et Sillon n'intègre rien.

La politique `abonnement` lit alors un état simple — _cette ferme est à jour jusqu'au 31
mars 2027_ — posé à la main au début, puis par une synchronisation si le volume le justifie.
Trois bénéfices :

- **la facturation reste hors du produit**, ce qui est le principe de la section 2 ;
- **rien à intégrer, rien à maintenir** : aucune clé d'API, aucun webhook, aucune dépendance
  dans un dépôt AGPL que d'autres auto-hébergeront ;
- **le coût est celui de l'outil comptable** qu'il faudra payer de toute manière.

Pour dix à cinquante fermes, c'est amplement suffisant. Si un prélèvement automatisé est
souhaité avant que le volume ne le justifie, **SlimPay** est l'équivalent français de
GoCardless et garde tout en France.

### Quand rouvrir la question

Le jour où Sillon devient du libre-service à l'échelle : des centaines d'inscriptions,
paiement par carte, activation immédiate sans intervention humaine. **Stripe Billing**
deviendrait alors difficile à battre — au prix de la contrainte européenne. C'est un
arbitrage à refaire à ce moment-là, pas avant.

---

## 4. Les centres de formation

Indépendant du paiement, réalisable aujourd'hui, et visant un public que le brief du projet
nomme (§2 : « Formateur / apprenant — lycée agricole, CFPPA ») : des établissements publics,
terrain naturel pour de l'AGPL.

### Le parcours

1. une ferme est marquée **centre de formation**, avec une ou **plusieurs fermes modèles** ;
2. le formateur engendre N **fermes d'apprenants** par duplication d'un modèle ;
3. chacun travaille dans la sienne, avec ses erreurs et ses résultats ;
4. à l'échéance (`defaultTrainingDuration`, un an par défaut), la formation s'achève.

### Trois partis pris

**Le formateur voit tout, par une adhésion ordinaire.** Créer une ferme d'apprenant crée une
`FarmMembership` du formateur dessus, au rôle `manager` : il voit le travail en cours, peut
corriger, et **l'apprenant le voit dans la liste de son équipe**. Pas de porte dérobée, pas
de privilège caché — la matrice de droits existante suffit, et l'apprenant sait qui le lit.

**Plusieurs modèles par centre.** Une ferme modèle par promotion, par module ou par niveau.
`TrainingCenter.defaultTemplateFarmId` reste le modèle proposé par défaut ; une table de
liaison porte les autres. Rien à défaire dans l'existant.

**À l'échéance, l'apprenant garde sa ferme.** Elle redevient une ferme personnelle ordinaire
dont il est propriétaire, au lieu d'être supprimée. Un apprenti qui s'installe repart avec
son plan de culture — c'est décent, et c'est le meilleur canal d'adoption imaginable.

### Ce que ça demande au code

La duplication d'une ferme est le gros morceau : référentiel, parcellaire, séries, dates,
itinéraires. C'est l'inverse de l'export (#16), qui sait déjà lire une ferme entière table
par table — **la liste `EXPORT_TABLES` est la même**, et c'est elle qui dit quoi copier.

---

## 5. Hébergement

### Ce dont Sillon a besoin

| Composant      | Exigence                                                             | Si absent                             |
| -------------- | -------------------------------------------------------------------- | ------------------------------------- |
| PostgreSQL 16  | extensions `citext`, `unaccent`, `ltree` ; rôle non superutilisateur | rien ne marche                        |
| API Node 22    | un processus                                                         | rien ne marche                        |
| Interface      | fichiers statiques                                                   | rien ne marche                        |
| Redis          | file des courriels                                                   | **envoi direct** — dégradé, pas cassé |
| Stockage objet | photos                                                               | **disque local** — perdu si éphémère  |
| Worker         | vide la file                                                         | inutile sans Redis                    |

**Une bonne nouvelle vérifiée** : les migrations posent `FORCE ROW LEVEL SECURITY`, donc
l'isolation par ferme tient **même face au propriétaire des tables**. Sillon fonctionne donc
sur un PostgreSQL géré où l'on ne dispose que d'un seul rôle — ce qui est le cas de toutes
les offres gérées. Seul un superutilisateur contournerait la RLS, et aucun hébergeur n'en
donne.

**Les deux replis rendent l'hébergement gratuit possible.** Sans Redis et sans S3, Sillon
tourne : les courriels partent dans la requête, les photos sur le disque. Ce sont exactement
les dégradations acceptables pour une démonstration.

### Trois étages, tous européens

**Étage 1 — essayer gratuitement, aujourd'hui.**
[Koyeb](https://www.koyeb.com/) (société française, région **Francfort**) : palier gratuit
permanent, un service web de 512 Mo et un PostgreSQL de 1 Go. La base n'a que **5 heures de
calcul par mois** et s'endort : parfait pour montrer l'application, insuffisant pour une
ferme qui s'en sert. Zéro euro, une demi-heure de mise en route.
Variante : base sur [Clever Cloud](https://www.clever-cloud.com/) (Paris, palier gratuit
256 Mo, **5 connexions** — pensez à `?connection_limit=3` dans l'URL Prisma).

**Étage 2 — une vraie bêta avec des fermes pilotes.**
Un VPS à 4–5 € par mois, [Hetzner](https://www.hetzner.com/) (Allemagne) ou
[Scaleway](https://www.scaleway.com/) (France), et le `docker-compose.yml` **que le dépôt
livre déjà** : base, Redis, API, worker, interface. Tout fonctionne, y compris ce que les
paliers gratuits ne permettent pas. C'est la configuration pour laquelle Sillon est bâti, et
l'honnêteté commande de le dire : les paliers gratuits coûtent plus d'efforts que 5 € par
mois n'en épargnent.

**Étage 3 — le SaaS.**
Scaleway, entièrement en France : PostgreSQL géré, Object Storage pour les photos,
conteneurs pour l'API et le worker. Pas de palier gratuit permanent, mais des prix d'entrée
bas et 750 Go d'Object Storage offerts 90 jours pour démarrer.

### Ce qu'il manque au dépôt pour l'étage 1

Trois petites choses, une demi-journée :

- servir l'interface **depuis l'API** en option, pour ne consommer qu'un service ;
- une variable `DATABASE_CONNECTION_LIMIT`, les paliers gratuits plafonnant les connexions ;
- une notice de déploiement dans le README.

---

## 6. Découpage proposé

| Lot                          | Contenu                                                                             | Dépend de |
| ---------------------------- | ----------------------------------------------------------------------------------- | --------- |
| **1 — Le verrou vivant**     | politique d'accès (`ouverte` par défaut), lecture seule à l'expiration, essais      | rien      |
| **2 — Centres de formation** | duplication d'une ferme, modèles multiples, fermes d'apprenants, adhésion formateur | lot 1     |
| **3 — Déploiement d'essai**  | interface servie par l'API, limite de connexions, notice                            | rien      |
| **4 — Abonnements**          | politique `abonnement` lisant une échéance, écran d'administration                  | lot 1     |

**Aucun lot n'attend plus de compte à ouvrir.** Le lot 4, qui devait intégrer un
prestataire, se réduit à lire une échéance et à l'administrer : une journée, pas trois
semaines.

---

## 7. Ce qui reste à trancher

1. **Le rôle du formateur** sur une ferme d'apprenant : `manager` (il corrige) ou
   `consultant` (il lit seulement) ? Le brief retient `manager`, à confirmer.
2. **Le prix**, et son unité : par ferme, par personne, par hectare ? Le schéma suppose un
   abonnement par ferme.
3. **La durée de l'essai** : `farm-setup.ts` fixe une valeur aujourd'hui inutilisée.
4. **Le centre paie-t-il pour ses apprenants**, ou les fermes d'apprenants sont-elles
   toujours gratuites ?
5. **L'outil de facturation** : lequel, et à partir de quand ? Il faudra qu'il soit agréé
   avant septembre 2027, et il vaut mieux le choisir avant d'avoir des clients.
