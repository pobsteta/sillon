// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Client HTTP de l'API. Les lectures passent par TanStack Query (et par le cache du
// service worker hors ligne) ; les écritures « de terrain » basculent dans la file
// d'attente quand le réseau manque.

import { enqueue, flushOutbox, type OutboxEntry } from './outbox.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Erreur signalant qu'une écriture a été mise en file d'attente faute de réseau. */
export class QueuedOfflineError extends Error {
  constructor(readonly label: string) {
    super(label);
    this.name = 'QueuedOfflineError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Étiquette lisible si la requête part en file d'attente hors ligne. */
  deferrable?: string;
  signal?: AbortSignal;
}

async function toError(response: Response): Promise<ApiError> {
  let payload: { error?: string; message?: string; details?: unknown } = {};
  try {
    payload = await response.json();
  } catch {
    /* réponse non JSON */
  }
  return new ApiError(
    response.status,
    payload.error ?? 'error',
    payload.message ?? `Erreur ${response.status}`,
    payload.details,
  );
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (method !== 'GET' && options.deferrable) {
      await enqueue({
        method: method as OutboxEntry['method'],
        url: path,
        body: options.body,
        label: options.deferrable,
      });
      throw new QueuedOfflineError(options.deferrable);
    }
    throw error;
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  return (
    contentType.includes('application/json') ? response.json() : response.text()
  ) as Promise<T>;
}

/**
 * Téléverse un fichier. À part de `api()` parce que le corps est un `FormData` : le
 * navigateur doit poser lui-même l'en-tête `content-type` avec sa frontière multipart,
 * et l'écraser avec `application/json` casserait la lecture côté serveur.
 *
 * Pas de mise en file d'attente hors ligne : un fichier ne tient pas dans l'outbox, qui
 * ne sérialise que du JSON. Sans réseau, l'appel échoue et l'écran le dit.
 */
export async function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(path, { method: 'POST', credentials: 'include', body });
  if (!response.ok) throw await toError(response);
  return response.json() as Promise<T>;
}

/**
 * Vide le cache de réponses tenu par le service worker.
 * Ce cache est indexé par URL, pas par session : sans cette purge, les données de la
 * ferme précédente resteraient lisibles hors ligne après une déconnexion, ou après le
 * passage d'un autre compte sur le même appareil.
 */
export async function clearApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(API_CACHE);
  } catch {
    // Stockage refusé (navigation privée) : il n'y a alors rien à purger.
  }
}

/** Nom du cache déclaré dans `vite.config.ts` (runtimeCaching). */
const API_CACHE = 'sillon-api';

/** Rejoue la file d'attente ; appelé au retour du réseau et au démarrage. */
export function synchronize(): Promise<{ sent: number; dropped: number }> {
  return flushOutbox((entry) =>
    fetch(entry.url, {
      method: entry.method,
      credentials: 'include',
      headers: entry.body === undefined ? {} : { 'content-type': 'application/json' },
      ...(entry.body === undefined ? {} : { body: JSON.stringify(entry.body) }),
    }),
  );
}

/** Construit une chaîne de requête en ignorant les filtres vides. */
export function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
