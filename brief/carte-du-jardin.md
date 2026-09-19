<!--
SPDX-FileCopyrightText: © 2026 Sillon contributors
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Brief — Dessiner son jardin sur une carte

_Situer la ferme, tracer les planches, sur un fond libre_

_19 septembre 2026_

---

## 1. Ce qui existe, et ce qui manque

Sillon connaît le parcellaire **par sa structure**, pas par sa géographie :

```prisma
model Location {
  name, parentId, path (ltree), position
  bedLength, bedWidth, greenhouse
}
model Farm { countryCode, timezone, … }
```

Un arbre de jardins et de planches, des longueurs en millimètres, un chemin matérialisé qui
trie l'affichage. Pas un mètre carré de géographie, pas une coordonnée — `timezone` est
arrivée avec le calendrier lunaire, et c'est tout ce que la ferme sait de sa position.

**Et l'écran d'assolement fonctionne.** Il place les séries sur les planches, au doigt comme
à la souris, avec la rotation vérifiée et les conflits d'occupation signalés. C'est du code
éprouvé, utilisé tous les jours de la saison.

Ce qui manque n'est donc pas un moyen de travailler : c'est un moyen de **situer** son
jardin et d'en **dessiner la forme**. Deux besoins distincts de celui que l'assolement sert.

Le brief de développement (§ « Cartographie GPS des parcelles ») la renvoyait à une V2. Ce
document propose de la faire, et dit à quel prix.

---

## 2. Le parti pris : la carte pour le plan, la liste pour le travail

**Deux écrans, deux usages.** La carte sert à dessiner son jardin une fois, et à le situer ;
l'assolement sert à y travailler tous les jours.

Ce n'est pas un compromis de prudence. Placer une série sur un polygone demanderait de
viser au doigt un objet de quelques pixels sur un téléphone, en plein champ, sous le
soleil — alors que la liste de planches de l'assolement y est lisible et tapable. Le jour
où l'on dessine son jardin, en revanche, on est au bureau, en hiver, devant un grand écran.

**Rien de ce qui fonctionne n'est remis en cause.** La carte lit le même arbre
d'emplacements et lui ajoute une forme ; elle n'ouvre pas un second parcellaire, qui
divergerait du premier sans que personne ne s'en aperçoive.

---

## 3. Le stockage : du GeoJSON dans une colonne, pas PostGIS

```prisma
model Farm {
  latitude   Float?   // degrés décimaux, WGS 84
  longitude  Float?
}
model Location {
  /// Contour de l'emplacement, GeoJSON Polygon en WGS 84. Nul tant qu'on n'a rien dessiné.
  geometry   Json?
}
```

**Pourquoi pas PostGIS.** Ce serait le bon outil si l'on avait des requêtes spatiales à
faire. On n'en a pas : une ferme compte quelques dizaines de planches, et tout ce qu'on
veut en tirer — une surface, un centre, une emprise — se calcule dans `@sillon/core`, où
vivent déjà les règles métier, en quelques lignes et sans base. En échange, PostGIS
coûterait cher : changer d'image PostgreSQL, et surtout **vérifier que chaque hébergement
visé l'offre** — ce qui n'est pas acquis sur les paliers gratuits, et fermerait peut-être la
porte au déploiement d'essai.

Ce qu'on perd est réel et nommé : aucune requête « quelles planches dans ce rectangle », pas
d'index spatial. Si ce besoin apparaît, la migration vers PostGIS reste possible — une
colonne `geometry` GeoJSON se convertit en `geography` par un `ST_GeomFromGeoJSON`.

**Deux pièges à écrire dans le code, pas seulement ici.**

1. **GeoJSON est en `[longitude, latitude]`. Leaflet est en `[latitude, longitude]`.**
   C'est l'inversion la plus classique de toute la cartographie web, elle ne lève aucune
   erreur, et elle place le jardin dans l'océan Indien — ou, en France, dans le désert
   libyen. Une fonction de conversion nommée, aux deux bords, et un essai qui pose un
   polygone connu et vérifie qu'il retombe où il faut.

2. **Les coordonnées sont des flottants, et c'est une exception assumée.** Le dépôt stocke
   tout en entiers, aux unités de Brinjel. Une latitude n'est pas une mesure de l'outil :
   c'est un format d'échange normalisé, dont la représentation ne nous appartient pas. La
   tordre en micro-degrés entiers produirait du GeoJSON que personne d'autre ne sait lire.
   La convention du dépôt s'arrête donc à la frontière du standard — et ce paragraphe existe
   pour que ce ne soit pas pris pour un oubli.

---

## 4. La bibliothèque : Leaflet nu, et surtout **pas** `react-leaflet`

| Paquet                           | Version | Licence             | Verdict                      |
| -------------------------------- | ------- | ------------------- | ---------------------------- |
| `leaflet`                        | 1.9.4   | BSD-2-Clause        | **retenu**                   |
| `@geoman-io/leaflet-geoman-free` | 2.20.1  | MIT                 | **retenu** pour le dessin    |
| `leaflet-draw`                   | 1.0.4   | MIT                 | alternative, peu maintenue   |
| `react-leaflet`                  | 5.0.0   | **Hippocratic-2.1** | **écarté** — voir ci-dessous |

