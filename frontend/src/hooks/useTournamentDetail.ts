import { useEffect, useState } from 'react';
import { tournamentsService } from '../services/tournaments.service';
import { getApiError } from '../services/api';
import type { Tournament } from '../types';

export function useTournamentDetail(id: string | undefined) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => {
    if (!id) return;
    setLoading(true);
    tournamentsService
      .findOne(id)
      .then((r) => setTournament(r.data))
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  return { tournament, loading, error, refresh };
}
