import { useEffect, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function useGameStream(gameId: string | undefined, onUpdate: () => void) {
  const reconnect = useCallback(
    (attempt = 0) => {
      if (!gameId) return;

      const token = localStorage.getItem('accessToken');
      const url = `${BASE_URL}/games/${gameId}/stream?token=${token || ''}`;
      const es = new EventSource(url);

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'update' || msg.type === 'status_change') {
            onUpdate();
          }
        } catch {
          // ignore parse errors on heartbeat
        }
      };

      es.onerror = () => {
        es.close();
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        setTimeout(() => reconnect(attempt + 1), delay);
      };

      return () => es.close();
    },
    [gameId, onUpdate],
  );

  useEffect(() => {
    const cleanup = reconnect(0);
    return cleanup;
  }, [reconnect]);
}
