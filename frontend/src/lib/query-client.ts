import { QueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '../types';
import { registerSessionCacheReset } from './session-cache';

export type FinanceTransactionType = 'income' | 'expense';
export type FineStatusFilter = 'pending' | 'paid';

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

registerSessionCacheReset(async () => {
  await queryClient.cancelQueries();
  queryClient.clear();
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
  gamePreviewReport: (id: string) => ['game', id, 'preview-report'] as const,
  gamesRoot: ['games'] as const,
  games: (filters: Record<string, unknown> = {}) => ['games', filters] as const,

  usersRoot: ['users'] as const,
  usersList: (search?: string) => ['users', 'list', search ?? ''] as const,
  user: (id: string) => ['users', 'detail', id] as const,
  userMe: ['users', 'me'] as const,

  financesRoot: ['finances'] as const,
  financesDashboard: (year?: number) => ['finances', 'dashboard', year ?? null] as const,
  financesTransactions: (year?: number, type?: FinanceTransactionType) =>
    ['finances', 'transactions', year ?? null, type ?? null] as const,
  financesFines: (year?: number, status?: FineStatusFilter) =>
    ['finances', 'fines', year ?? null, status ?? null] as const,
  financesMyFines: ['finances', 'my-fines'] as const,

  ordersRoot: ['orders'] as const,
  ordersCatalog: ['orders', 'catalog'] as const,
  ordersMine: ['orders', 'mine'] as const,
  ordersAdmin: (status?: OrderStatus) => ['orders', 'admin', status ?? null] as const,
} as const;
