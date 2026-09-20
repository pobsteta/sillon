# Brief — Jardiner avec la lune

_Proposition d'intégration d'un calendrier lunaire à Sillon_

_17 septembre 2026_

---

## 1. Pourquoi, et ce que Sillon n'affirmera pas

Le calendrier lunaire est une pratique courante du maraîchage français. Une part des gens à
qui Sillon s'adresse organise ses semis avec, achète un calendrier chaque année, et ne
trouvera pas dans l'outil ce qu'elle a sur son mur. C'est un manque réel.

Il faut dire les choses une fois, clairement, pour pouvoir concevoir juste : **les études
contrôlées ne mettent pas en évidence d'effet reproductible des phases lunaires sur la
croissance des plantes.** Ce brief ne prétend pas le contraire, et Sillon ne le prétendra pas
non plus.

Cela ne condamne pas la fonctionnalité — cela en fixe la forme. Trois conséquences de
conception en découlent, et tout le reste du document s'y tient :

1. **Sillon affiche, n'affirme pas.** Le calendrier est une information datée, au même titre
   qu'une date de gel moyen. Aucun texte du type « meilleur moment pour semer ».
2. **La lune ne commande jamais.** Elle ne bloque aucune action, ne refuse aucune date, ne
   déplace rien toute seule. Elle propose, au plus.
3. **Éteint par défaut.** Qui ne pratique pas ne doit pas voir un mot de plus à l'écran.

Il y a d'ailleurs un bénéfice qui ne dépend pas de la question de l'efficacité : un
calendrier lunaire est une **discipline de planification**. Il donne un rythme, découpe le
mois en journées typées, et pousse à regrouper les travaux. Sillon peut servir cela
honnêtement.

---

## 2. Ce que fait Lunaterra, et ce que Sillon ferait autrement

D'après sa fiche Play Store, [Lunaterra](https://play.google.com/store/apps/details?id=com.bordialement.lunaterra)
est un compagnon de jardinage grand public : quatre univers (potager, verger, aromatiques,
fleurs), un suivi des plantes d'année en année, **un calendrier lunaire individuel par
plante** pour donner « la bonne action au bon moment », et des thèmes d'affichage.

La différence tient en une phrase : **Lunaterra doit demander ce que vous cultivez ; Sillon
le sait déjà.**

|                           | Lunaterra                   | Sillon                                                |
| ------------------------- | --------------------------- | ----------------------------------------------------- |
| Connaissance des cultures | déclarées plante par plante | le plan de culture entier existe déjà                 |
| Granularité               | une plante                  | une **série**, avec ses dates, sa planche, ses tâches |
| Ce que la lune qualifie   | une plante en général       | une **tâche datée** : ce semis-là, ce jour-là         |
| Public                    | jardinier amateur           | maraîcher professionnel, plan de 200 à 500 séries     |
| Usage                     | consultation                | **planification** — décaler, regrouper, imprimer      |

C'est le point d'appui : Sillon n'a pas besoin d'un module lunaire séparé. Il a besoin
d'**une qualification lunaire du temps**, posée sur un plan de culture qui existe déjà.

---

## 3. Les quatre couches de données lunaires

Les calendriers français superposent quatre choses, souvent confondues. Les distinguer est
la première exigence technique.

| Couche                                    | Cycle    | Ce que c'est                                                               | Ce que la tradition en dit                                                                 |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Croissante / décroissante**             | 29,5 j   | la part éclairée vue de la Terre (phase)                                   | la plus connue, et la moins utilisée par les calendriers sérieux                           |
| **Montante / descendante**                | 27,3 j   | la **déclinaison** : la lune monte ou descend dans le ciel jour après jour | « sève montante » → parties aériennes ; « sève descendante » → racines, plantation, taille |
| **Jour racine / feuille / fleur / fruit** | 27,3 j   | la constellation devant laquelle passe la lune                             | c'est **cette** couche qui dit quoi faire de quelle culture                                |
| **Points singuliers**                     | variable | périgée, apogée, nœuds lunaires, éclipses                                  | journées dites défavorables, où l'on s'abstient                                            |

