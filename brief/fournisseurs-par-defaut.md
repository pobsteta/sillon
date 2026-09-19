<!--
SPDX-FileCopyrightText: © 2026 Sillon contributors
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Brief — Des fournisseurs de semences par défaut

_Kokopelli et Le Potager de Santé dans le référentiel de départ_

_18 septembre 2026_

---

## 1. Ce qu'est un fournisseur dans Sillon aujourd'hui

Presque rien, et c'est important de le dire avant de discuter :

```prisma
model Provider {
  id     Int
  farmId Int
  name   String
  type   ProviderType  // seed | transplant
  @@unique([farmId, name, type])
}
```

Un nom et un type. Pas d'adresse, pas de site, pas de référence catalogue. Chaque ferme a
**ses** fournisseurs — `farmId` partout, RLS — et `seedFarmReference()` en crée aujourd'hui
un seul, nommé « Fournisseur par défaut », posé aussitôt comme `Farm.defaultProviderId`.

À quoi il sert réellement : **la variété porte son fournisseur** (`Variety.providerId`, non
nul), et l'écran `/commandes` regroupe et filtre par fournisseur, avec une colonne
« Fournisseur » dans l'export. C'est donc la clé de répartition de la commande de semences —
l'écran qui dit quoi acheter, à qui, et pour quand.

Autrement dit : nommer les fournisseurs pour de vrai ne change pas le modèle, cela rend la
feuille de commande **utilisable telle quelle** au lieu de la faire renommer par chacun.

---

## 2. Les deux maisons

Ce qui suit vient de leurs sites et de sources publiques, vérifié le 18 septembre 2026.

### Kokopelli

Association loi 1901 créée en 1999, longtemps installée à **Alès**, qui a quitté ses bureaux
gardois pour **Le Mas d'Azil, en Ariège**. Elle diffuse des semences **biologiques,
reproductibles et libres de droits**, de variétés anciennes ou modernes non inscrites au
catalogue officiel — combat qui lui a valu des procédures judiciaires devenues un repère du
débat français sur les semences.

Ordre de grandeur du catalogue : plusieurs milliers de variétés conservées, **entre 1 600 et
2 000 références proposées chaque année**, dont environ **400 variétés de tomates**.

### Le Potager de Santé

**SAS** installée à **Olmet-et-Villecun (Hérault)**, près du lac du Salagou, conduite par
Rachel et Pascal Poot sur une dizaine d'hectares. Semences **biologiques et reproductibles**,
produites sur place depuis plus de vingt ans, avec une sélection orientée vers la
**rusticité** : résistance à la sécheresse, à l'humidité et aux maladies. Vente en ligne et
à la ferme, public de jardiniers et de maraîchers.

> **Un point de vigilance rédactionnelle.** Le site du Potager de Santé avance que ses
> variétés contiendraient « de 10 à 20 fois plus de vitamines, d'antioxydants et de
> polyphénols » que des hybrides conventionnels. C'est **leur** allégation commerciale.
> Sillon ne la reprend pas, ne la résume pas et ne la commente pas : il inscrit un nom de
> fournisseur dans une liste, rien d'autre. Même discipline que pour le calendrier lunaire :
> le logiciel affiche, il n'affirme pas.

---

## 3. La vraie question : est-ce éditorial ?

Oui, et c'est le seul point qui mérite une décision.

Livrer deux noms commerciaux dans le référentiel de départ d'un logiciel AGPL, c'est les
placer sous les yeux de **toute** personne qui crée une ferme, y compris là où ces maisons
ne livrent pas. Ce n'est pas neutre, même sans un mot d'éloge.

Trois façons de le faire, de la plus engagée à la plus prudente :

| Option                                    | Ce que ça donne                                                                                   | Ce que ça coûte                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **A — Deux noms en dur**                  | toute nouvelle ferme démarre avec Kokopelli, Le Potager de Santé et le fournisseur générique      | un choix éditorial assumé par le projet ; à maintenir si une maison ferme |
| **B — Une liste proposée à la création**  | l'écran de création coche les fournisseurs souhaités dans une liste plus large                    | un écran de plus, et la liste reste éditoriale                            |
| **C — Semencier libre, liste extensible** | un fichier `semenciers.json` versionné, que chacun complète par contribution ; A en est le départ | le même choix, mais ouvert : une PR suffit à ajouter une maison régionale |

**Recommandation : A, écrit comme C.** Poser les deux noms dans un fichier de données séparé
(`packages/core` ou `apps/api/src/reference-data.ts`), avec un commentaire disant que la
liste est ouverte aux contributions et que l'inscription n'est ni un partenariat ni une
recommandation. On obtient l'usage immédiat sans prétendre à une neutralité qu'on n'a pas.

Deux garde-fous qui ne coûtent rien :

- **Aucune marque dans l'interface hors de la liste des fournisseurs.** Pas de logo, pas de
  lien d'affiliation, pas de « suggéré par Sillon ».
