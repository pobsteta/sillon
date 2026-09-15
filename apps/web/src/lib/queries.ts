// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Requêtes et mutations TanStack Query. Les clés sont préfixées par la ferme :
// changer de ferme invalide naturellement tout le cache affiché.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, queryString } from './api.js';
import type {
  AvailableLocation,
  Container,
  Crop,
  Family,
  GanttBar,
  Harvest,
  LocationNode,
  Named,
  Note,
  OrderLine,
  Planting,
  Session,
  Stats,
  Tag,
  Task,
  TaskTemplate,
  Variety,
} from './types.js';

export const keys = {
  session: ['session'] as const,
  farm: (farmId: number) => ['farm', farmId] as const,
  list: (farmId: number, resource: string, params: unknown = {}) =>
    ['farm', farmId, resource, params] as const,
};

const base = (farmId: number) => `/api/farms/${farmId}`;

export function useSession(options: Partial<UseQueryOptions<Session>> = {}) {
  return useQuery<Session>({
    queryKey: keys.session,
    queryFn: () => api<Session>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
    ...options,
  });
}

function farmList<T>(farmId: number, resource: string, params: Record<string, unknown> = {}) {
  return {
    queryKey: keys.list(farmId, resource, params),
    queryFn: () => api<T>(`${base(farmId)}/${resource}${queryString(params)}`),
  };
}

export const useFamilies = (farmId: number) => useQuery(farmList<Family[]>(farmId, 'families'));
export const useCrops = (farmId: number) => useQuery(farmList<Crop[]>(farmId, 'crops'));
export const useVarieties = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<Variety[]>(farmId, 'varieties', params));
export const useProviders = (farmId: number) => useQuery(farmList<Named[]>(farmId, 'providers'));
export const useUnits = (farmId: number) => useQuery(farmList<Named[]>(farmId, 'units'));
export const useContainers = (farmId: number) =>
  useQuery(farmList<Container[]>(farmId, 'containers'));
export const useTags = (farmId: number) => useQuery(farmList<Tag[]>(farmId, 'tags'));
export const useTaskTypes = (farmId: number) => useQuery(farmList<any[]>(farmId, 'task-types'));
export const useLocations = (farmId: number) =>
  useQuery(farmList<LocationNode[]>(farmId, 'locations'));
export const useTaskTemplates = (farmId: number) =>
  useQuery(farmList<TaskTemplate[]>(farmId, 'task-templates'));

export const usePlantings = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<Planting[]>(farmId, 'plantings', params));

export const usePlanting = (farmId: number, plantingId: number) =>
  useQuery({
    queryKey: keys.list(farmId, 'planting', plantingId),
    queryFn: () => api<Planting>(`${base(farmId)}/plantings/${plantingId}`),
    enabled: Number.isFinite(plantingId),
  });

export const useGantt = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<GanttBar[]>(farmId, 'gantt', params));

export const useTasks = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<Task[]>(farmId, 'tasks', params));

export const useHarvests = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<Harvest[]>(farmId, 'harvests', params));

export const useNotes = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(farmList<Note[]>(farmId, 'notes', params));

export const useOrders = (farmId: number, params: Record<string, unknown> = {}) =>
  useQuery(
    farmList<{ lines: OrderLine[]; totals: { seedCount: number; plantsToBuy: number } }>(
      farmId,
      'orders',
      params,
    ),
  );

export const useStats = (farmId: number, year: number) =>
  useQuery(farmList<Stats>(farmId, 'stats', { year }));

export const useAvailableLocations = (farmId: number, plantingId: number, enabled: boolean) =>
  useQuery({
    queryKey: keys.list(farmId, 'available-locations', plantingId),
    queryFn: () =>
      api<{
        range: { begin: string; end: string };
        requiredLength: number;
        locations: AvailableLocation[];
      }>(`${base(farmId)}/plantings/${plantingId}/available-locations`),
    enabled,
  });

export const useAssignmentPlan = (farmId: number, from: string, to: string) =>
  useQuery(farmList<any>(farmId, 'assignments', { from, to }));

export const useMembers = (farmId: number) => useQuery(farmList<any[]>(farmId, 'members'));

/**
 * Mutation générique : toute écriture invalide le cache de la ferme, ce qui garde
 * l'affichage cohérent sans gérer les invalidations une par une.
 */
export function useFarmMutation<TInput, TResult = unknown>(
  farmId: number,
  request: (input: TInput) => Promise<TResult>,
  options: { onSuccess?: (result: TResult, input: TInput) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['farm', farmId] });
      options.onSuccess?.(result, input);
    },
  });
}

export { api, queryString };
