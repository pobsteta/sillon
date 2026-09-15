// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Mini-couche IndexedDB (sans dépendance) pour le mode hors ligne : cache des lectures
// et file d'attente des saisies faites au champ.

const DB_NAME = 'sillon';
const DB_VERSION = 1;
const STORE = 'kv';

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await transaction<T>('readonly', (store) => store.get(key) as IDBRequest<T>);
  } catch {
    // Navigation privée ou stockage refusé : l'application doit rester utilisable en ligne.
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await transaction('readwrite', (store) => store.put(value, key) as IDBRequest<unknown>);
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    await transaction('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
  } catch {
    /* stockage indisponible : on ignore */
  }
}