**`react-leaflet` est sous licence Hippocratic 2.1.** C'est une licence à _restrictions
d'usage_ : elle interdit certains emplois jugés contraires aux droits humains. L'intention
se discute, la conséquence non — elle n'est reconnue ni par l'OSI, ni par la FSF, parce
qu'elle retire la liberté d'usage.

Or l'AGPL que porte Sillon promet quatre libertés, dont celle d'exécuter le programme
**pour n'importe quel usage**. Une dépendance qui la retire nous ferait promettre ce que
nous ne pouvons pas tenir. Le contrôle REUSE de la CI ne le verrait pas : `Hippocratic-2.1`
est un identifiant SPDX valide, et le fichier passerait. C'est précisément pourquoi cela
mérite d'être écrit ici — **le défaut serait silencieux**.

Le coût de s'en passer est faible : `react-leaflet` est un enrobage React autour de
Leaflet. Un composant `<Carte>` maison, qui monte une instance dans un `useEffect` et la
détruit au démontage, tient en quelques dizaines de lignes et ne fait que ce dont on a
besoin.

**Budget de page.** Leaflet pèse environ 42 ko compressés, Geoman une vingtaine. Le brief
vise des pages sous 300 ko : la route de la carte se chargera donc **paresseusement**,
comme `/assolement` et `/statistiques` le font déjà. Qui n'ouvre pas la carte ne la télécharge
pas.

---

## 5. Les fonds de carte : OSM livré, le reste configuré

**Sillon ne livre qu'OpenStreetMap**, avec son attribution affichée — elle est exigée par
la licence, pas facultative.

```env
# Fond supplémentaire, à la charge du déploiement.
MAP_TILE_URL=
MAP_TILE_ATTRIBUTION=
```

**Pourquoi pas d'imagerie satellite livrée.** Les fonds aériens gratuits d'Esri ou de Google
sont soumis à des conditions qui interdisent l'usage hors de leurs propres SDK et la
redistribution. Les inscrire dans un dépôt AGPL ferait porter à chaque personne qui
l'installe une violation qu'elle n'a pas choisie.

Ce que le réglage permet, et que la documentation donnera en exemple : les **orthophotos de
l'IGN**, libres et redistribuables, pour une ferme française. Une ferme belge ou québécoise
mettra ce à quoi elle a droit. Le projet ne redistribue aucune imagerie et ne choisit pour
personne.

**La carte ne sera pas disponible hors ligne, et il faut le dire.** Le service worker garde
les lectures métier ; il ne gardera pas le monde en tuiles. Ce n'est pas une lacune mais une
conséquence du parti pris de la section 2 : la carte est un écran de planification, pas un
écran de terrain. Les tuiles déjà consultées resteront en cache navigateur, et c'est tout ce
qu'on promettra.

---

## 6. La recherche d'adresse : la BAN d'abord, Nominatim en recours

**Base Adresse Nationale** (`api-adresse.data.gouv.fr`) : libre, sans clé, sans quota
strict. Vérifiée en écrivant ce brief — l'adresse de Germinance à Soucelles revient en
`47.59855, -0.44078` avec un score de 0,95.

**Nominatim** (OpenStreetMap) en recours pour le reste du monde. Sa politique d'usage est
stricte : une requête par seconde au maximum, identification obligatoire de l'application,
et aucun géocodage en masse. Trois conséquences pour le code :

- la recherche ne part **jamais à la frappe**, seulement sur validation explicite ;
- l'application s'identifie, comme la politique l'exige ;
- l'adresse du service est configurable, pour qu'un déploiement sérieux pointe sa propre
  instance plutôt que l'instance publique.

**Le point qui mérite le plus d'attention n'est pas technique.** Chercher une adresse,
c'est **envoyer l'adresse de la ferme à un tiers** — ce serait la première fois que Sillon
fait sortir une donnée vers l'extérieur. Pour une exploitation individuelle, l'adresse de la
ferme est une donnée personnelle.

Donc : la recherche est un geste explicite, jamais automatique ; l'écran dit à qui la requête
part avant qu'elle ne parte ; et elle se désactive par configuration, auquel cas on saisit
ses coordonnées à la main. C'est la même discipline que le calendrier lunaire — on propose,
on n'impose pas — appliquée cette fois à une question de vie privée.

> **À noter** : Sillon **retire déjà les coordonnées GPS des photos** de notes à
> l'enregistrement (`images.ts`), précisément parce qu'une photo prise au champ porte la
> position de la parcelle et que la republier serait une fuite. Ce brief propose d'enregistrer
> une position **volontairement** ; il ne remet pas en cause le fait qu'on ne la prélève pas
> à l'insu de qui que ce soit. Les deux décisions se complètent, elles ne se contredisent pas.

