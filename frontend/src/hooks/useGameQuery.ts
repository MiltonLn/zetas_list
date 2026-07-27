import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesService } from '../services/games.service';
import { queryKeys } from '../lib/query-client';
import { useGameStream } from './useGameStream';

/**
 * The game plus its registrations, kept fresh by the server-sent event stream.
 *
 * The stream only says "something changed", so instead of threading a refetch
 * callback through the page we mark the query stale and let the cache refetch
 * it. Anything else reading the same game updates with it.
 */
export function useGameQuery(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.game(id ?? ''),
    queryFn: async () => (await gamesService.get(id!)).data,
    enabled: !!id,
  });

  const invalidate = useCallback(() => {
    if (id) queryClient.invalidateQueries({ queryKey: queryKeys.game(id) });
  }, [queryClient, id]);

  useGameStream(id, invalidate);

  return { ...query, invalidate };
}

export function useGameAudit(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.gameAudit(id ?? ''),
    queryFn: async () => (await gamesService.getAudit(id!)).data,
    enabled: !!id && enabled,
  });
}

export function useAvailableMembers(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.gameAvailableMembers(id ?? ''),
    queryFn: async () => (await gamesService.getAvailableMembers(id!)).data,
    enabled: !!id && enabled,
  });
}
