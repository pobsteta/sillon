# Brief — Références microfermes, benchmark et scénarios dans Sillon

## Contexte

Sillon (`github.com/pobsteta/sillon`) est une réécriture de Brinjel en React 19 + TypeScript + Node + PostgreSQL 16 (extensions `citext`, `unaccent`, `ltree`), monorepo npm (`apps/api`, `apps/web`, `packages/core` publié comme `@sillon/core`). Isolation multi-fermes par `farm_id` **et** Row-Level Security ; l'API se connecte sous un rôle ordinaire (`sillon_app`), jamais superutilisateur. Convention REUSE/SPDX : les fichiers dérivés de Brinjel gardent le copyright d'André Hoarau (AGPL-3.0-or-later).

Avant de coder, lis `README.md`, la section « Ce qui reste à faire », le schéma SQL / les migrations, et les modules existants `series`, `referentiel`, `statistiques`. Réutilise leurs conventions (nommage, validation, i18n fr/en, tests) plutôt que d'en introduire de nouvelles.

## Objectif

Donner à Sillon des **valeurs de référence issues de la recherche française sur les microfermes maraîchères** (thèse Kevin Morel 2016, AgroParisTech/INRA ; projet Casdar MMBio 2019-2023, ITAB) pour :

1. pré-remplir le référentiel (rendement attendu, temps de travail par culture) quand la ferme n'a pas encore d'historique ;
2. situer les résultats de la ferme par rapport à ces références (benchmark) ;
3. simuler des scénarios revenu × temps de travail inspirés du modèle de Morel.

Principe directeur : **les références ne remplacent jamais les données de la ferme**. Elles s'affichent comme repère sourcé, la valeur ferme les écrase dès qu'elle existe.

## Périmètre — 4 lots, à livrer dans l'ordre, une PR par lot

### Lot 0 — Jeu de données de références

- Créer `packages/core/data/references/` avec un fichier par source :
  - `morel-2016.json` — issu de la thèse *Viabilité des microfermes maraîchères biologiques* (HAL : `tel-02801554v2`) et de sa synthèse praticiens.
  - `mmbio-2023.json` — uniquement les **agrégats publiés** du projet MMBio (ITAB). Ne pas inventer de valeurs : si une donnée n'est pas publique, ne pas la mettre.
- Schéma d'une entrée (à valider avec un schéma Zod dans `@sillon/core`) :

```json
{
  "source_id": "morel-2016",
  "crop_key": "carotte",
  "context": { "abri": false, "systeme": "bio-intensif|permaculture|mixte|tous" },
  "yield_kg_m2": { "low": 2.5, "median": 4.0, "high": 6.0 },
  "labor_h_100m2": { "low": 20, "median": 35, "high": 55 },
  "price_eur_kg": { "median": 2.8 },
  "n": 12,
  "page_ref": "thèse p. 214, tableau 5.3",
  "notes": ""
}
```

- Une table de correspondance `crop_key` → espèce du référentiel Sillon, avec fallback manuel côté UI quand la correspondance est ambiguë.
- Chaque fichier porte un en-tête `sources` (titre, auteurs, année, URL, licence/conditions de réutilisation). Les données sont des faits chiffrés, mais on cite systématiquement.
- Les fichiers JSON sont fournis (je les livre séparément) : le lot 0 consiste à écrire le schéma, le chargeur et les tests, pas à saisir les chiffres.

### Lot A — Références dans le référentiel

