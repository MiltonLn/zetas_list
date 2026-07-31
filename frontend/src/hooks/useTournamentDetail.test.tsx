import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { tournamentsService } from '../services/tournaments.service';
import { useTournamentDetail } from './useTournamentDetail';

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: {
    findOne: vi.fn(),
  },
}));

describe('useTournamentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta el torneo y permite refrescarlo', async () => {
    const first = { id: 't1', name: 'Copa Zetas' };
    const updated = { id: 't1', name: 'Copa actualizada' };
    vi.mocked(tournamentsService.findOne)
      .mockResolvedValueOnce({ data: first } as never)
      .mockResolvedValueOnce({ data: updated } as never);

    const { result } = renderHook(() => useTournamentDetail('t1'));

    await waitFor(() => expect(result.current.tournament).toEqual(first));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.tournament).toEqual(updated));
    expect(tournamentsService.findOne).toHaveBeenCalledTimes(2);
  });

  it('expone errores de la API', async () => {
    vi.mocked(tournamentsService.findOne).mockRejectedValue(
      new Error('No disponible'),
    );

    const { result } = renderHook(() => useTournamentDetail('t1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Ha ocurrido un error inesperado');
  });

  it('no consulta sin id', () => {
    const { result } = renderHook(() => useTournamentDetail(undefined));

    act(() => result.current.refresh());
    expect(tournamentsService.findOne).not.toHaveBeenCalled();
  });
});
