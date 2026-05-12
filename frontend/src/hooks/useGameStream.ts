import { useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function useGameStream(gameId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!gameId) return;

    let active = true;
    let currentEs: EventSource | null = null;

    function connect(attempt: number) {
      if (!active) return;

      const token = localStorage.getItem('accessToken');
      const url = `${BASE_URL}/games/${gameId}/stream?token=${token || ''}`;
      const es = new EventSource(url);
      currentEs = es;

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string };
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
        setTimeout(() => connect(attempt + 1), delay);
      };
    }

    connect(0);

    return () => {
      active = false;
      currentEs?.close();
    };
  }, [gameId, onUpdate]);
}
