// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// File d'attente des saisies hors ligne (§7.3 du brief : valider une tâche ou saisir une
// récolte sans réseau, synchroniser au retour). Seules les écritures marquées « différables »
// y entrent : créer une série ou déplacer une planche demande une réponse du serveur.

import { idbGet, idbSet } from './idb.js';

export interface OutboxEntry {
  id: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  queuedAt: string;
  label: string;
}

const KEY = 'outbox';
const listeners = new Set<(entries: OutboxEntry[]) => void>();

export async function readOutbox(): Promise<OutboxEntry[]> {
  return (await idbGet<OutboxEntry[]>(KEY)) ?? [];
}

async function write(entries: OutboxEntry[]): Promise<void> {
  await idbSet(KEY, entries);
  for (const listener of listeners) listener(entries);
}

export function subscribeOutbox(listener: (entries: OutboxEntry[]) => void): () => void {
  listeners.add(listener);
  void readOutbox().then(listener);
  return () => listeners.delete(listener);
}

export async function enqueue(entry: Omit<OutboxEntry, 'id' | 'queuedAt'>): Promise<void> {
  const entries = await readOutbox();
  entries.push({ ...entry, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  await write(entries);
}

/**
 * Rejoue la file dans l'ordre. Une entrée refusée par le serveur (4xx) est abandonnée :
 * la rejouer indéfiniment bloquerait toutes les suivantes. Une panne réseau laisse la file
 * intacte pour la prochaine tentative.
 */
export async function flushOutbox(
  send: (entry: OutboxEntry) => Promise<Response>,
): Promise<{ sent: number; dropped: number }> {
  let entries = await readOutbox();
  let sent = 0;
  let dropped = 0;

  while (entries.length > 0) {
    const entry = entries[0]!;
    try {
      const response = await send(entry);
      if (!response.ok && response.status >= 500) break;
      if (!response.ok) dropped += 1;
      else sent += 1;
    } catch {
      break; // toujours hors ligne
    }
    entries = entries.slice(1);
    await write(entries);
  }

  return { sent, dropped };
}
