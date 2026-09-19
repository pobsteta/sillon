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

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '@sillon/core';

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
  hauteur?: string;
  etiquette: string;
}

export function Carte({
  point,
  zoom = 17,
  tuiles,
  onClick,
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

  useEffect(() => {
    if (!conteneur.current || carte.current) return;

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
    carte.current = instance;

    return () => {
      instance.remove();
      carte.current = null;
      marque.current = null;
    };
    // Monté une fois : le fond ne change pas en cours de vie de l'écran.
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
  }, [point, zoom]);

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