---

## 7. Ce que ça change à l'écran

| Écran               | Ce qu'on y ajoute                                                         |
| ------------------- | ------------------------------------------------------------------------- |
| **Carte** (nouveau) | fond, recherche d'adresse, contour du jardin, tracé des planches          |
| **Paramètres**      | position de la ferme, fond de carte, activation de la recherche d'adresse |
| **Assolement**      | rien — il continue exactement comme aujourd'hui                           |
| **Impression**      | le plan du jardin, à emporter ou à afficher dans la remise                |

**Un piège d'ergonomie à trancher maintenant.** Une planche dessinée a une longueur
mesurable. Faut-il en déduire `bedLength` ? C'est tentant, et dangereux : cette valeur sert
aux calculs de semences, de rendement et de commande. Un tracé approximatif au doigt
deviendrait silencieusement la base d'une commande de graines.

**Proposition : la mesure se propose, elle ne s'impose jamais.** « Le tracé mesure 28,4 m ;
la planche est réglée à 30 m — utiliser la mesure ? » Le plan reste maître, comme il l'est
déjà face au calendrier lunaire.

---

## 8. Découpage

| Lot              | Contenu                                                                                                                 | Effort     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| **1 — Situer**   | `latitude`/`longitude` sur la ferme, recherche d'adresse (BAN), carte en lecture seule, réglages, attribution OSM       | ~3 jours   |
| **2 — Dessiner** | `geometry` sur `Location`, tracé et modification (Geoman), rattachement à l'arbre existant, conversions et leurs essais | ~1 semaine |
| **3 — Relier**   | surface calculée, longueur proposée, impression du plan, Nominatim en recours, fond configurable                        | ~1 semaine |

Le **lot 1 est autonome et utile seul** : il situe la ferme, ce dont le calendrier lunaire a
besoin pour sortir de France métropolitaine (l'hémisphère sud inverse montante et
descendante). Le lot 2 apporte la valeur propre. Le lot 3 est du confort.

---

## 9. Ce qui reste à trancher

Quatre questions ont déjà leur réponse, prises le 19 septembre 2026 : **GeoJSON en colonne**
(et non PostGIS), **carte pour le plan et liste pour le travail**, **fonds au choix de
l'hébergeur**, **BAN puis Nominatim**. Restent :

1. **La licence exacte des données de la BAN**, à confirmer avant d'écrire la mention
   d'attribution : la réponse de l'API ne la porte plus dans le champ `licence`, et
   l'attribution due doit être exacte, pas approximative.
2. **Un fond français livré configuré ?** Les orthophotos de l'IGN sont libres. Les donner
   en exemple commenté dans `.env.example` est sûr ; les activer par défaut reviendrait à
   décider que Sillon est français, ce qu'il n'est pas.
3. ~~**La position de la ferme est-elle visible de toute l'équipe ?**~~ — tranché le
   19 septembre 2026 : **oui**, de quiconque peut se connecter à la ferme. Elle ne se
   **modifie** en revanche que par qui la règle, `PATCH /farms/:id` exigeant le rôle
   propriétaire. Deux essais fixent la décision, sans quoi un resserrement des droits
   passerait plus tard pour une correction.
4. **Que fait-on d'un emplacement dessiné puis supprimé** dans l'arbre ? Le polygone part
   avec — mais il faut le dire, sans quoi on croira à une perte.

---

## 10. Risques

- **L'inversion latitude/longitude.** Silencieuse, systématique, et elle place le jardin à
  des milliers de kilomètres. C'est le risque principal, et le seul remède est un essai qui
  pose un polygone connu et vérifie où il retombe.
- **La dépendance non libre glissée sans bruit.** `react-leaflet` est l'exemple du jour ;
  il y en aura d'autres. Le contrôle REUSE valide un identifiant SPDX, il ne juge pas la
  liberté de la licence — cette relecture-là reste humaine.
- **La carte qui devient le produit.** Une belle carte attire les demandes : couches,
  mesures, exports, fonds supplémentaires. Sillon est un outil de planification maraîchère,
  pas un SIG. Le parti pris de la section 2 est ce qui tient cette ligne.
- **La tentation du fond satellite propriétaire.** Il est plus joli, il est gratuit à
  l'usage, et il est interdit à la redistribution. C'est exactement le genre de raccourci
  qu'un dépôt AGPL ne peut pas se permettre.

---

## Sources

- [Leaflet](https://leafletjs.com/) — BSD-2-Clause, vérifié le 19 septembre 2026
- [Leaflet-Geoman Free](https://geoman.io/docs/leaflet) — MIT
- [react-leaflet](https://www.npmjs.com/package/react-leaflet) — Hippocratic-2.1, **écarté**
- [API Adresse (BAN)](https://adresse.data.gouv.fr/api-doc/adresse) — testée depuis ce dépôt
- [Politique d'usage de Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
- [Géoplateforme IGN](https://geoservices.ign.fr/services-geoplateforme-diffusion) — orthophotos
