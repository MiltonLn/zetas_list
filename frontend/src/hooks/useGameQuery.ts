import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesService } from '../services/games.service';
import { queryKeys } from '../lib/query-client';
import { useGameStream } from './useGameStream';
import type { CreateGamePayload } from '../services/games.service';

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

export function useGamePreviewReport(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.gamePreviewReport(id),
    queryFn: async () => (await gamesService.previewReport(id)).data,
    enabled,
  });
}

function useInvalidateGame(id: string) {
  const queryClient = useQueryClient();
  return async (includeFinances = false) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.game(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.gameAudit(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.gameAvailableMembers(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.gamePreviewReport(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.gameReport(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.gamesRoot }),
      ...(includeFinances
        ? [queryClient.invalidateQueries({ queryKey: queryKeys.financesRoot })]
        : []),
    ]);
  };
}

export function useCreateGameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateGamePayload) => (await gamesService.create(payload)).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queryKeys.gamesRoot }),
  });
}

export function useGameMutations(id: string) {
  const invalidate = useInvalidateGame(id);

  const register = useMutation({
    mutationFn: async () => gamesService.register(id),
    onSuccess: async () => invalidate(),
  });
  const registerProxy = useMutation({
    mutationFn: async (targetUserId: string) => gamesService.registerProxy(id, targetUserId),
    onSuccess: async () => invalidate(),
  });
  const registerGuest = useMutation({
    mutationFn: async (guestName: string) => gamesService.registerGuest(id, guestName),
    onSuccess: async () => invalidate(),
  });
  const removeRegistration = useMutation({
    mutationFn: async ({ userId, regId }: { userId: string; regId?: string }) =>
      gamesService.removeRegistration(id, userId, regId),
    onSuccess: async () => invalidate(),
  });
  const updateRegistration = useMutation({
    mutationFn: async ({
      regId,
      data,
    }: {
      regId: string;
      data: { attended?: boolean; paid?: boolean; note?: string };
    }) => gamesService.updateRegistration(id, regId, data),
    onSuccess: async () => invalidate(),
  });
  const promote = useMutation({
    mutationFn: async (regId: string) => gamesService.promote(id, regId),
    onSuccess: async () => invalidate(),
  });
  const demote = useMutation({
    mutationFn: async (regId: string) => gamesService.demote(id, regId),
    onSuccess: async () => invalidate(),
  });
  const reorder = useMutation({
    mutationFn: async ({ mainList, waitList }: { mainList: string[]; waitList: string[] }) =>
      gamesService.reorder(id, mainList, waitList),
    onError: async () => invalidate(),
    onSuccess: async () => invalidate(),
  });
  const cancel = useMutation({
    mutationFn: async (reason: string) => gamesService.cancel(id, reason),
    onSuccess: async () => invalidate(),
  });
  const confirm = useMutation({
    mutationFn: async () => gamesService.confirmRegistration(id),
    onSuccess: async () => invalidate(),
  });
  const confirmFor = useMutation({
    mutationFn: async (regId: string) => gamesService.confirmRegistrationById(id, regId),
    onSuccess: async () => invalidate(),
  });
  const setFineExempt = useMutation({
    mutationFn: async ({ regId, exempt }: { regId: string; exempt: boolean }) =>
      gamesService.setFineExempt(id, regId, exempt),
    onSuccess: async () => invalidate(true),
  });
  const complete = useMutation({
    mutationFn: async () => gamesService.complete(id),
    onSuccess: async () => invalidate(true),
  });

  return {
    register,
    registerProxy,
    registerGuest,
    removeRegistration,
    updateRegistration,
    promote,
    demote,
    reorder,
    cancel,
    confirm,
    confirmFor,
    setFineExempt,
    complete,
  };
}
