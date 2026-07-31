import { useEffect } from 'react';
import { BASE_URL } from '../services/api';
import { clearSessionCache } from '../lib/session-cache';

const MAX_RECONNECT_DELAY_MS = 30_000;

function parseSseMessages(chunk: string, onMessage: (data: string) => void): string {
  const normalized = chunk.replace(/\r\n/g, '\n');
  const events = normalized.split('\n\n');
  const remainder = events.pop() ?? '';

  for (const event of events) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data) onMessage(data);
  }

  return remainder;
}

export function useGameStream(gameId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!gameId) return;

    let active = true;
    let currentController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect(attempt: number): Promise<void> {
      if (!active) return;

      const token = localStorage.getItem('accessToken');
      const controller = new AbortController();
      currentController = controller;

      try {
        const response = await fetch(`${BASE_URL}/games/${gameId}/stream`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          active = false;
          await clearSessionCache();
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error(`SSE respondió ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer = parseSseMessages(buffer + decoder.decode(value, { stream: true }), (data) => {
            try {
              const message = JSON.parse(data) as { type?: string };
              if (message.type === 'update' || message.type === 'status_change') onUpdate();
            } catch {
              // A malformed/heartbeat event does not invalidate the stream.
            }
          });
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        // Network errors reconnect below; HTTP errors use the same bounded backoff.
        void error;
      }

      if (active) {
        const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
        reconnectTimer = setTimeout(() => void connect(attempt + 1), delay);
      }
    }

    void connect(0);

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      currentController?.abort();
    };
  }, [gameId, onUpdate]);
}