**Le piège à éviter** : montante ≠ croissante. Ce sont deux cycles différents, de durées
différentes, et l'essentiel des conseils repose sur la première. Une implémentation qui ne
calculerait que la phase manquerait l'essentiel tout en ayant l'air de fonctionner — c'est
exactement le genre de défaut qui ne se voit pas.

**Un choix de fond à trancher** : les jours racine/feuille/fleur/fruit dépendent de la
position de la lune sur l'écliptique. Deux conventions coexistent, et elles ne donnent pas
les mêmes dates :

- **signes zodiacaux tropicaux** — douze secteurs égaux de 30°, simples à calculer, utilisés
  par la plupart des calendriers de presse ;
- **constellations réelles** — treize constellations de largeurs inégales (bornes IAU),
  convention de Maria Thun et du calendrier biodynamique.

Elles divergent aujourd'hui d'environ 24° — près d'un signe entier. **Il faut choisir, le
dire, et s'y tenir**, sans quoi les dates de Sillon ne correspondront à aucun calendrier
connu et personne ne saura pourquoi.

---

## 4. Le pivot : la partie récoltée

Pour relier la couche « jour fruit » au plan de culture, il manque **un seul attribut** :
ce qu'on récolte d'une espèce.

```
Crop { …, harvestedPart: root | leaf | flower | fruit }
```

Carotte → racine. Salade → feuille. Brocoli → fleur. Tomate → fruit.

Avec cet attribut, tout s'enchaîne sans que personne ait rien à étiqueter :

- une **série** hérite du type de jour de son espèce ;
- une **tâche** engendrée hérite de sa série ;
- la feuille de la semaine peut dire, pour chaque tâche, si le jour lui correspond ;
- le décalage par lot peut viser le prochain jour favorable.

C'est une migration minuscule — une colonne, une énumération — et c'est ce qui fait la
différence entre « une jolie horloge lunaire » et « un outil de planification ».

**Deux difficultés à ne pas sous-estimer.** D'abord le référentiel de départ compte une
centaine d'espèces à qualifier une par une, et certaines se discutent : le céleri-branche
est une feuille, le céleri-rave une racine ; le poireau est une feuille pour les uns, une
racine pour d'autres. Ensuite l'attribut n'est pas toujours vrai de la culture : une carotte
**porte-graine** se mène en jour fruit, pas en jour racine. D'où une règle : valeur par
défaut portée par l'espèce, **surchargeable au niveau de la série**.

---

## 5. Calcul : local, hors ligne, et pas dans le navigateur

Sillon fonctionne au champ, sur un réseau qui hoquette. Un calendrier lunaire qui exigerait
un appel réseau serait inutilisable là où il sert.

Trois options, et une recommandation :

| Option                                                    | Poids   | Hors ligne | Verdict                                                            |
| --------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------ |
| Appel à une API tierce                                    | nul     | ✗          | écarté : le champ n'a pas de réseau, et le brief promet zéro tiers |
| Bibliothèque d'éphémérides dans le navigateur             | ~100 ko | ✓          | coûteux : le brief vise des pages sous 300 ko                      |
| **Calcul serveur, année servie d'un coup, mise en cache** | ~15 ko  | ✓          | **recommandé**                                                     |

Une année de qualification lunaire tient en 365 lignes d'une quarantaine d'octets. Le
serveur la calcule, l'interface la demande une fois, le service worker la garde. Le coût
pour le navigateur est celui d'une petite requête JSON, et la fonctionnalité marche au champ
comme le reste.

