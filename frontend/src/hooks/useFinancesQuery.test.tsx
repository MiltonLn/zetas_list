import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { queryKeys } from '../lib/query-client';
import { financesService } from '../services/finances.service';
import { createTestQueryClient, queryWrapper } from '../test/query-wrapper';
import { useSaveTransactionMutation, useTransactionsQuery } from './useFinancesQuery';

describe('useFinancesQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('comparte la key de transacciones por año y expone loading', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.spyOn(financesService, 'getTransactions').mockReturnValue(
      new Promise((resolve) => { resolveRequest = resolve; }) as ReturnType<typeof financesService.getTransactions>,
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTransactionsQuery(2026), {
      wrapper: queryWrapper(client),
    });

    expect(result.current.isPending).toBe(true);
    expect(queryKeys.financesTransactions(2026)).toEqual([
      'finances',
      'transactions',
      2026,
      null,
    ]);

    resolveRequest({ data: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('expone errores del servicio', async () => {
    vi.spyOn(financesService, 'getTransactions').mockRejectedValue(new Error('falló'));
    const { result } = renderHook(() => useTransactionsQuery(2026), {
      wrapper: queryWrapper(),
    });

    await waitFor(() => expect(result.current.error).toEqual(new Error('falló')));
  });

  it('guardar una transacción invalida todo finanzas', async () => {
    vi.spyOn(financesService, 'createTransaction').mockResolvedValue({ data: { id: 't1' } } as never);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveTransactionMutation(), {
      wrapper: queryWrapper(client),
    });

    await result.current.mutateAsync({
      kind: 'create',
      payload: { type: 'income', date: '2026-01-01', amount: 1000, description: 'Cuota' },
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.financesRoot });
  });
});