- **Rien n'est envoyé nulle part.** Un fournisseur est une étiquette locale ; Sillon ne
  contacte aucun de ces sites, ni pour un catalogue, ni pour un prix.

---

## 4. Ce que le modèle gagnerait à porter

Deux colonnes, toutes deux facultatives, qui servent la feuille de commande :

```prisma
model Provider {
  …
  url   String?   // le site où l'on commande
  notes String?   // « commande groupée avant le 15 janvier »
}
```

`url` rend la colonne « Fournisseur » de `/commandes` cliquable : depuis la feuille de
commande, on va sur le site. `notes` recueille ce que chaque ferme sait de son fournisseur —
délais, minimum de commande, date de clôture — information qui aujourd'hui finit sur un
papier.

**Ce qu'il ne faut pas ajouter** : ni catalogue importé, ni tarifs, ni disponibilités. Ce
sont des données tierces, changeantes, et les tenir à jour deviendrait un travail à part
entière que personne ne ferait. Sillon dit _à qui_ commander, pas _à quel prix_.

---

## 5. Les deux difficultés d'implémentation

**Les fermes existantes n'auront rien.** `seedFarmReference()` ne tourne qu'à la création.
Deux réponses possibles : une migration qui ajoute les deux fournisseurs à toute ferme qui
n'en a pas déjà un du même nom (`@@unique([farmId, name, type])` rend l'opération sûre), ou
un bouton « ajouter les fournisseurs proposés » dans les paramètres. La migration est plus
simple ; le bouton est plus respectueux d'un référentiel que la ferme a déjà rangé.
**Recommandation : le bouton.** Écrire dans le référentiel de quelqu'un sans le lui demander
est exactement le genre de chose qu'on ne fait pas.

**Le fournisseur par défaut reste générique.** `Farm.defaultProviderId` doit continuer de
pointer sur « Fournisseur par défaut » : c'est lui qui accueille les variétés dont on ne sait
pas encore d'où elles viennent. Le désigner sur une maison précise ferait entrer des noms
commerciaux dans des données saisies sans intention.

---

## 6. Découpage

| Lot                      | Contenu                                                                                                   | Effort            |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------- |
| **1 — Les deux noms**    | liste de semenciers dans le référentiel de départ, `type: seed`, essai vérifiant qu'une ferme neuve les a | ~2 h              |
| **2 — `url` et `notes`** | migration, formulaire des fournisseurs, colonne cliquable dans `/commandes`                               | ~une demi-journée |
| **3 — Le bouton**        | « ajouter les fournisseurs proposés » dans les paramètres, pour les fermes existantes                     | ~2 h              |

---

## 7. Ce qui a été fait

_Mise à jour du 18 septembre 2026._ Les trois lots sont implémentés, sur **l'option A écrite
comme C** : les deux maisons figurent dans `SUGGESTED_PROVIDERS`
(`apps/api/src/reference-data.ts`), une liste ouverte dont le commentaire dit ce que
l'inscription n'est pas. Aucune autre maison n'a été ajoutée — c'est une décision éditoriale
qui appartient au dépôt, pas à l'implémentation (voir le point 2 ci-dessous).

Une chose a changé en cours de route. Le brief disait « reconnaître par le nom » ; c'est
faux dès qu'une ferme renomme une maison — « Kokopelli (commande groupée) » pour une
commande collective. Le geste aurait alors fait réapparaître « Kokopelli » à côté du sien,
c'est-à-dire **défait son choix en croyant l'aider**. La reconnaissance se fait donc sur le
**nom ou l'adresse** : l'adresse identifie la maison, le nom n'est que l'étiquette que la
ferme lui donne. Un essai porte ce cas.

---

## 8. Ce qui reste à trancher

1. ~~**A, B ou C**~~ — tranché : A écrit comme C. À revoir si tu préfères autrement.
2. ~~**D'autres maisons dès le départ ?**~~ — tranché le 18 septembre 2026 : **Germinance,
   Graines del Païs et Agrosemens** rejoignent les deux premières, soit cinq maisons. La
   liste reste ouverte ; La Ferme de Sainte Marthe n'y figure pas, faute d'avoir été
   demandée.
3. **Le type.** Les deux maisons vendent des **semences** (`seed`). Aucun plant, donc rien à
   poser en `transplant` pour l'instant.

---

## Sources

- [Association Kokopelli — site officiel](https://kokopelli-semences.fr/fr/)
- [Kokopelli s'en va semer en Ariège — Objectif Gard](https://www.objectifgard.com/actualites/ales-kokopelli-sen-va-semer-en-ariege-84817.php)
- [Kokopelli (association) — Ekopedia](<https://www.ekopedia.fr/wiki/Kokopelli_(association)>)
- [Le Potager de Santé — site officiel](https://www.lepotagerdesante.com/)

_Mise à jour du 19 septembre 2026_ : le domaine de Graines del Païs ne répondait plus. La
maison reste au référentiel **sans lien** — c'est son nom qui répartit une commande, pas son
site, et un lien mort se suit une fois pour rien avant qu'on s'en méfie.
