import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useGameQuery } from './useGameQuery';
import { gamesService } from '../services/games.service';

/** Minimal EventSource stand-in that lets a test push a message. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useGameQuery', () => {
  let client: QueryClient;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(gamesService, 'get').mockResolvedValue({
      data: { id: 'game-1', title: 'Voley VIE', registrations: [] },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('carga el partido', async () => {
    const { result } = renderHook(() => useGameQuery('game-1'), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.title).toBe('Voley VIE');
    expect(gamesService.get).toHaveBeenCalledWith('game-1');
  });

  it('no consulta nada sin id', () => {
    renderHook(() => useGameQuery(undefined), { wrapper: wrapper(client) });

    expect(gamesService.get).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('refresca el partido cuando el stream anuncia un cambio', async () => {
    renderHook(() => useGameQuery('game-1'), { wrapper: wrapper(client) });

    await waitFor(() => expect(gamesService.get).toHaveBeenCalledTimes(1));
    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0].emit({ type: 'update' });

    await waitFor(() => expect(gamesService.get).toHaveBeenCalledTimes(2));
  });

  it('ignora los latidos del stream que no son cambios', async () => {
    renderHook(() => useGameQuery('game-1'), { wrapper: wrapper(client) });
    await waitFor(() => expect(gamesService.get).toHaveBeenCalledTimes(1));

    FakeEventSource.instances[0].emit({ type: 'heartbeat' });

    // Nothing to await on a no-op, so give a refetch the chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gamesService.get).toHaveBeenCalledTimes(1);
  });

  it('cierra el stream al desmontar', async () => {
    const { unmount } = renderHook(() => useGameQuery('game-1'), { wrapper: wrapper(client) });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    unmount();

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
