import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { queryKeys } from '../lib/query-client';
import { ordersService } from '../services/orders.service';
import { createTestQueryClient, queryWrapper } from '../test/query-wrapper';
import { useCreateOrderMutation, useOrdersCatalogQuery } from './useOrdersQuery';

describe('useOrdersQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa la key única del catálogo y expone loading', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.spyOn(ordersService, 'catalog').mockReturnValue(
      new Promise((resolve) => { resolveRequest = resolve; }) as ReturnType<typeof ordersService.catalog>,
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useOrdersCatalogQuery(), {
      wrapper: queryWrapper(client),
    });

    expect(result.current.isPending).toBe(true);
    expect(queryKeys.ordersCatalog).toEqual(['orders', 'catalog']);

    resolveRequest({ data: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('expone errores del servicio', async () => {
    vi.spyOn(ordersService, 'catalog').mockRejectedValue(new Error('falló'));
    const { result } = renderHook(() => useOrdersCatalogQuery(), {
      wrapper: queryWrapper(),
    });

    await waitFor(() => expect(result.current.error).toEqual(new Error('falló')));
  });

  it('crear pedido invalida pedidos y perfil', async () => {
    vi.spyOn(ordersService, 'create').mockResolvedValue({ data: { id: 'o1' } } as never);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateOrderMutation(), {
      wrapper: queryWrapper(client),
    });

    await result.current.mutateAsync({ items: [] });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ordersMine });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders', 'admin'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.userMe });
  });
});
