# Brief — reprendre les données Mesclun dans Sillon

*Étude d'opportunité et cadrage technique*

*17 septembre 2026*

---

## 1. De quoi on parle

Quatre dépôts sur l'Entrepôt Recherche Data Gouv (Data INRAE), qui accompagnent l'outil
en ligne **Pépinière-Mesclun** (<https://outils-mesclun.fr/>), issu du projet MESCLUN
porté par l'INRAE et l'ITAB :

| DOI | Nature | Contenu |
| --- | --- | --- |
| [10.57745/IQVM2I](https://doi.org/10.57745/IQVM2I) | **Base de données** | 75 légumes : caractéristiques génériques, cycles de culture (fourchettes de semaine d'implantation, de début et de fin de récolte) sous abri et en plein champ, fourchettes de prix circuit court et circuit long (TTC), durées de stockage, fourchettes de rendement en bio et en conventionnel, et les références bibliographiques associées |
| [10.57745/LIUHEY](https://doi.org/10.57745/LIUHEY) | Classeur `.xlsx` | Calcul des besoins en plants et semences d'après un plan de culture |
| [10.57745/NTTSBR](https://doi.org/10.57745/NTTSBR) | Classeur (Ferti-Pépi) | Aide à la réflexion sur la fertilité des sols |
| [10.57745/ZA4CFO](https://doi.org/10.57745/ZA4CFO) | Classeur (PépiScore) | Auto-évaluation environnementale |

L'outil est présenté par ses auteurs comme un **commun numérique**, « géré collectivement
par la communauté, impliquant un accès libre aux données, modèles et codes informatiques ».

> **Réserve de méthode.** Ce brief est établi à partir des métadonnées publiques
> accessibles par recherche. Les pages de l'entrepôt, `outils-mesclun.fr`, le PNDB et le
> site de l'INRAE sont **inaccessibles depuis l'environnement où il a été rédigé** (le
> proxy réseau les bloque). Le contenu détaillé des fichiers n'a donc pas été lu, et
> **la licence n'a pas été vérifiée** — voir §3, qui est le point bloquant.

## 2. Le manque que ces données combleraient

Mesuré sur `apps/api/src/reference-data.ts` : le référentiel qu'une nouvelle ferme reçoit
aujourd'hui contient **8 familles et une trentaine d'espèces**, et pour chacune
uniquement un nom (fr/en), une couleur et un délai de retour en années.

```ts
export interface FamilySeed {
  name: string;
  nameEn: string;
  color: string;
  interval: number;
  crops: { name: string; nameEn: string }[];
}
```

Aucune durée de culture, aucun espacement, aucun rendement, aucun prix. Tout cela se
saisit série par série, à la main, par la personne qui s'installe — c'est-à-dire au
moment précis où elle n'a pas encore les références de sa propre ferme.

C'est exactement ce que IQVM2I apporte, et pour 75 légumes au lieu de 30.

## 3. Le point bloquant : la licence

Sillon est sous **AGPL-3.0-or-later** et tient une conformité REUSE stricte (chaque
fichier porte sa licence et son copyright, la CI le vérifie). Intégrer des données sans
licence explicitement compatible casserait cette chaîne, et le problème ne se règle
**ni** par un en-tête SPDX **ni** par une entrée dans `REUSE.toml` : ces fichiers
décrivent une licence, ils n'en accordent aucune.

Trois cas, à trancher avant toute ligne de code :

- **CC0 / Licence Ouverte Etalab 2.0 / CC-BY 4.0** — compatibles. Etalab et CC-BY
  imposent l'attribution : mention des auteurs, du DOI et de la version dans
  `REUSE.toml` et dans l'interface, là où la donnée s'affiche.
- **CC-BY-SA** — compatible en pratique avec l'AGPL pour de la donnée, mais contamine :
  le référentiel dérivé devra rester sous CC-BY-SA, ce qui mérite d'être assumé.
- **CC-BY-NC, ND, ou rien du tout** — rédhibitoire. Sillon est utilisable
  commercialement par les fermes ; une clause non commerciale l'interdirait.

**À faire d'abord :** ouvrir chacune des quatre pages de l'entrepôt et relever le champ
« Conditions d'utilisation / Terms of Use », et la version du jeu. Sans cela, le reste de
ce brief reste théorique.

## 4. Quatre frictions de modèle, qu'aucun import mécanique ne résout

Ces données ne se versent pas telles quelles dans le schéma de Sillon, hérité de Brinjel.

**Semaines contre jours.** Mesclun raisonne en semaines d'implantation et de récolte ;
Sillon stocke des **durées de culture en jours** et déduit les dates les unes des autres
à partir du semis (`packages/core/src/dates.ts`). Convertir « semaines 12 à 16 » en un
nombre de jours suppose de choisir un point dans la fourchette — un choix agronomique,
pas une conversion.

**Fourchettes contre valeurs.** Rendements, prix et cycles sont donnés en fourchettes.
Sillon stocke une valeur unique par série (rendement en millièmes, prix en centimes).
Aplatir une fourchette sur sa moyenne fabrique une précision qui n'existe pas. Garder la
fourchette demande d'ajouter des colonnes (min/max) au référentiel — ce qui est
probablement la bonne réponse, mais c'est une évolution de schéma.

**Une zone climatique, pas le monde.** Les cycles sont calibrés pour le **Nord-Ouest de
la France**. Sillon n'a aujourd'hui aucune notion de zone climatique. Les poser en
valeurs par défaut universelles tromperait silencieusement une ferme en Provence ou en
Belgique — et c'est le risque le plus sérieux du lot : une valeur par défaut fausse mais
plausible ne s'annonce pas, contrairement à un champ vide.

**Des prix datés.** Les fourchettes de prix TTC valaient à la date de publication du jeu.
Les servir comme défaut trois ans plus tard est un piège. Soit on les exclut, soit on les
affiche avec leur millésime, jamais comme une valeur pré-remplie.

## 5. Une question d'architecture : `farm_id` partout

Le référentiel de Sillon est **par ferme** (`families`, `crops`, `varieties` portent un
`farm_id` et une politique RLS). Les données Mesclun forment au contraire un référentiel
**commun**. Deux voies :

1. **Copier à la création de la ferme**, comme le fait `createFarm` aujourd'hui. Simple,
   respecte la RLS sans y toucher, chaque ferme reste maîtresse de ses valeurs. Défaut :
   une correction du référentiel amont ne redescend jamais dans les fermes existantes.
2. **Un référentiel commun lisible par toutes**, à côté du référentiel par ferme. Plus
   juste, mais c'est une entaille dans l'invariant « `farm_id` partout » — donc dans le
   modèle de sécurité, qui est ce que Sillon a de plus solide.

La voie 1 est la bonne pour commencer, et elle n'interdit pas la voie 2 plus tard.

## 6. Avis : opportun, mais sur un seul des quatre jeux

**Oui pour IQVM2I** (la base de données). C'est la seule des quatre ressources qui soit
de la *donnée* ; elle comble un manque réel et mesurable ; elle vient d'un institut public
et porte ses références bibliographiques, ce qui est rare et précieux pour un référentiel
agronomique.

**Non, ou pas maintenant, pour les trois autres** — ce sont des *classeurs*, c'est-à-dire
des outils, pas des données :

- **LIUHEY** (besoins en plants et semences) recouvre ce que `packages/core/src/seeds.ts`
  calcule déjà, porté depuis Brinjel et couvert par des essais. Le reprendre serait
  remplacer du code éprouvé par une feuille de calcul.
- **NTTSBR** (fertilité des sols) et **ZA4CFO** (auto-évaluation environnementale) sont
  deux domaines fonctionnels nouveaux. Le brief de Sillon place explicitement hors
  périmètre V1 tout ce qui n'est pas planification, tâches, assolement, commandes et
  suivi (§3.8). Ils pourraient devenir des chantiers à part entière ; ils ne sont pas un
  import de données.

L'intérêt de fond : Sillon et Mesclun visent le même métier avec la même éthique de
commun. Reprendre le référentiel INRAE plutôt que d'en inventer un donne à Sillon une
base sourcée et citable — argument qui compte pour une ferme qui doit justifier ses
prévisions devant un financeur ou un conseiller.

## 7. Découpage proposé, si la licence le permet

1. **Vérifier la licence** des quatre jeux et la consigner. Rien ne commence avant.
2. **Lire IQVM2I** et écrire une note de correspondance colonne à colonne entre ses
   champs et le schéma de Sillon, en signalant ce qui n'a pas d'équivalent.
3. **Étendre le référentiel** : ajouter au schéma les colonnes manquantes sous forme de
   fourchettes (rendement min/max, cycle min/max), avec la zone climatique et la source
   (DOI + version) portées par la donnée elle-même.
4. **Écrire l'importateur** comme un script de génération : il transforme les fichiers du
   dépôt en `reference-data-mesclun.ts`, versionné. On n'importe pas à chaud depuis
   l'entrepôt — la donnée entre dans le dépôt, relue, avec son SPDX et son attribution.
5. **Rendre le choix explicite à la création de la ferme** : référentiel minimal (celui
   d'aujourd'hui) ou référentiel Mesclun, avec sa zone climatique annoncée. Jamais un
   défaut silencieux.
6. **Attribution** : entrée dédiée dans `REUSE.toml`, mention dans le README et dans
   l'écran des paramètres, à l'endroit où le référentiel se consulte.

## 8. À trancher

- La licence des quatre jeux (§3) — **bloquant**.
- Fourchettes : ajouter des colonnes min/max au schéma, ou retenir une valeur unique ?
- Zone climatique : champ sur la ferme, ou simple mention informative sur le référentiel ?
- Les prix : exclus, ou inclus avec leur millésime visible ?
- Référentiel copié à la création (voie 1) ou commun (voie 2) ?

## Sources

- Base de données pour la planification en maraîchage (Pépinière-Mesclun) — <https://doi.org/10.57745/IQVM2I>
- Module de calcul des besoins en plants et semences — <https://doi.org/10.57745/LIUHEY>
- Un outil de gestion de la fertilité des sols : Ferti-Pépi — <https://doi.org/10.57745/NTTSBR>
- Un outil d'auto-évaluation environnementale : PépiScore — <https://doi.org/10.57745/ZA4CFO>
- Outil en ligne Pépinière-Mesclun — <https://outils-mesclun.fr/>
