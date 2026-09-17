// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ferme courante : mémorisée d'une visite à l'autre, et propagée à tout l'arbre.

import { can, type Action, type Resource } from '@sillon/core';
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
  /** Permission de la matrice `Brinjel.Admin.Role` pour le rôle courant. */
  can: (resource: Resource, action: Action) => boolean;
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

  // Absent d'un déploiement sans politique d'accès : on écrit alors, comme avant.
  const peutEcrire = farm?.access?.canWrite ?? true;

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      farm,
      selectFarm: setFarmId,
      // Une ferme en lecture seule retire le droit d'écrire à tout le monde, quel que soit
      // le rôle : c'est l'état de la ferme, pas celui de la personne. Sans cette ligne,
      // l'interface proposerait des boutons que l'API refuserait.
      canEdit: peutEcrire && (farm?.role === 'owner' || farm?.role === 'manager'),
      canManageFarm: peutEcrire && farm?.role === 'owner',
      // La matrice de Brinjel fait foi : le saisonnier ne voit pas les commandes,
      // le consultant si. Une échelle de rôles ne saurait pas l'exprimer.
      can: (resource: Resource, action: Action) =>
        farm ? (peutEcrire || action === 'read') && can(farm.role, resource, action) : false,
    }),
    [session, isLoading, farm, peutEcrire],
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
