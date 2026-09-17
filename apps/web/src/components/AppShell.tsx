// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Coquille de l'application : barre d'onglets en bas sur smartphone (pouce), rail latéral
// sur PC. Un bandeau signale le mode hors ligne et les saisies en attente.

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Action, Resource } from '@sillon/core';
import { useCurrentSession } from '../lib/session.js';
import { useAutoSynchronize, useOnlineStatus, usePendingWrites } from '../lib/online.js';
import { api, clearApiCache } from '../lib/api.js';
import { useQueryClient } from '@tanstack/react-query';

interface NavEntry {
  to: string;
  labelKey: string;
  icon: string;
  primary: boolean;
  /** Permission requise pour voir l'entrée ; absente = visible par tout membre. */
  permission?: [Resource, Action];
}

const NAVIGATION: NavEntry[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: '◐', primary: true },
  { to: '/plan', labelKey: 'nav.plan', icon: '▤', primary: true },
  { to: '/taches', labelKey: 'nav.tasks', icon: '✓', primary: true },
  { to: '/assolement', labelKey: 'nav.beds', icon: '▦', primary: true },
  { to: '/recoltes', labelKey: 'nav.harvests', icon: '⚖', primary: false },
  // Le consultant lit tout sauf les notes : elles ne figurent pas dans sa matrice.
  { to: '/notes', labelKey: 'nav.notes', icon: '✎', primary: false, permission: ['notes', 'read'] },
  // Le saisonnier ne voit pas les commandes ; l'employé ne voit pas les statistiques.
  {
    to: '/commandes',
    labelKey: 'nav.orders',
    icon: '✉',
    primary: false,
    permission: ['orders', 'read'],
  },
  {
    to: '/statistiques',
    labelKey: 'nav.stats',
    icon: '◫',
    primary: false,
    permission: ['charts', 'read'],
  },
  { to: '/parametres', labelKey: 'nav.settings', icon: '⚙', primary: false },
];

