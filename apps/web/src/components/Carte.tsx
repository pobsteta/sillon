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
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fromGeoJsonPolygon, type GeoJsonPolygon, type LatLng } from '@sillon/core';

/** Fond par défaut. L'attribution est exigée par la licence, elle n'est pas décorative. */
const OSM = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

export interface CarteProps {
  /** Point à montrer. Absent, la carte s'ouvre sur la France entière. */
  point?: LatLng | null;
  zoom?: number;
  /** Fond supplémentaire, à la charge du déploiement (`MAP_TILE_URL`). */
  tuiles?: { url: string; attribution: string } | null;
  /** Appelé au clic : c'est ainsi qu'on pose une position à la main. */
  onClick?: ((point: LatLng) => void) | undefined;
  /** Contours à afficher, par emplacement. */
  contours?: { id: number; nom: string; polygone: GeoJsonPolygon; actif?: boolean }[];
  /**
   * La carte pourra-t-elle servir à dessiner ? À connaître **dès le premier rendu** :
   * Geoman s'accroche à la carte au moment où elle est créée (`addInitHook`), si bien
   * qu'il doit être chargé **avant** `L.map()`. Le charger ensuite laisse `map.pm`
   * indéfini — sans erreur au démarrage, et sans outil à l'écran.
   */
  avecDessin?: boolean;
  /**
   * Appelé quand un contour est tracé. Absent, les outils restent rangés : on ne dessine
   * que lorsqu'un emplacement est choisi, sans quoi le tracé n'appartiendrait à rien.
   */
  onDessin?: ((points: LatLng[]) => void) | undefined;
  hauteur?: string;
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
  hauteur = '24rem',
  etiquette,
}: CarteProps) {
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
  // La carte naît de façon asynchrone (Geoman d'abord) : ce compteur réveille les effets
  // qui l'attendent, faute de quoi ils s'exécuteraient sur une carte pas encore là.
  const [prete, setPrete] = useState(0);

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
        attributionControl: true,
      });
      const fond = tuiles ?? OSM;
      L.tileLayer(fond.url, { attribution: fond.attribution, maxZoom: 19 }).addTo(instance);
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
      carte.current = instance;
      setPrete((compteur) => compteur + 1);
    })();

    return () => {
      abandonne = true;
      carte.current?.remove();
      carte.current = null;
      marque.current = null;
      couche.current = null;
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
    instance.setView(position, zoom);
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
      L.polygon(sommets, {
        color: contour.actif ? '#b45309' : '#4d7c0f',
        weight: contour.actif ? 3 : 2,
        fillOpacity: contour.actif ? 0.35 : 0.18,
      })
        .bindTooltip(contour.nom)
        .addTo(groupe);
    }

    // Cadrer sur ce qui est dessiné, sauf si un point précis est demandé : sans cela, on
    // ouvrirait la carte sur la France entière alors que le parcellaire est tracé.
    // `LayerGroup` n'a pas d'emprise — on l'assemble à partir des contours posés.
    if (!point) {
      const limites = L.latLngBounds([]);
      groupe.eachLayer((couchePosee) => {
        if (couchePosee instanceof L.Polygon) limites.extend(couchePosee.getBounds());
      });
      if (limites.isValid()) instance.fitBounds(limites, { padding: [24, 24] });
    }
  }, [contours, point, prete]);

  return (
    <div
      ref={conteneur}
      role="application"
      aria-label={etiquette}
      className="w-full rounded-lg border border-earth-200 dark:border-earth-700"
      style={{ height: hauteur }}
    />
  );
}
