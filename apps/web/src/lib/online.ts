// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// État du réseau et synchronisation de la file d'attente au retour de la connexion.

import { useEffect, useState } from 'react';
import { synchronize } from './api.js';
import { subscribeOutbox, type OutboxEntry } from './outbox.js';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}

export function usePendingWrites(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => subscribeOutbox(setEntries), []);
  return entries;
}

/** Vide la file dès que la connexion revient, et une fois au démarrage. */
export function useAutoSynchronize(onSynchronized: (sent: number) => void): void {
  const online = useOnlineStatus();
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void synchronize().then(({ sent }) => {
      if (!cancelled && sent > 0) onSynchronized(sent);
    });
    return () => {
      cancelled = true;
    };
  }, [online, onSynchronized]);
}
