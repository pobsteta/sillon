// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ferme courante : mémorisée d'une visite à l'autre, et propagée à tout l'arbre.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './queries.js';
import type { Farm, Session } from './types.js';

interface SessionContextValue {
  session: Session | undefined;
  isLoading: boolean;
  farm: Farm | undefined;
  selectFarm: (farmId: number) => void;
  canEdit: boolean;
  canManageFarm: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const STORAGE_KEY = 'sillon.farmId';

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useSession();
  const [farmId, setFarmId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  const farm = useMemo(() => {
    if (!session?.farms.length) return undefined;
    return session.farms.find((candidate) => candidate.id === farmId) ?? session.farms[0];
  }, [session, farmId]);

  useEffect(() => {
    if (farm) localStorage.setItem(STORAGE_KEY, String(farm.id));
  }, [farm]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      farm,
      selectFarm: setFarmId,
      canEdit: farm?.role === 'owner' || farm?.role === 'manager',
      canManageFarm: farm?.role === 'owner',
    }),
    [session, isLoading, farm],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useCurrentSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useCurrentSession doit être utilisé dans <SessionProvider>');
  return context;
}

/** Raccourci pour les écrans qui n'ont de sens qu'avec une ferme sélectionnée. */
export function useFarmId(): number {
  const { farm } = useCurrentSession();
  return farm?.id ?? 0;
}
