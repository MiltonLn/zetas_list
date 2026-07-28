import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { useGameMutations, useGameQuery } from './useGameQuery';
import { gamesService } from '../services/games.service';
import { createTestQueryClient, queryWrapper } from '../test/query-wrapper';
import { queryKeys } from '../lib/query-client';

vi.mock('./useGameStream', () => ({ useGameStream: vi.fn() }));

describe('useGameQuery', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createTestQueryClient();
    vi.spyOn(gamesService, 'get').mockResolvedValue({
      data: { id: 'game-1', title: 'Voley VIE', registrations: [] },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carga el partido', async () => {
    const { result } = renderHook(() => useGameQuery('game-1'), { wrapper: queryWrapper(client) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.title).toBe('Voley VIE');
    expect(gamesService.get).toHaveBeenCalledWith('game-1');
  });

  it('no consulta nada sin id', () => {
    renderHook(() => useGameQuery(undefined), { wrapper: queryWrapper(client) });

    expect(gamesService.get).not.toHaveBeenCalled();
  });

  it('registrar invalida detalle, listas y auditoría', async () => {
    vi.spyOn(gamesService, 'register').mockResolvedValue({} as never);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useGameMutations('game-1'), {
      wrapper: queryWrapper(client),
    });

    await result.current.register.mutateAsync();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.game('game-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.gameAudit('game-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.gamesRoot });
  });
});
