// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Enrobage minimal de Leaflet (lot 1 de `brief/carte-du-jardin.md`).
//
// **Pourquoi ce fichier plutôt que `react-leaflet`** : ce dernier est publié sous licence
// Hippocratic 2.1, une licence à restrictions d'usage que ne reconnaissent ni l'OSI ni la
// FSF. L'AGPL de Sillon promet la liberté d'exécuter le programme pour n'importe quel
// usage ; une dépendance qui la retire nous ferait promettre ce qu'on ne peut pas tenir.
// Le contrôle REUSE ne l'aurait pas vu — `Hippocratic-2.1` est un identifiant SPDX valide.
//
// Leaflet lui-même est sous BSD-2-Clause. Ce qu'on perd en s'en tenant à lui tient en une
// cinquantaine de lignes : monter une carte, la détruire au démontage, poser un point.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fromGeoJsonPolygon, type GeoJsonPolygon, type LatLng } from '@sillon/core';

/** Fond par défaut. L'attribution est exigée par la licence, elle n'est pas décorative. */
/** Dernier niveau d'approche, au-delà des tuiles réellement disponibles. */
const ZOOM_MAXIMUM = 23;

/** Clé du fond retenu, par navigateur. */
const CHOIX_DU_FOND = 'sillon.fondDeCarte';

const OSM = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

export interface CarteProps {
  /** Point à montrer. Absent, la carte s'ouvre sur la France entière. */
  point?: LatLng | null;
  zoom?: number;
  /** Fond supplémentaire, à la charge du déploiement (`MAP_TILE_URL`). */
  tuiles?: { url: string; attribution: string; name: string } | null;
  /** Appelé au clic : c'est ainsi qu'on pose une position à la main. */
  onClick?: ((point: LatLng) => void) | undefined;
  /** Contours à afficher, par emplacement. */
  contours?: { id: number; nom: string; polygone: GeoJsonPolygon; actif?: boolean }[];
  /**
   * Appelé quand on clique un contour. C'est la façon naturelle de désigner ce qu'on veut
   * manipuler : on montre la planche du doigt plutôt que de la chercher dans une liste.
   */
  onContour?: ((id: number) => void) | undefined;
  /**
   * Centre de la poignée de rotation, quand il y a une sélection à faire tourner. Absent,
   * aucune poignée n'est posée.
   *
   * La poignée est **hors du composant** au sens de la décision : c'est l'appelant qui sait
   * ce qui tourne — une planche seule, ou un jardin avec toutes les siennes — et qui tient
   * l'aperçu. Ici on ne fait que rendre le geste.
   */
  poignee?: LatLng | null;
  /** Angle courant pendant le glisser, en degrés horaires depuis la position de départ. */
  onRotation?: ((degres: number) => void) | undefined;
  /** Le glisser est terminé : l'appelant enregistre. */
  onRotationFinie?: (() => void) | undefined;
  /**
   * La carte pourra-t-elle servir à dessiner ? À connaître **dès le premier rendu** :
   * Geoman s'accroche à la carte au moment où elle est créée (`addInitHook`), si bien
   * qu'il doit être chargé **avant** `L.map()`. Le charger ensuite laisse `map.pm`
   * indéfini — sans erreur au démarrage, et sans outil à l'écran.
   */
  avecDessin?: boolean;
  /** Nom du fond OpenStreetMap dans le sélecteur, traduit par l'appelant. */
  nomDuPlan?: string;
  /**
   * Appelé quand un contour est tracé. Absent, les outils restent rangés : on ne dessine
   * que lorsqu'un emplacement est choisi, sans quoi le tracé n'appartiendrait à rien.
   */
  onDessin?: ((points: LatLng[]) => void) | undefined;
  /**
   * Hauteur imposée. Absente, la carte prend celle de la classe `.carte`, qui s'adapte à
   * l'écran : haute sur un poste fixe, bornée par la fenêtre sur un téléphone — sinon
   * l'on perdrait les commandes du bas de page sans comprendre pourquoi.
   */
  hauteur?: string | undefined;
  etiquette: string;
}