- Migration : table `reference_values` (globale, **hors** RLS par ferme puisque partagée en lecture ; écriture réservée à un rôle admin ou au seed). Colonnes : `id`, `source_id`, `species_id` nullable, `crop_key`, `context jsonb`, `yield_kg_m2 jsonb`, `labor_h_100m2 jsonb`, `price_eur_kg jsonb`, `n`, `page_ref`, `notes`.
- Seed idempotent depuis les JSON du lot 0 (`npm run db:seed:references`).
- Dans le référentiel espèces/variétés : si `rendement_attendu` ou `temps_travail` est vide, proposer la médiane de référence **comme suggestion** (champ pré-rempli grisé + badge « réf. Morel 2016 »), jamais comme valeur enregistrée silencieusement. L'utilisateur accepte ou saisit la sienne.
- Le calcul de « rendement et produit escomptés » d'une série utilise, dans l'ordre : valeur variété → valeur espèce → référence (médiane, avec indicateur visible qu'il s'agit d'une référence).
- Endpoint `GET /references?species_id=&context=` documenté dans l'OpenAPI existant.

### Lot B — Benchmark dans les statistiques

- Nouvel onglet « Repères » dans le module statistiques, par campagne :
  - par culture : rendement réalisé kg/m² vs fourchette de référence (low/median/high), temps de travail h/100 m² vs référence, produit €/m² vs référence ;
  - global ferme : surface cultivée, part sous abri, produit/m², h/semaine — comparés aux ordres de grandeur MMBio (médiane 6 700 m² dont ~15 % sous abri).
- Rendu : barres horizontales avec la fourchette de référence en fond et la valeur ferme en marqueur ; couleur neutre, pas de « bon/mauvais ». Un tooltip donne la source et `n`.
- Respecter le mode sombre, les cibles tactiles ≥ 44 px et une feuille d'impression.
- Aucune donnée ferme ne sort de la ferme : le benchmark est un calcul local, pas une agrégation inter-fermes.

### Lot C — Scénarios revenu × temps de travail

- Nouveau module `scenarios` (table `scenarios` sous RLS `farm_id`).
- Un scénario = un jeu de paramètres : surface, part abri, hypothèse de rendement (low/median/high), prix (référence ou grille ferme), h/semaine max, charges fixes annuelles, investissement, objectif de revenu net mensuel.
- Six profils prédéfinis reprenant les six objectifs de vie de Morel (combinaisons revenu cible × temps de travail cible) ; l'utilisateur peut les modifier ou en créer.
- Calcul dans `@sillon/core` (pur, testable) : produit brut, charges, revenu net, heures totales et heures/semaine en pleine saison, probabilité rudimentaire d'atteindre l'objectif par tirage Monte-Carlo sur les fourchettes low/high (N=1000, seed fixé pour les tests).
- Écran : tableau comparatif des scénarios + graphe revenu/temps. Bouton « Créer les séries depuis ce scénario » **hors périmètre** pour l'instant, à noter dans « reste à faire ».

## Contraintes transversales

- TypeScript strict, pas de `any`. Validation Zod côté API et côté core.
- Tests : unitaires sur le core (calculs, chargeur, correspondance des cultures), intégration API sur `sillon_test`, un test RLS prouvant qu'une ferme ne voit pas les scénarios d'une autre.
- i18n : toute chaîne en fr **et** en. Les libellés de sources restent en français (titres d'ouvrages).
- Migrations réversibles, nommées selon la convention existante.
- Mettre à jour `README.md` (tableau « Ce qui fonctionne ») et la doc OpenAPI.
- En-têtes SPDX sur tout nouveau fichier ; ne pas modifier les en-têtes des fichiers dérivés de Brinjel.
- PWA : les références font partie du cache de lecture ; les scénarios passent par la file hors ligne existante.

## Critères d'acceptation

- [ ] Une ferme vide voit, à la création d'une série de carottes plein champ, une suggestion de rendement sourcée « Morel 2016 » qu'elle peut accepter ou remplacer.
- [ ] Après saisie d'un rendement réalisé, l'onglet « Repères » place la ferme dans la fourchette de référence avec la source au survol.
- [ ] Les six profils Morel sont créables en un clic et produisent revenu net, h/semaine et probabilité d'atteinte de l'objectif.
- [ ] `npm test` passe, y compris le test RLS sur `scenarios`.
- [ ] Aucune valeur de référence n'est enregistrée dans les tables de la ferme sans action explicite de l'utilisateur.

## Hors périmètre

- Agrégation ou partage de données entre fermes.
- Import automatique de données MMBio non publiées.
- Génération de séries depuis un scénario.

## Questions à trancher avant de commencer (répondre dans la PR du lot 0)

1. Unité pivot pour le temps de travail : h/100 m² ou h/planche standard (la ferme définit la longueur de planche) ?
2. Les références doivent-elles être versionnées (nouvelle édition de MMBio) ou écrasées au seed ?
3. Où vit la correspondance `crop_key` → espèce : dans le JSON ou dans une table éditable par l'admin ?

---

## Journal de réalisation — 20 septembre 2026

Lots 0 et A livrés. Ce qui suit consigne les écarts au brief : chacun vient d'un fait
constaté, et aucun n'a été décidé à la légère.

### Les sources, et ce que leurs licences autorisent

| Source | Licence | Verdict |
| --- | --- | --- |
| Thèse Morel 2016 | **CC BY-NC-ND 4.0** (page de garde du PDF HAL) | **écartée** |
| MMBio (ITAB) | non vérifiée | en attente |
| **Pépinière-Mesclun** — Morel (INRAE), 2023, [DOI 10.57745/IQVM2I](https://doi.org/10.57745/IQVM2I) | **Licence Ouverte Etalab 2.0** (`etalab-2.0`, relevée par l'API de l'entrepôt) | **retenue** |

La thèse est écartée pour deux raisons qui se cumulent. La clause **NC** contredit la
promesse de l'AGPL — exécuter le programme pour tout usage, y compris commercial : la
porter dans le dépôt ferait subir à chaque personne qui installe Sillon une restriction
qu'elle n'a pas choisie, exactement comme la licence Hippocratic de `react-leaflet`
(cf. `Carte.tsx`). La clause **ND** vise par ailleurs ce que le lot 0 ferait : la thèse ne
publie pas de rendements mais les **coefficients d'un modèle** (tableau 5.A.2, p. 333) ;
en tirer des kg/m², c'est faire tourner le modèle de l'auteur, donc produire une œuvre
dérivée. Les PDF lus sont dans `.gitignore`.

Pépinière-Mesclun est du même auteur, publiée sous licence ouverte, et porte ce qui
manquait : **108 entrées sur 54 cultures**, rendements en conduite biologique et
conventionnelle, prix en circuit court, en fourchettes basse / défaut / haute.

### Écarts au périmètre décrit

1. **Pas de `species_id` dans `reference_values`.** Les espèces de Sillon sont *par ferme* ;
   une table globale qui les référencerait pointerait d'une ferme vers une autre, ce que la
   RLS interdit. Le rapprochement passe par `crop_key`, et c'est l'API qui traduit.
2. **Les colonnes portent leur unité** — `yield_milli_kg_m2`, `labor_seconds_100m2`,
   `price_cents_kg`. Le dépôt stocke des entiers ; une colonne nommée `yield_kg_m2`
   contenant 3700 pour 3,7 kg/m² aurait été le piège le plus sûr de tout ce lot.
3. **`n` est facultatif.** Une enquête a un effectif, une base compilée depuis la
   bibliographie n'en a pas. L'exiger aurait obligé à en inventer un.
4. **La cascade est « série → référence », et non « variété → espèce → référence ».**
   `Crop` et `Variety` ne portent ni rendement ni prix : seule la série en a. Étendre le
   référentiel est l'objet de `specs/brief-donnees-mesclun.md` §7.3, dont le point bloquant
   — la licence — est désormais levé par le même DOI.
5. **`GET /references` est sous `/farms/:farmId`**, pour la raison du point 1.
6. **Le contexte accepte `null`.** `abri` et `conduite` peuvent valoir « la source ne
   distingue pas ». Mettre `false` par défaut prêterait à un agrégat tous contextes
   confondus une précision qu'il n'a pas.

### Réponses aux trois questions du brief

1. **Unité pivot du temps de travail** : h/100 m². Une « planche standard » varie d'une
   ferme à l'autre ; les références cesseraient d'être comparables. *Sans objet pour
   l'instant : aucune source retenue ne publie de temps de travail.*
2. **Versionnement** : par `source_id`. `mesclun-2023` et un futur `mesclun-2027`
   cohabitent ; le seed remplace source par source, sans écraser les autres.
3. **Correspondance `crop_key` → espèce** : dans le noyau (`CROP_KEYS`), commune à toutes
   les sources. Elle est **plusieurs-vers-une** — les sources séparent ce que Sillon réunit
   — et volontairement incomplète : ce qu'elle ne sait pas rattacher reste non rattaché,
   pour que l'interface le propose plutôt que le code le devine.

### Ce qui reste

- Le rattachement manuel d'une espèce à une `crop_key`, côté interface.
- Le lot B (onglet « Repères ») est amputé : sans temps de travail, la moitié des
  comparaisons annoncées n'a pas de référence à afficher.
- Le lot C (scénarios) reposait sur les six objectifs de vie de Morel, dont la source est
  écartée. Les ordres de grandeur diffusés publiquement par l'INRAE (600 à 1 400 €/mois,
  1 800 h ou 2 500 h/an) restent citables, mais ce sont des repères de **ferme**, que le
  schéma actuel — par culture — n'accueille pas.
