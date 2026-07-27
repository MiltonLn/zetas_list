import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Game data arrives push-style over SSE, so background refetching is
      // mostly redundant noise; screens that need polling opt in explicitly.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // A 401 is terminal until the user logs in again, and a 404 won't fix
      // itself either. Only retry what a retry can actually help with.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Central list of query keys, so invalidation sites can't drift from the
 * queries they are meant to refresh.
 */
export const queryKeys = {
  game: (id: string) => ['game', id] as const,
  gameAudit: (id: string) => ['game', id, 'audit'] as const,
  gameAvailableMembers: (id: string) => ['game', id, 'available-members'] as const,
  gameReport: (id: string) => ['game', id, 'report'] as const,
  games: (filters: Record<string, unknown>) => ['games', filters] as const,
  orders: (filters: Record<string, unknown>) => ['orders', filters] as const,
} as const;