export function Carte({
  point,
  zoom = 17,
  tuiles,
  onClick,
  contours,
  avecDessin = false,
  onDessin,
  onContour,
  poignee,
  onRotation,
  onRotationFinie,
  nomDuPlan = 'Plan',
  hauteur,
  etiquette,
}: CarteProps) {
  const { t } = useTranslation();
  const conteneur = useRef<HTMLDivElement | null>(null);
  const carte = useRef<L.Map | null>(null);
  const marque = useRef<L.CircleMarker | null>(null);
  // Le gestionnaire change à chaque rendu ; le garder dans une référence évite de
  // démonter et remonter la carte pour cela — un remontage perd le déplacement en cours.
  const clic = useRef(onClick);
  clic.current = onClick;
  const dessin = useRef(onDessin);
  dessin.current = onDessin;
  const couche = useRef<L.LayerGroup | null>(null);
  const poigneeCouche = useRef<L.LayerGroup | null>(null);
  const surContour = useRef(onContour);
  surContour.current = onContour;
  const surRotation = useRef(onRotation);
  surRotation.current = onRotation;
  const surRotationFinie = useRef(onRotationFinie);
  surRotationFinie.current = onRotationFinie;
  // Le parcellaire a-t-il déjà donné le cadrage ? Une référence et non un état : elle se
  // lit dans un effet voisin, et un rendu de plus n'apporterait rien.
  const cadre = useRef(false);
  // La carte naît de façon asynchrone (Geoman d'abord) : ce compteur réveille les effets
  // qui l'attendent, faute de quoi ils s'exécuteraient sur une carte pas encore là.
  const [prete, setPrete] = useState(0);
  const [pleinEcran, setPleinEcran] = useState(false);

  useEffect(() => {
    if (!conteneur.current || carte.current) return;
    let abandonne = false;

    void (async () => {
      // Geoman avant la carte, et seulement si l'on peut dessiner : il pèse près de deux
      // fois Leaflet, et qui ne dessine pas ne le télécharge pas.
      if (avecDessin) {
        await import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css');
        await import('@geoman-io/leaflet-geoman-free');
      }
      if (abandonne || !conteneur.current || carte.current) return;

      const instance = L.map(conteneur.current, {
        // La France entière : un point de départ qui ne prétend pas savoir où l'on est.
        center: [46.6, 2.4],
        zoom: 5,
        maxZoom: ZOOM_MAXIMUM,
        attributionControl: true,
      });
      // OSM est toujours là : c'est le seul fond que Sillon livre, et le seul dont il
      // garantisse la licence. Un fond configuré **s'ajoute** au lieu de le remplacer —
      // sinon on perdrait le plan des rues, qui reste le plus lisible pour se repérer.
      // `maxNativeZoom` est le dernier niveau où les tuiles **existent** ; `maxZoom` est
      // le dernier où la carte se laisse approcher. Au-delà du premier, Leaflet agrandit
      // la dernière tuile disponible : l'image devient floue, mais on voit ce qu'on fait.
      //
      // C'est nécessaire, pas cosmétique. Au niveau 19, à nos latitudes, un pixel vaut
      // environ 22 cm : une planche de 80 cm tient dans quatre pixels, et la dessiner à la
      // souris relève de la devinette. Vérifié le 19 septembre 2026 : OpenStreetMap comme
      // les orthophotos de l'IGN répondent 404 au-delà de 19.
      const plan = L.tileLayer(OSM.url, {
        attribution: OSM.attribution,
        maxNativeZoom: 19,
        maxZoom: ZOOM_MAXIMUM,
      });
      const supplementaire = tuiles
        ? L.tileLayer(tuiles.url, {
            attribution: tuiles.attribution,
            maxNativeZoom: 19,
            maxZoom: ZOOM_MAXIMUM,
          })
        : null;

      // Le choix se retient d'une visite à l'autre : on ne veut pas rebasculer sur
      // l'aérien à chaque ouverture. `try` parce qu'un navigateur peut refuser le stockage
      // (navigation privée), et qu'une carte ne doit pas disparaître pour autant.
      let prefere = '';
      try {
        prefere = localStorage.getItem(CHOIX_DU_FOND) ?? '';
      } catch {
        /* stockage indisponible */
      }
      const aerienDabord = supplementaire !== null && prefere === tuiles?.name;
      (aerienDabord ? supplementaire! : plan).addTo(instance);

      if (supplementaire && tuiles) {
        L.control
          .layers({ [nomDuPlan]: plan, [tuiles.name]: supplementaire }, undefined, {
            position: 'topleft',
          })
          .addTo(instance);
        instance.on('baselayerchange', (evenement) => {
          try {
            localStorage.setItem(CHOIX_DU_FOND, evenement.name);
          } catch {
            /* stockage indisponible */
          }
        });
      }
      instance.on('click', (evenement) => {
        // `wrap()` ramène la longitude dans [-180, 180]. Leaflet répète le monde
        // horizontalement : après quelques tours, un clic rend 190° ou -400°, que l'API
        // refuse — et l'écran ne dirait rien, le clic semblerait simplement sans effet.
        const position = evenement.latlng.wrap();
        clic.current?.({ lat: position.lat, lng: position.lng });
      });
      instance.on('pm:create', (evenement) => {
        const trace = (evenement as unknown as { layer: L.Polygon }).layer;
        const anneau = trace.getLatLngs()[0] as L.LatLng[];
        // Le tracé est retiré aussitôt : c'est la réponse du serveur qui fait foi, et
        // garder les deux ferait apparaître deux contours superposés à la moindre
        // divergence.
        trace.remove();
        dessin.current?.(anneau.map((sommet) => ({ lat: sommet.lat, lng: sommet.lng })));
      });

      couche.current = L.layerGroup().addTo(instance);
      poigneeCouche.current = L.layerGroup().addTo(instance);
      carte.current = instance;
      setPrete((compteur) => compteur + 1);
    })();

    return () => {
      abandonne = true;
      carte.current?.remove();
      carte.current = null;
      marque.current = null;
      couche.current = null;
      poigneeCouche.current = null;
      cadre.current = false;
    };
    // Monté une fois : le fond et la possibilité de dessiner ne changent pas en cours de
    // vie de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = carte.current;
    if (!instance) return;

    if (!point) {
      marque.current?.remove();
      marque.current = null;
      return;
    }

    // Un cercle plutôt que le marqueur par défaut : les icônes de Leaflet se chargent par
    // des chemins relatifs que les empaqueteurs cassent silencieusement, et un marqueur
    // invisible ressemble à une carte qui ne marche pas.
    const position: L.LatLngExpression = [point.lat, point.lng];
    if (marque.current) marque.current.setLatLng(position);
    else {
      marque.current = L.circleMarker(position, {
        radius: 9,
        weight: 3,
        color: '#4d7c0f',
        fillColor: '#4d7c0f',
        fillOpacity: 0.35,
      }).addTo(instance);
    }
    // Le parcellaire commande le cadrage quand il existe : recentrer ici le défairait,
    // les deux effets se déclenchant dans un ordre qui dépend de l'arrivée des requêtes.
    if (!cadre.current) instance.setView(position, zoom);
  }, [point, zoom, prete]);

  // Les outils suivent le choix d'un emplacement : on ne dessine que pour quelqu'un.
  useEffect(() => {
    const instance = carte.current;
    if (!instance?.pm) return;

    if (onDessin) {
      // Réduits au strict nécessaire : tracer un polygone, le modifier, le supprimer. Un
      // cercle n'est pas une planche, et chaque bouton de plus est un bouton à comprendre.
      instance.pm.addControls({
        position: 'topright',
        drawMarker: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        cutPolygon: false,
        rotateMode: false,
      });
    } else {
      instance.pm.removeControls();
    }
  }, [onDessin, prete]);

  useEffect(() => {
    const groupe = couche.current;
    const instance = carte.current;
    if (!groupe || !instance) return;

    groupe.clearLayers();
    if (!contours || contours.length === 0) return;

    for (const contour of contours) {
      const sommets = fromGeoJsonPolygon(contour.polygone).map(
        (sommet) => [sommet.lat, sommet.lng] as L.LatLngExpression,
      );
      const trace = L.polygon(sommets, {
        color: contour.actif ? '#b45309' : '#4d7c0f',
        weight: contour.actif ? 3 : 2,
        fillOpacity: contour.actif ? 0.35 : 0.18,
      })
        .bindTooltip(contour.nom)
        .addTo(groupe);

      trace.on('click', (evenement) => {
        // Sans cela, le clic traverse jusqu'à la carte et **pose la position de la ferme**
        // au lieu de sélectionner la planche : deux gestes radicalement différents pour
        // un seul clic, et le second est difficile à défaire.
        L.DomEvent.stopPropagation(evenement);
        surContour.current?.(contour.id);
      });
    }

    // Cadrer sur ce qui est **dessiné**, et non sur le point de la ferme.
    //
    // L'inverse était fait jusqu'ici, et donnait le pire des deux : dès que la ferme avait
    // une position, la carte s'ouvrait dessus à un zoom fixe et le parcellaire pouvait
    // tomber hors champ — visible sur la carte, invisible à l'écran. Le point situe la
    // ferme ; les planches sont ce qu'on vient regarder, et elles se suffisent à
    // elles-mêmes. Sans contour, l'effet du point reprend la main.
    //
    // `LayerGroup` n'a pas d'emprise : on l'assemble à partir des contours posés.
    const limites = L.latLngBounds([]);
    groupe.eachLayer((couchePosee) => {
      if (couchePosee instanceof L.Polygon) limites.extend(couchePosee.getBounds());
    });
    // Un jardin de six planches tient dans quelques dizaines de mètres : sans plafond,
    // `fitBounds` irait au zoom maximum et l'on ne verrait plus que des tuiles floues.
    if (limites.isValid()) {
      instance.fitBounds(limites, { padding: [32, 32], maxZoom: 20 });
      cadre.current = true;
    }
  }, [contours, prete]);

  /**
   * La poignée de rotation : un marqueur qu'on tire autour du centre de la sélection.
   *
   * **L'angle se lit sur l'écran, pas sur la carte.** On compare la position du curseur au
   * centre en **pixels**, et non en degrés : un degré de longitude ne vaut pas un degré de
   * latitude, et calculer l'angle sur les coordonnées ferait tourner le parcellaire plus
   * vite d'un côté que de l'autre — un geste qui ne suit pas la main.
   *
   * L'aperçu est rendu par l'appelant, qui seul sait ce qui tourne : ici on n'émet que
   * l'angle. Le pas de cinq degrés est ce qui rend l'alignement d'un parcellaire possible
   * à la souris ; sans lui on vise au pixel et on n'y arrive pas.
   */
  useEffect(() => {
    const instance = carte.current;
    const groupe = poigneeCouche.current;
    if (!instance || !groupe) return;

    groupe.clearLayers();
    if (!poignee) return;

    const centre = L.latLng(poignee.lat, poignee.lng);
    const enPixels = (position: L.LatLng) => instance.latLngToContainerPoint(position);
    // Quarante pixels au nord du centre : une distance constante à l'écran, donc une
    // poignée qui reste saisissable quel que soit le zoom.
    const posePoignee = () =>
      instance.containerPointToLatLng(enPixels(centre).subtract(L.point(0, 40)));

    const angleDepuisCentre = (position: L.LatLng) => {
      const c = enPixels(centre);
      const p = enPixels(position);
      // `atan2` compte en sens trigonométrique et l'écran a son y vers le bas : le signe
      // remet le geste dans le sens horaire, celui qu'attend la main.
      return (Math.atan2(p.x - c.x, c.y - p.y) * 180) / Math.PI;
    };

    const depart = posePoignee();
    const angleDepart = angleDepuisCentre(depart);

    L.circleMarker(centre, {
      radius: 4,
      weight: 2,
      color: '#b45309',
      fillColor: '#b45309',
      fillOpacity: 1,
      interactive: false,
    }).addTo(groupe);
    const tige = L.polyline([centre, depart], {
      color: '#b45309',
      weight: 2,
      dashArray: '4 3',
      interactive: false,
    }).addTo(groupe);

    const marqueur = L.marker(depart, {
      draggable: true,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: '<div class="carte-poignee" title="Faire pivoter">⟳</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(groupe);

    const surGlisse = () => {
      const position = marqueur.getLatLng();
      tige.setLatLngs([centre, position]);
      const brut = angleDepuisCentre(position) - angleDepart;
      surRotation.current?.(Math.round(brut / 5) * 5);
    };

    marqueur.on('drag', surGlisse);
    marqueur.on('dragend', () => {
      surRotationFinie.current?.();
      // La poignée revient au nord : l'aperçu est retombé à zéro une fois enregistré, et
      // la laisser où elle est ferait croire que l'angle court encore.
      marqueur.setLatLng(posePoignee());
      tige.setLatLngs([centre, posePoignee()]);
    });

    return () => {
      marqueur.off();
      groupe.clearLayers();
    };
  }, [poignee, prete]);

  /**
   * Prévenir Leaflet que son conteneur a changé de taille.
   *
   * Leaflet mesure le conteneur au montage et n'y revient pas. Agrandir la carte sans le
   * lui dire laisse la moitié de la surface en **tuiles grises** — la carte a l'air
   * cassée, et rien dans la console ne l'explique. Le délai zéro laisse le navigateur
   * appliquer la nouvelle mise en page avant la mesure.
   */
  useEffect(() => {
    const instance = carte.current;
    if (!instance) return;
    const minuteur = window.setTimeout(() => instance.invalidateSize(), 0);
    return () => window.clearTimeout(minuteur);
  }, [pleinEcran, prete]);

  // Échap referme, comme partout ailleurs dans Sillon : une carte en plein écran masque
  // la navigation, et il faut pouvoir en sortir sans chercher le bouton.
  useEffect(() => {
    if (!pleinEcran) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') setPleinEcran(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [pleinEcran]);

  return (
    <div
      className={pleinEcran ? 'fixed inset-0 z-50 bg-earth-50 p-2 dark:bg-earth-900' : 'relative'}
    >
      <div
        ref={conteneur}
        role="application"
        aria-label={etiquette}
        className={`w-full rounded-lg border border-earth-200 dark:border-earth-700 ${
          pleinEcran ? 'h-full' : hauteur ? '' : 'carte'
        }`}
        {...(hauteur && !pleinEcran ? { style: { height: hauteur } } : {})}
      />
      {/* Au-dessus des commandes de Leaflet, qui montent à 1000. Un `z-10` suffirait à
          l'écran et laisserait le bouton sous le sélecteur de fond dès qu'un déploiement
          en configure un : la panne serait invisible ici et visible chez l'utilisateur. */}
      <button
        type="button"
        className="btn-ghost no-print absolute right-3 top-3 z-[1100] min-h-11 w-11 px-0"
        // En plein écran, la carte couvre la barre d'état : sans l'encoche, le bouton de
        // sortie passerait dessous sur un téléphone, et l'on ne pourrait plus refermer
        // autrement qu'au clavier — que ces appareils n'ont pas.
        {...(pleinEcran ? { style: { top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' } } : {})}
        aria-pressed={pleinEcran}
        aria-label={pleinEcran ? t('map.exitFullscreen') : t('map.fullscreen')}
        title={pleinEcran ? t('map.exitFullscreen') : t('map.fullscreen')}
        onClick={() => setPleinEcran((etat) => !etat)}
      >
        <span aria-hidden>{pleinEcran ? '⤡' : '⤢'}</span>
      </button>
    </div>
  );
}
