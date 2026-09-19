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
import { arrondirLatLng, isGeoJsonPolygon, type GeoJsonPolygon, type LatLng } from '@sillon/core';
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

  const contours = (emplacements.data ?? [])
    .filter((lieu) => isGeoJsonPolygon(lieu.geometry))
    .map((lieu) => ({
      id: lieu.id,
      nom: lieu.name,
      polygone: lieu.geometry as GeoJsonPolygon,
      actif: String(lieu.id) === cible,
    }));

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

  return (
    <>
      <PageHeader title={t('map.title')}>
        {position ? (
          <span className="chip bg-earth-100 tabular-nums dark:bg-earth-700">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </span>
        ) : null}
      </PageHeader>

      {canManageFarm ? (
        <section className="card mb-4">
          <h2 className="mb-1 text-lg font-semibold">{t('map.search')}</h2>
          {/* Dire où part la requête, avant qu'elle ne parte. */}
          <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('map.searchHint')}</p>
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
            <p className="mt-3 text-sm text-earth-700 dark:text-earth-200">{t('map.noResult')}</p>
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
        {...(session?.map ? { tuiles: session.map } : {})}
      />
      {canManageFarm ? (
        <section className="card mt-4">
          <h2 className="mb-1 text-lg font-semibold">{t('map.draw')}</h2>
          <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('map.drawHint')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label={t('map.target')}
              value={cible}
              onChange={(event) => {
                setCible(event.target.value);
                setMesure(null);
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
            <p role="status" className="mt-3 text-sm">
              {t('map.measured', {
                nom: mesure.nom,
                surface: mesure.areaM2,
                longueur: (mesure.longestSideMm / 1000).toFixed(1),
              })}
            </p>
          ) : null}
          {dessiner.error ? <ErrorNotice error={dessiner.error} /> : null}
        </section>
      ) : null}

      {canManageFarm && !cible ? (
        <p className="mt-2 text-xs text-earth-700 dark:text-earth-200">{t('map.clickHint')}</p>
      ) : null}
      {!position ? (
        <p className="mt-2 text-sm text-earth-700 dark:text-earth-200">
          {canManageFarm ? t('map.notSetYet') : t('map.notSetByOwner')}
        </p>
      ) : null}

      {canManageFarm ? (
        <section className="card mt-4">
          <h2 className="mb-1 text-lg font-semibold">{t('map.manual')}</h2>
          <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('map.manualHint')}</p>
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
                disabled={
                  !Number.isFinite(Number(saisie.lat)) || !Number.isFinite(Number(saisie.lng))
                }
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
    </>
  );
}