function useDarkMode(): [boolean, (value: boolean) => void] {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('sillon.theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sillon.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, setDark];
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { session, farm, selectFarm, can } = useCurrentSession();
  const online = useOnlineStatus();
  const pending = usePendingWrites();
  const queryClient = useQueryClient();
  const [dark, setDark] = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });

  useAutoSynchronize(() => {
    void queryClient.invalidateQueries();
  });

  const isActive = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));
  const navigation = NAVIGATION.filter((entry) => !entry.permission || can(...entry.permission));

  // Renvoi du courriel de confirmation : une seule fois par visite, l'API limitant
  // de toute façon le débit.
  const [renvoi, setRenvoi] = useState<'idle' | 'sending' | 'sent'>('idle');
  const renvoyerConfirmation = () => {
    setRenvoi('sending');
    void api('/api/auth/confirm/resend', { method: 'POST' })
      .then(() => setRenvoi('sent'))
      .catch(() => setRenvoi('sent'));
  };

  const signOut = async () => {
    // La session locale est fermée même si l'appel échoue : sans réseau, rester connecté
    // à l'écran serait pire que de perdre la confirmation du serveur.
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    await clearApiCache();
    window.location.href = '/connexion';
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:p-2"
      >
        {t('nav.menu')}
      </a>

      {/* Rail latéral — PC */}
      <nav
        aria-label={t('nav.menu')}
        className="no-print hidden w-60 shrink-0 border-r border-earth-200 bg-white p-4 dark:border-earth-700 dark:bg-earth-800 lg:block"
      >
        <div className="mb-6">
          <p className="text-lg font-semibold text-sillon-700 dark:text-sillon-300">
            {t('app.name')}
          </p>
          <p className="text-xs text-earth-700 dark:text-earth-200">{t('app.tagline')}</p>
        </div>
        <ul className="space-y-1">
          {navigation.map((entry) => (
            <li key={entry.to}>
              <Link
                to={entry.to}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${
                  isActive(entry.to)
                    ? 'bg-sillon-100 font-semibold text-sillon-800 dark:bg-sillon-900 dark:text-sillon-100'
                    : 'hover:bg-earth-100 dark:hover:bg-earth-700'
                }`}
              >
                <span aria-hidden>{entry.icon}</span>
                {t(entry.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-earth-200 bg-earth-50/95 px-3 py-2 backdrop-blur dark:border-earth-700 dark:bg-earth-900/95">
          <span className="text-base font-semibold text-sillon-700 dark:text-sillon-300 lg:hidden">
            {t('app.name')}
          </span>

          <div className="flex flex-1 items-center justify-end gap-2">
            {session && session.farms.length > 1 ? (
              <select
                aria-label={t('common.farm')}
                className="field max-w-44 text-sm"
                value={farm?.id ?? ''}
                onChange={(event) => selectFarm(Number(event.target.value))}
              >
                {session.farms.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-sm text-earth-700 dark:text-earth-200">
                {farm?.name}
              </span>
            )}
            <button
              type="button"
              className="btn-ghost px-3"
              aria-label={t('common.theme')}
              onClick={() => setDark(!dark)}
            >
              {dark ? '☀' : '☾'}
            </button>
            <button
              type="button"
              className="btn-ghost px-3 lg:hidden"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {t('nav.more')}
            </button>
            <button
              type="button"
              className="btn-ghost hidden lg:inline-flex"
              onClick={() => void signOut()}
            >
              {t('common.logout')}
            </button>
          </div>
        </header>

        {!online || pending.length > 0 ? (
          <p
            role="status"
            className="no-print bg-amber-200 px-3 py-2 text-center text-sm text-amber-950 dark:bg-amber-800 dark:text-amber-50"
          >
            {online ? t('app.pending', { count: pending.length }) : t('app.offline')}
          </p>
        ) : null}

        {farm?.access && !farm.access.canWrite ? (
          <p
            role="status"
            className="no-print bg-amber-200 px-3 py-2 text-center text-sm text-amber-950 dark:bg-amber-800 dark:text-amber-50"
          >
            {/* Le dire avant le refus : se heurter à une erreur en enregistrant une journée
                de relevés serait la pire façon d'apprendre qu'on ne peut plus écrire. */}
            {farm.access.reason === 'suspendue'
              ? t('app.readOnlySuspended')
              : farm.access.reason === 'essai_expire'
                ? t('app.readOnlyTrial')
                : t('app.readOnly')}
          </p>
        ) : null}

        {session?.user && !session.user.confirmedAt ? (
          <p
            role="status"
            className="no-print flex flex-wrap items-center justify-center gap-2 bg-sillon-100 px-3 py-2 text-center text-sm text-earth-900 dark:bg-earth-700 dark:text-earth-50"
          >
            {t('auth.confirm.banner')}
            <button
              type="button"
              className="underline underline-offset-2 disabled:no-underline disabled:opacity-60"
              disabled={renvoi !== 'idle'}
              onClick={renvoyerConfirmation}
            >
              {renvoi === 'sent' ? t('auth.confirm.resent') : t('auth.confirm.resend')}
            </button>
          </p>
        ) : null}

        {menuOpen ? (
          <nav className="no-print border-b border-earth-200 bg-white p-2 dark:border-earth-700 dark:bg-earth-800 lg:hidden">
            <ul className="grid grid-cols-2 gap-1">
              {navigation
                .filter((entry) => !entry.primary)
                .map((entry) => (
                  <li key={entry.to}>
                    <Link
                      to={entry.to}
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-earth-100 dark:hover:bg-earth-700"
                    >
                      <span aria-hidden>{entry.icon}</span>
                      {t(entry.labelKey)}
                    </Link>
                  </li>
                ))}
              <li>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-earth-100 dark:hover:bg-earth-700"
                >
                  {t('common.logout')}
                </button>
              </li>
              <li>
                <select
                  aria-label={t('common.language')}
                  className="field text-sm"
                  value={i18n.resolvedLanguage}
                  onChange={(event) => void i18n.changeLanguage(event.target.value)}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </li>
            </ul>
          </nav>
        ) : null}

        <main id="contenu" className="min-w-0 flex-1 px-3 py-4 pb-24 lg:px-6 lg:pb-6">
          {children}
        </main>

        {/* Barre d'onglets — smartphone */}
        <nav
          aria-label={t('nav.menu')}
          className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-earth-200 bg-white pb-[env(safe-area-inset-bottom,0px)] dark:border-earth-700 dark:bg-earth-800 lg:hidden"
        >
          {navigation
            .filter((entry) => entry.primary)
            .map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  isActive(entry.to)
                    ? 'font-semibold text-sillon-700 dark:text-sillon-300'
                    : 'text-earth-700 dark:text-earth-200'
                }`}
              >
                <span aria-hidden className="text-lg">
                  {entry.icon}
                </span>
                {t(entry.labelKey)}
              </Link>
            ))}
        </nav>
      </div>
    </div>
  );
}
