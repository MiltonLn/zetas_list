import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { queryKeys } from '../lib/query-client';
import { usersService } from '../services/users.service';
import { createTestQueryClient, queryWrapper } from '../test/query-wrapper';
import { useCreateUserMutation, useUsersQuery } from './useUsersQuery';

describe('useUsersQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa una key estable por búsqueda y expone loading', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.spyOn(usersService, 'list').mockReturnValue(
      new Promise((resolve) => { resolveRequest = resolve; }) as ReturnType<typeof usersService.list>,
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useUsersQuery('ana'), {
      wrapper: queryWrapper(client),
    });

    expect(result.current.isPending).toBe(true);
    expect(queryKeys.usersList('ana')).toEqual(['users', 'list', 'ana']);

    resolveRequest({ data: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersService.list).toHaveBeenCalledWith('ana');
  });

  it('expone errores del servicio', async () => {
    vi.spyOn(usersService, 'list').mockRejectedValue(new Error('falló'));
    const { result } = renderHook(() => useUsersQuery(), {
      wrapper: queryWrapper(),
    });

    await waitFor(() => expect(result.current.error).toEqual(new Error('falló')));
  });

  it('crear usuario invalida listas y detalle', async () => {
    vi.spyOn(usersService, 'create').mockResolvedValue({ data: { id: 'u1' } } as never);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateUserMutation(), {
      wrapper: queryWrapper(client),
    });

    await result.current.mutateAsync({ name: 'Ana', phone: '300' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.usersRoot });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.user('u1') });
  });
});
