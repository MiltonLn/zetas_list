import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStream } from './useGameStream';

const clearSessionCache = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../lib/session-cache', () => ({ clearSessionCache }));

function createStreamResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    emit(data: string) {
      controller.enqueue(new TextEncoder().encode(data));
    },
    fail() {
      controller.error(new Error('conexión perdida'));
    },
  };
}

describe('useGameStream', () => {
  beforeEach(() => {
    clearSessionCache.mockClear();
    localStorage.setItem('accessToken', 'token-secreto');
    localStorage.setItem('refreshToken', 'refresh-secreto');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each(['update', 'status_change'])('notifica eventos %s sin exponer el token en la URL', async (type) => {
    const stream = createStreamResponse();
    const fetchMock = vi.fn().mockResolvedValue(stream.response);
    vi.stubGlobal('fetch', fetchMock);
    const onUpdate = vi.fn();

    const { unmount } = renderHook(() => useGameStream('game-1', onUpdate));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/games/game-1/stream');
    expect(url).not.toContain('token');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-secreto' });

    act(() => stream.emit(`data: {"type":"${type}"}\r\n\r\n`));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
    unmount();
  });

  it('reconecta con backoff cuando se pierde el stream', async () => {
    vi.useFakeTimers();
    const first = createStreamResponse();
    const second = createStreamResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response);
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useGameStream('game-1', vi.fn()));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => first.fail());
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it.each([401, 403])('limpia la sesión y no reconecta ante HTTP %s', async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useGameStream('game-1', vi.fn()));
    await vi.waitFor(() => expect(clearSessionCache).toHaveBeenCalledOnce());

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(window.location.href).toContain('/login');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    unmount();
  });

  it('aborta la conexión y cancela reconexiones al desmontar', async () => {
    const stream = createStreamResponse();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return Promise.resolve(stream.response);
      }),
    );

    const { unmount } = renderHook(() => useGameStream('game-1', vi.fn()));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