Le calcul lui-même a sa place dans **`@sillon/core`** — « règles métier pures, sans base ni
navigateur » : ce sont des fonctions du temps vers une qualification, testables sans rien
monter. Les bibliothèques candidates, toutes sous licence MIT donc compatibles AGPL :
[`astronomia`](https://www.npmjs.com/package/astronomia) (phases, déclinaisons maximales,
passages aux nœuds — le plus complet),
[`astronomy-engine`](https://www.npmjs.com/package/astronomy-engine) (très précis, API
claire), [`suncalc`](https://github.com/mourner/suncalc) (minuscule, mais n'expose pas la
déclinaison, donc insuffisant seul).

**Une exigence de vérifiabilité**, dans la ligne de ce qui a été fait pour le TOTP : les
dates produites doivent être confrontées à des références publiées — quelques mois de
[gerbeaud.com](https://www.gerbeaud.com/jardin/calendrier/calendrier-lunaire.php) ou
[aujardin.info](https://www.aujardin.info/calendrier/calendrier-lunaire.php) — et l'écart
documenté. Un calendrier faux d'un jour est indétectable à l'œil et ruine la confiance.

**Une donnée manquante** : le modèle `Farm` porte `countryCode` mais ni fuseau ni
coordonnées. Pour la France métropolitaine, le code pays suffit à fixer la frontière du jour.
Au-delà — et pour l'hémisphère sud, où montante et descendante s'inversent — il faudra une
colonne `timezone`, voire une latitude.

---

## 6. Points d'intégration dans Sillon

Par ordre de valeur décroissante.

| Écran                                 | Ce qu'on y ajoute                                                                                                                               | Ce que ça change                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Feuille de la semaine** (`/taches`) | un bandeau par jour : montante/descendante, type de jour, points singuliers ; chaque tâche marquée d'un signe discret si le jour lui correspond | l'usage quotidien : on lit sa journée et on sait quoi faire remonter |
| **Décalage par lot** (`/plan`)        | « caler sur le prochain jour favorable » en plus du décalage en jours                                                                           | la planification d'hiver, là où le calendrier sert vraiment          |
| **Fiche de série**                    | à la saisie d'une date de semis, le type du jour ; les deux dates favorables les plus proches                                                   | corrige au moment où l'on décide, pas après                          |
| **Vue mois** (nouvelle)               | le mois en grille, coloré par type de jour, avec les tâches posées dessus                                                                       | remplace le calendrier papier sur le mur                             |
| **Impression**                        | le type de jour sur la feuille de tâches imprimée                                                                                               | le brief impose déjà des feuilles d'impression                       |
| **Réglages**                          | activer, choisir la convention (tropicale / constellations), choisir les couches affichées                                                      | éteint par défaut                                                    |

---

## 7. Règles de conception

Cinq règles, qui découlent de la section 1 et ne sont pas négociables :

1. **La lune ne bloque rien.** Aucune date refusée, aucun avertissement modal, aucune tâche
   empêchée. Au pire, un signe discret.
2. **Le décalage proposé est borné.** Une suggestion ne déplace jamais de plus de trois
   jours : au-delà, c'est l'agronomie qui commande, et une série de printemps ne se décale
   pas d'une semaine pour attendre un jour fruit.
3. **Le plan reste maître.** Si le calendrier lunaire et l'itinéraire technique se
   contredisent, l'itinéraire gagne, en silence.
4. **Aucune reproduction de calendrier publié.** Les calendriers de Maria Thun, de Rustica
   et consorts sont des œuvres protégées. Sillon **calcule** à partir d'éphémérides ; il ne
   recopie aucune table, et ne se réclame d'aucune de ces marques.
5. **Pas de vocabulaire d'efficacité.** « Jour fruit », « lune descendante » décrivent un
   état du ciel : ce sont des faits. « Favorable », « idéal », « meilleur moment » sont des
   affirmations : ils n'apparaissent que là où la personne a explicitement activé la
   fonctionnalité, et restent au conditionnel dans les textes d'aide.

---

## 8. Découpage proposé

| Lot                                   | Contenu                                                                                                                                                                               | Effort     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **1 — Le socle**                      | calcul dans `@sillon/core` (phase, déclinaison, position écliptique, points singuliers), confrontation aux calendriers publiés, route d'année, cache hors ligne, réglage d'activation | ~1 semaine |
| **2 — Le pivot et l'usage quotidien** | `harvestedPart` sur l'espèce et surcharge par série, qualification du référentiel de départ, bandeau de la feuille de la semaine, impression                                          | ~1 semaine |
| **3 — La planification**              | vue mois, « caler sur le prochain jour favorable » dans le décalage par lot, suggestions à la saisie d'une date                                                                       | ~1 semaine |

Le lot 1 est autonome et livrable seul : il donne déjà un calendrier lunaire consultable. Le
lot 2 est celui qui apporte la valeur propre à Sillon. Le lot 3 est du confort.

---

## 9. Ce qui reste à décider

Cinq questions, toutes pour toi, aucune technique :

1. **Convention zodiacale** : signes tropicaux (comme la presse) ou constellations réelles
   (comme Thun) ? Cela change les dates, et détermine à quel calendrier du commerce les
   utilisateurs pourront se comparer.
2. **Périmètre des couches** : les quatre, ou seulement montante/descendante et le type de
   jour ? Moins de couches, moins de bruit à l'écran.
3. **Portée** : réglage de ferme, ou préférence par personne ? Une équipe peut compter des
   gens qui pratiquent et d'autres non.
4. **Qui qualifie les espèces** : je propose une valeur par défaut pour la centaine
   d'espèces du référentiel, à toi de relire — ou on laisse le champ vide et chaque ferme
   renseigne les siennes.
5. **Position** : ajoute-t-on `timezone` et une latitude à `Farm` dès maintenant, ou
   s'en tient-on à la France métropolitaine pour cette version ?

---

## 10. Risques

- **Le faux d'un jour.** Une erreur de frontière de jour, de fuseau ou de convention décale
  tout le calendrier sans que rien n'ait l'air cassé. C'est le risque principal, et la seule
  parade est la confrontation à des références publiées, sur plusieurs mois et plusieurs
  années.
- **La surcharge visuelle.** Une feuille de tâches déjà dense supporte mal quatre couches
  d'information lunaire. D'où le réglage par couche, et le parti pris du signe discret.
- **Le glissement du discours.** Une fonctionnalité utile devient une promesse thérapeutique
  en trois itérations de texte d'interface. La règle 5 existe pour cela ; elle mérite d'être
  rappelée en revue.
- **L'attente d'un contenu éditorial.** Lunaterra propose des conseils par plante. Sillon
  n'a pas vocation à écrire du contenu horticole, et devra dire non à cette demande — ou
  l'assumer comme un projet à part, avec un auteur.

---

## 11. Décision du 20 septembre 2026 : la fiche du jour

Une fiche s'ouvre désormais au clic sur une journée de la vue mois
(`/calendrier-lunaire/2026-09-20`). Elle porte deux choses que les sections précédentes
avaient écartées, et cette section existe pour que l'écart soit **écrit** plutôt que
découvert en revue de code.

### Ce qui a été demandé, et accordé

| Élément                                                                  | Ce que disait ce brief                                          | Décision                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Indice chiffré 0-100** et son étiquette (« Exceptionnel »…)            | §7 règle 5 : pas de vocabulaire d'efficacité                    | **Accordé**, sous les garde-fous ci-dessous                                    |
| **Créneau conseillé** (« Jardiner en fin d'après-midi · 17h04 – 19h41 ») | §1 règle 1 : pas de « meilleur moment pour semer »              | **Accordé**                                                                    |
| **Conseils du jour** et **tâches suggérées**, par type × mois            | §10 : « Sillon n'a pas vocation à écrire du contenu horticole » | **Accordé** — le contenu est écrit et maintenu dans les fichiers de traduction |
| **Météo du jour** (Open-Meteo)                                           | brief général §3.8 : hors périmètre V1                          | **Accordé**, extinguible (`WEATHER=none`)                                      |

La demande est légitime : c'est la forme qu'ont les compagnons de jardinage du marché, et
un calendrier lunaire qui refuserait d'en avoir l'air rate une partie de son public. Ce
qu'il faut, c'est que l'honnêteté tienne **autrement** que par le silence.

### Les quatre garde-fous qui remplacent la règle 5

Ils ne sont pas facultatifs. Chacun tient une promesse que le vocabulaire ne tient plus.

1. **L'indice s'ouvre.** `MoonIndex.reasons` dit ce qui a retiré des points et de combien,
   et l'interface l'affiche derrière un bouton ⓘ avec cette phrase : _« Il n'a jamais été
   confronté à une mesure de rendement, et n'en est pas une : les études contrôlées ne
   mettent pas en évidence d'effet reproductible des phases lunaires sur la croissance des
   plantes. »_ Un chiffre affiché gros au milieu d'un écran passe pour une mesure ; c'est
   ce bouton qui l'en empêche, et le retirer changerait la nature de l'écran.
2. **L'indice n'agrège que des conventions.** Cent points, moins le nœud (−45), le périgée
   ou l'apogée (−20), la journée partagée entre deux types (−10), la lune sous l'horizon
   pendant le jour (−5). Aucune de ces valeurs ne sort d'une mesure ; toutes sortent de ce
   que les calendriers traditionnels marquent comme journées singulières. Le calcul est
   dans `packages/core/src/moon-detail.ts`, et `moon-detail.test.ts` vérifie qu'il est
   reproductible et que le compte rendu explique l'écart **en entier**.
3. **Le créneau est un fait, pas un conseil déguisé.** C'est l'intersection de deux choses
   vérifiables en levant la tête : la lune est au-dessus de l'horizon, et il fait jour.
   Aucune règle de tradition ne fixe d'heure dans la journée, et en inventer une aurait été
   ajouter une affirmation de plus.
4. **Les règles 1 à 4 du §7 tiennent toujours.** La lune ne bloque rien, ne déplace rien,
   ne s'impose pas au plan, et ne recopie aucun calendrier publié. Les tâches suggérées ne
   s'ajoutent à aucun plan : ce sont des lignes de texte, et la fiche le dit.

### Ce que Sillon ajoute, et qu'aucun compagnon ne peut ajouter

C'est le point d'appui du §2, et il est visible sur cette fiche : sous les conseils d'usage
viennent **les espèces du référentiel de la ferme** qui se récoltent de ce type, puis **les
tâches réellement prévues ce jour-là**, marquées quand la culture correspond au type du
jour. Lunaterra doit demander ce qu'on cultive ; Sillon le sait déjà.

### Le contenu éditorial, et ce qu'il engage

Quarante-huit entrées — quatre types de jour × douze mois —, chacune portant un conseil et
deux ou trois travaux d'usage, en français et en anglais, sous `moon.advice` dans les
fichiers de traduction. Ce sont des travaux courants de maraîchage en France
métropolitaine, écrits pour Sillon : ils ne recopient aucun calendrier publié, ce que la
licence de ces ouvrages interdirait. Le risque nommé au §10 demeure entier, et il n'a pas
disparu parce qu'on l'a accepté : **ce contenu a désormais un coût de maintenance, et il
n'a pas d'auteur désigné.** Il vieillira, il sera faux quelque part, et il faudra quelqu'un
pour le relire. À rouvrir si la demande s'étend à un conseil par espèce.

### La météo

`WEATHER=open-meteo` par défaut, `none` pour couper. C'est le **second** endroit où Sillon
parle à l'extérieur, après la recherche d'adresse, et il tient les mêmes règles : la
requête passe par le serveur, elle s'éteint d'un réglage, et les coordonnées partent
arrondies au centième de degré — environ un kilomètre, soit plus fin que la maille des
modèles et moins fin que la parcelle. Hors de la fenêtre couverte, la route rend `null`
plutôt qu'une prévision inventée, et la fiche s'affiche sans météo. Voir
`apps/api/src/routes/weather.ts`.
