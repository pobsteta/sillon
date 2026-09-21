// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Situer la ferme (lot 1 de `brief/carte-du-jardin.md`).
//
// Cet écran ne dessine rien : il pose un point. Le tracé des planches est le lot 2, et
// l'assolement — qui place les séries — ne bouge pas : la carte sert au plan, la liste au
// travail.
//
// La recherche d'adresse est le seul endroit où Sillon parle à l'extérieur. Elle ne part
// donc jamais à la frappe, l'écran dit où la requête va avant qu'elle n'y aille, et elle
// peut être éteinte au déploiement.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  arrondirLatLng,
  centroidOfAll,
  toGeoJsonPolygon,
  isLatitude,
  isLongitude,
  fromGeoJsonPolygon,
  isGeoJsonPolygon,
  longestSideMm,
  polygonArea,
  rotateAround,
  type GeoJsonPolygon,
  type LatLng,
} from '@sillon/core';
import { api, useFarm, useFarmMutation, useLocations } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import { Carte } from '../components/Carte.js';
import { ErrorNotice, Field, Loading, PageHeader, Select } from '../components/ui.js';

interface Adresse {
  label: string;
  latitude: number;
  longitude: number;
  score: number;
}

export function MapPage() {
  const { t } = useTranslation();
  // Décision du 19 septembre 2026 : la position de la ferme se voit de toute l'équipe.
  // Elle ne se **modifie** que par qui règle la ferme — `PATCH /farms/:id` exige le rôle
  // propriétaire, et proposer des boutons que l'API refuserait serait une promesse creuse.
  const { session, farm, canManageFarm } = useCurrentSession();
  const farmId = farm?.id ?? 0;
  const reglages = useFarm(farmId);

  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<Adresse[] | null>(null);
  const [saisie, setSaisie] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  // L'emplacement que le prochain tracé viendra dessiner. Sans ce choix explicite, un
  // polygone posé sur la carte n'appartiendrait à rien.
  const [cible, setCible] = useState('');
  const [mesure, setMesure] = useState<{
    nom: string;
    areaM2: number;
    longestSideMm: number;
  } | null>(null);
  const [applique, setApplique] = useState(false);
  const [angle, setAngle] = useState('15');
  const [pivote, setPivote] = useState<number | null>(null);
  /** Angle du glisser en cours, en degrés horaires. Nul quand la poignée est au repos. */
  const [apercu, setApercu] = useState(0);
  /** Dimensions saisies pour l'emplacement choisi : mètres et centimètres, comme au champ. */
  const [dimensions, setDimensions] = useState<{ longueur: string; largeur: string }>({
    longueur: '',
    largeur: '',
  });
  const [dimensionsEnregistrees, setDimensionsEnregistrees] = useState(false);
  const emplacements = useLocations(farmId);

  const chercher = useMutation({
    mutationFn: (q: string) =>
      api<{ results: Adresse[] }>(
        `/api/farms/${farmId}/geocode?q=${encodeURIComponent(q)}&limit=5`,
      ),
    onSuccess: (reponse) => setResultats(reponse.results),
  });

  const enregistrer = useFarmMutation(farmId, (point: LatLng | null) =>
    api(`/api/farms/${farmId}`, {
      method: 'PATCH',
      body: point
        ? { latitude: point.lat, longitude: point.lng }
        : { latitude: null, longitude: null },
    }),
  );

  /**
   * Ce qui tourne quand on tire la poignée : la sélection **et toute sa descendance**.
   *
   * C'est la règle qui rend le geste utile. Sélectionner un jardin et le faire pivoter
   * doit emmener ses planches — sans quoi le jardin se déplacerait autour d'elles, ce qui
   * n'a aucun sens sur le terrain. Sélectionner une planche ne fait tourner qu'elle.
   *
   * On descend l'arbre par `parentId` plutôt que de s'arrêter aux enfants directs : un
   * parcellaire peut compter des sous-jardins, et n'en prendre qu'un niveau laisserait des
   * planches derrière, silencieusement.
   */
  const descendance = (racine: number): number[] => {
    const tous = emplacements.data ?? [];
    const retenus = [racine];
    for (let i = 0; i < retenus.length; i += 1) {
      const parent = retenus[i]!;
      for (const lieu of tous) if (lieu.parentId === parent) retenus.push(lieu.id);
    }
    return retenus;
  };

  const aFaireTourner = cible
    ? descendance(Number(cible)).filter((id) =>
        isGeoJsonPolygon((emplacements.data ?? []).find((lieu) => lieu.id === id)?.geometry),
      )
    : [];

  // Le centre commun : tout le bloc tourne autour de lui, en gardant ses passe-pieds.
  // Chacune sur son propre centre les ferait tourner en croix.
  const sommetsDuBloc = aFaireTourner
    .map((id) => (emplacements.data ?? []).find((lieu) => lieu.id === id)!.geometry)
    .map((geometrie) => fromGeoJsonPolygon(geometrie as GeoJsonPolygon));
  const centreDuBloc = sommetsDuBloc.length > 0 ? centroidOfAll(sommetsDuBloc) : null;

  const contours = (emplacements.data ?? [])
    .filter((lieu) => isGeoJsonPolygon(lieu.geometry))
    .map((lieu) => {
      const sommets = fromGeoJsonPolygon(lieu.geometry as GeoJsonPolygon);
      // L'aperçu se calcule ici et ne touche pas la base : tant que la poignée n'est pas
      // lâchée, rien n'est enregistré, et relâcher hors de la carte ne laisse pas un
      // parcellaire à moitié tourné.
      const tourne =
        apercu !== 0 && centreDuBloc && aFaireTourner.includes(lieu.id)
          ? toGeoJsonPolygon(rotateAround(sommets, apercu, centreDuBloc))
          : (lieu.geometry as GeoJsonPolygon);
      return {
        id: lieu.id,
        nom: lieu.name,
        polygone: tourne,
        actif: aFaireTourner.includes(lieu.id),
      };
    });

  const dessiner = useFarmMutation(
    farmId,
    ({ id, points }: { id: number; points: LatLng[] | null }) =>
      api<{ measured: { areaM2: number; longestSideMm: number } | null }>(
        `/api/farms/${farmId}/locations/${id}/geometry`,
        { method: 'PUT', body: { points } },
      ),
    {
      onSuccess: (reponse, entree) => {
        const lieu = (emplacements.data ?? []).find((candidat) => candidat.id === entree.id);
        setMesure(reponse.measured ? { nom: lieu?.name ?? '', ...reponse.measured } : null);
      },
    },
  );

  /**
   * Les dimensions saisies à la main.
   *
   * Elles priment sur la mesure du tracé : `bedLength` alimente les calculs de semences,
   * de rendement et de commande, et un contour tracé au doigt ne doit pas en devenir la
   * base tout seul. Le tracé propose, la saisie décide.
   */
  const enregistrerDimensions = useFarmMutation(
    farmId,
    ({ id, bedLength, bedWidth }: { id: number; bedLength: number; bedWidth: number | null }) =>
      api(`/api/farms/${farmId}/locations/${id}`, {
        method: 'PATCH',
        body: { bedLength, bedWidth },
      }),
    { onSuccess: () => setDimensionsEnregistrees(true) },
  );

  const appliquerMesure = useFarmMutation(
    farmId,
    ({ id, bedLength }: { id: number; bedLength: number }) =>
      api(`/api/farms/${farmId}/locations/${id}`, { method: 'PATCH', body: { bedLength } }),
    { onSuccess: () => setApplique(true) },
  );

  /**
   * Fait pivoter des emplacements autour de leur centre **commun**.
   *
   * Autour d'un centre commun, et non chacun sur soi : un bloc de planches mal orienté se
   * redresse d'un bloc, en gardant ses passe-pieds. Chacune sur place les ferait tourner
   * en croix et le parcellaire n'aurait plus de sens.
   */
  const pivoter = useFarmMutation(
    farmId,
    async ({ ids, degres }: { ids: number[]; degres: number }) => {
      const contours = ids
        .map((id) => (emplacements.data ?? []).find((lieu) => lieu.id === id))
        .filter((lieu): lieu is NonNullable<typeof lieu> => isGeoJsonPolygon(lieu?.geometry))
        .map((lieu) => ({
          id: lieu.id,
          sommets: fromGeoJsonPolygon(lieu.geometry as GeoJsonPolygon),
        }));
      if (contours.length === 0) return 0;

      const centre = centroidOfAll(contours.map((contour) => contour.sommets));
      for (const contour of contours) {
        await api(`/api/farms/${farmId}/locations/${contour.id}/geometry`, {
          method: 'PUT',
          body: { points: rotateAround(contour.sommets, degres, centre) },
        });
      }
      return contours.length;
    },
    { onSuccess: (nombre) => setPivote(nombre as number) },
  );

  if (!farm || reglages.isLoading) return <Loading />;

  const position =
    reglages.data?.latitude != null && reglages.data?.longitude != null
      ? { lat: reglages.data.latitude, lng: reglages.data.longitude }
      : null;

  const poser = (point: LatLng) => {
    const arrondi = arrondirLatLng(point);
    setSaisie({ lat: String(arrondi.lat), lng: String(arrondi.lng) });
    enregistrer.mutate(arrondi);
  };

  /**
   * La saisie manuelle tient-elle debout ?
   *
   * **`Number('')` vaut zéro, et zéro est un nombre fini.** La condition précédente
   * acceptait donc deux champs vides et envoyait la ferme par 0°, 0° — au large du golfe
   * de Guinée. Rien ne plantait, l'enregistrement réussissait, et la carte s'ouvrait en
   * plein océan sans que personne comprenne d'où venait le point.
   */
  /**
   * Choisir un emplacement, d'où que vienne le geste — la liste ou un clic sur la carte.
   *
   * Un seul chemin pour deux gestes : sans cela, cliquer un contour aurait laissé le
   * tiroir sur les dimensions du précédent, et l'on aurait saisi la longueur d'une planche
   * dans une autre sans rien voir passer.
   */
  const choisirEmplacement = (identifiant: string) => {
    setCible(identifiant);
    setApplique(false);
    setDimensionsEnregistrees(false);
    setApercu(0);

    const lieu = (emplacements.data ?? []).find((candidat) => String(candidat.id) === identifiant);
    // Millimètres en base, mètres à l'écran ; centièmes de millimètre pour la largeur,
    // centimètres à l'écran. La conversion n'a lieu qu'ici, au bord.
    setDimensions({
      longueur: lieu?.bedLength ? String(lieu.bedLength / 1000) : '',
      largeur: lieu?.bedWidth ? String(lieu.bedWidth / 10) : '',
    });

    // Un emplacement déjà dessiné montre sa mesure tout de suite : la calculer ici évite
    // d'obliger à retracer un contour pour la relire, et le noyau est la même bibliothèque
    // que celle du serveur — les deux ne peuvent pas diverger.
    if (lieu && isGeoJsonPolygon(lieu.geometry)) {
      const sommets = fromGeoJsonPolygon(lieu.geometry);
      setMesure({
        nom: lieu.name,
        areaM2: polygonArea(sommets),
        longestSideMm: longestSideMm(sommets),
      });
    } else {
      setMesure(null);
    }
  };

  /** Une longueur de planche doit être un nombre positif : zéro n'est pas une planche. */
  const longueurValide = (() => {
    const brut = dimensions.longueur.trim().replace(',', '.');
    if (brut === '') return false;
    const valeur = Number(brut);
    return Number.isFinite(valeur) && valeur > 0;
  })();

  const saisieValide = (() => {
    const lat = saisie.lat.trim();
    const lng = saisie.lng.trim();
    if (lat === '' || lng === '') return false;
    return isLatitude(Number(lat)) && isLongitude(Number(lng));
  })();

  return (
    <>
      <PageHeader title={t('map.title')}>
        {/* Le plan s'emporte ou s'affiche dans la remise : c'est un usage à part entière,
            et l'impression masque tout ce qui ne sert qu'à l'écran. */}
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          {t('common.print')}
        </button>
        {position ? (
          <span className="chip bg-earth-100 tabular-nums dark:bg-earth-700">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </span>
        ) : null}
      </PageHeader>

      {/* Deux colonnes sur grand écran, empilé sur téléphone.
          Agrandir la carte sans toucher à la mise en page l'avait rendue haute de 82 %
          de la fenêtre — et avait poussé ses outils, dessin et rotation compris, sous la
          ligne de flottaison. On ne voyait plus ce qui sert à s'en servir. Les mettre à
          côté rend les deux visibles en même temps, ce qui est la seule disposition qui
          ait du sens pour tracer une planche : on regarde la carte, on règle à droite. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="min-w-0">
          <Carte
            point={position}
            etiquette={t('map.mapLabel')}
            contours={contours}
            avecDessin={canManageFarm}
            nomDuPlan={t('map.planLayer')}
            {...(canManageFarm && cible
              ? { onDessin: (points: LatLng[]) => dessiner.mutate({ id: Number(cible), points }) }
              : {})}
            {...(canManageFarm && !cible ? { onClick: poser } : {})}
            {...(canManageFarm
              ? { onContour: (id: number) => choisirEmplacement(String(id)) }
              : {})}
            {...(canManageFarm && centreDuBloc ? { poignee: centreDuBloc } : {})}
            onRotation={setApercu}
            onRotationFinie={() => {
              if (apercu !== 0 && aFaireTourner.length > 0) {
                pivoter.mutate({ ids: aFaireTourner, degres: apercu });
              }
              setApercu(0);
            }}
            {...(session?.map ? { tuiles: session.map } : {})}
          />
          {canManageFarm && centreDuBloc ? (
            <p className="mt-2 text-xs text-earth-700 dark:text-earth-200">
              {t('map.handleHint', { count: aFaireTourner.length })}
              {apercu !== 0 ? ` · ${apercu > 0 ? '+' : ''}${apercu}°` : ''}
            </p>
          ) : null}
          {canManageFarm && !cible ? (
            <p className="mt-2 text-xs text-earth-700 dark:text-earth-200">{t('map.clickHint')}</p>
          ) : null}
          {!position ? (
            <p className="mt-2 text-sm text-earth-700 dark:text-earth-200">
              {canManageFarm ? t('map.notSetYet') : t('map.notSetByOwner')}
            </p>
          ) : null}
        </div>

        {/* La colonne des outils défile pour elle-même : la carte reste en vue pendant
            qu'on cherche une adresse ou qu'on règle un angle. */}
        <div className="space-y-4 lg:sticky lg:top-16 lg:max-h-[82vh] lg:overflow-y-auto lg:pr-1">
          {canManageFarm ? (
            <section className="card no-print">
              <h2 className="mb-1 text-lg font-semibold">{t('map.search')}</h2>
              {/* Dire où part la requête, avant qu'elle ne parte. */}
              <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
                {t('map.searchHint')}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <Field
                    label={t('map.address')}
                    value={recherche}
                    onChange={(event) => setRecherche(event.target.value)}
                    placeholder={t('map.addressPlaceholder')}
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={recherche.trim().length < 3 || chercher.isPending}
                  onClick={() => chercher.mutate(recherche.trim())}
                >
                  {chercher.isPending ? t('map.searching') : t('map.searchAction')}
                </button>
              </div>

              {chercher.error ? <ErrorNotice error={chercher.error} /> : null}
              {resultats?.length === 0 ? (
                <p className="mt-3 text-sm text-earth-700 dark:text-earth-200">
                  {t('map.noResult')}
                </p>
              ) : null}
              {resultats && resultats.length > 0 ? (
                <ul className="mt-3 divide-y divide-earth-100 dark:divide-earth-700">
                  {resultats.map((adresse) => (
                    <li
                      key={`${adresse.label}-${adresse.latitude}`}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0 truncate">{adresse.label}</span>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => poser({ lat: adresse.latitude, lng: adresse.longitude })}
                      >
                        {t('map.use')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {canManageFarm ? (
            <section className="card no-print">
              <h2 className="mb-1 text-lg font-semibold">{t('map.draw')}</h2>
              <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('map.drawHint')}</p>
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  label={t('map.target')}
                  value={cible}
                  onChange={(event) => {
                    const choisi = event.target.value;
                    choisirEmplacement(choisi);
                  }}
                >
                  <option value="">{t('map.targetNone')}</option>
                  {(emplacements.data ?? []).map((lieu) => (
                    <option key={lieu.id} value={lieu.id}>
                      {lieu.name}
                      {isGeoJsonPolygon(lieu.geometry) ? ` — ${t('map.alreadyDrawn')}` : ''}
                    </option>
                  ))}
                </Select>
                {cible &&
                isGeoJsonPolygon(
                  (emplacements.data ?? []).find((lieu) => String(lieu.id) === cible)?.geometry,
                ) ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => dessiner.mutate({ id: Number(cible), points: null })}
                  >
                    {t('map.eraseOutline')}
                  </button>
                ) : null}
              </div>
              {/* La mesure se **propose**. `bedLength` sert aux calculs de semences et de
              commande : un tracé au doigt ne doit pas en devenir la base tout seul. */}
              {mesure ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p role="status" className="text-sm">
                    {t('map.measured', {
                      nom: mesure.nom,
                      surface: mesure.areaM2,
                      longueur: (mesure.longestSideMm / 1000).toFixed(1),
                    })}
                  </p>
                  {/* La mesure ne remplace la longueur saisie que si on le demande. Cette
                  valeur sert aux calculs de semences, de rendement et de commande : un
                  tracé au doigt ne doit pas en devenir la base tout seul. */}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      appliquerMesure.mutate({
                        id: Number(cible),
                        bedLength: mesure.longestSideMm,
                      })
                    }
                  >
                    {t('map.useMeasure', { longueur: (mesure.longestSideMm / 1000).toFixed(1) })}
                  </button>
                </div>
              ) : null}
              {applique ? (
                <p role="status" className="mt-2 text-sm text-sillon-800 dark:text-sillon-200">
                  {t('map.measureApplied')}
                </p>
              ) : null}

              {/* Les dimensions, saisies à la main.
                  Elles **priment** sur la mesure du tracé, et c'est le bon ordre :
                  `bedLength` alimente les calculs de semences, de rendement et de
                  commande. Un contour tracé au doigt vaut ce que vaut le doigt ; une
                  longueur relevée au décamètre vaut ce que vaut le décamètre. Le tracé
                  propose, la saisie décide — et aucune des deux ne modifie l'autre. */}
              {cible ? (
                <div className="mt-4 border-t border-earth-200 pt-4 dark:border-earth-700">
                  <h3 className="mb-1 font-medium">{t('map.dimensions')}</h3>
                  <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
                    {t('map.dimensionsHint')}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={t('map.bedLength')}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.1"
                      value={dimensions.longueur}
                      onChange={(event) => {
                        setDimensions({ ...dimensions, longueur: event.target.value });
                        setDimensionsEnregistrees(false);
                      }}
                    />
                    <Field
                      label={t('map.bedWidth')}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="1"
                      value={dimensions.largeur}
                      onChange={(event) => {
                        setDimensions({ ...dimensions, largeur: event.target.value });
                        setDimensionsEnregistrees(false);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-ghost mt-3"
                    disabled={!longueurValide || enregistrerDimensions.isPending}
                    onClick={() =>
                      enregistrerDimensions.mutate({
                        id: Number(cible),
                        bedLength: Math.round(Number(dimensions.longueur.replace(',', '.')) * 1000),
                        // Largeur vide : on l'efface plutôt que d'imposer un zéro, que les
                        // calculs prendraient pour une planche sans largeur.
                        bedWidth:
                          dimensions.largeur.trim() === ''
                            ? null
                            : Math.round(Number(dimensions.largeur.replace(',', '.')) * 10),
                      })
                    }
                  >
                    {/* Un libellé propre, et non « Enregistrer » : l'écran en porte déjà
                        un pour la saisie des coordonnées. Deux boutons du même nom sur la
                        même page s'annoncent à l'identique au lecteur d'écran. */}
                    {t('map.saveDimensions')}
                  </button>
                  {dimensionsEnregistrees ? (
                    <p role="status" className="mt-2 text-sm text-sillon-800 dark:text-sillon-200">
                      {t('map.dimensionsSaved')}
                    </p>
                  ) : null}
                  {enregistrerDimensions.error ? (
                    <ErrorNotice error={enregistrerDimensions.error} />
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 border-t border-earth-200 pt-4 dark:border-earth-700">
                <h3 className="mb-1 font-medium">{t('map.rotate')}</h3>
                <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
                  {t('map.rotateHint')}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field
                    label={t('map.angle')}
                    type="number"
                    min={-360}
                    max={360}
                    value={angle}
                    onChange={(event) => setAngle(event.target.value)}
                    hint={t('map.angleHint')}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!cible || pivoter.isPending}
                    onClick={() => pivoter.mutate({ ids: [Number(cible)], degres: Number(angle) })}
                  >
                    {t('map.rotateOne')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={pivoter.isPending || contours.length === 0}
                    onClick={() =>
                      pivoter.mutate({
                        ids: contours.map((contour) => contour.id),
                        degres: Number(angle),
                      })
                    }
                  >
                    {t('map.rotateAll', { count: contours.length })}
                  </button>
                </div>
                {pivote !== null ? (
                  <p role="status" className="mt-2 text-sm">
                    {t('map.rotated', { count: pivote, angle })}
                  </p>
                ) : null}
                {pivoter.error ? <ErrorNotice error={pivoter.error} /> : null}
              </div>
              {dessiner.error ? <ErrorNotice error={dessiner.error} /> : null}
            </section>
          ) : null}

          {canManageFarm ? (
            <section className="card no-print">
              <h2 className="mb-1 text-lg font-semibold">{t('map.manual')}</h2>
              <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">
                {t('map.manualHint')}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label={t('map.latitude')}
                  inputMode="decimal"
                  value={saisie.lat}
                  onChange={(event) => setSaisie({ ...saisie, lat: event.target.value })}
                />
                <Field
                  label={t('map.longitude')}
                  inputMode="decimal"
                  value={saisie.lng}
                  onChange={(event) => setSaisie({ ...saisie, lng: event.target.value })}
                />
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => poser({ lat: Number(saisie.lat), lng: Number(saisie.lng) })}
                    disabled={!saisieValide}
                  >
                    {t('common.save')}
                  </button>
                  {position ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => enregistrer.mutate(null)}
                    >
                      {t('map.clear')}
                    </button>
                  ) : null}
                </div>
              </div>
              {enregistrer.error ? <ErrorNotice error={enregistrer.error} /> : null}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
