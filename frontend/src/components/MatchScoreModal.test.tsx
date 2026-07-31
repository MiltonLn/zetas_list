import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentMatch } from '../types';
import { MatchScoreModal } from './MatchScoreModal';
import { DEFAULT_COMPETITION_RULES } from './tournaments/tournamentRules';
import { tournamentsService } from '../services/tournaments.service';

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: { updateMatchScore: vi.fn() },
}));
vi.mock('../services/api', () => ({
  getApiError: (error: unknown) => error instanceof Error ? error.message : 'Error',
}));

const match: TournamentMatch = {
  id: 'm1',
  tournamentId: 't1',
  phase: 'group',
  roundNumber: 1,
  matchOrder: 1,
  teamAId: 'a',
  teamBId: 'b',
  teamA: { id: 'a', name: 'Azul' },
  teamB: { id: 'b', name: 'Rojo' },
  status: 'scheduled',
  sets: [],
};

async function fillSet(user: ReturnType<typeof userEvent.setup>, set: number, scoreA: string, scoreB: string) {
  await user.type(screen.getByLabelText(`Azul, set ${set}`), scoreA);
  await user.type(screen.getByLabelText(`Rojo, set ${set}`), scoreB);
}

describe('MatchScoreModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tournamentsService.updateMatchScore).mockResolvedValue({ data: {} });
  });

  it('guarda solo dos sets en grupos cuando el 1-1 se define por diferencia de puntos', async () => {
    const user = userEvent.setup();
    render(<MatchScoreModal match={match} rules={DEFAULT_COMPETITION_RULES} onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillSet(user, 1, '25', '20');
    await fillSet(user, 2, '23', '25');

    expect(screen.queryByLabelText('Azul, set 3')).not.toBeInTheDocument();
    await user.click(screen.getByText('Guardar marcador'));
    await waitFor(() => expect(tournamentsService.updateMatchScore).toHaveBeenCalledWith('m1', [
      { setNumber: 1, scoreA: 25, scoreB: 20 },
      { setNumber: 2, scoreA: 23, scoreB: 25 },
    ]));
  });

  it('solicita el set corto solo ante empate agregado exacto en grupos', async () => {
    const user = userEvent.setup();
    render(<MatchScoreModal match={match} rules={DEFAULT_COMPETITION_RULES} onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillSet(user, 1, '25', '20');
    await fillSet(user, 2, '20', '25');

    expect(screen.getByLabelText('Azul, set 3')).toBeInTheDocument();
    expect(screen.getByText(/Empate exacto/)).toBeInTheDocument();
    await user.click(screen.getByText('Guardar marcador'));
    expect(screen.getByText('Completa los tres sets requeridos.')).toBeInTheDocument();
  });

  it('solicita tercer set en cualquier 1-1 de eliminación', async () => {
    const user = userEvent.setup();
    render(<MatchScoreModal match={{ ...match, phase: 'semifinal' }} rules={DEFAULT_COMPETITION_RULES} onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillSet(user, 1, '25', '10');
    await fillSet(user, 2, '20', '25');

    expect(screen.getByLabelText('Azul, set 3')).toBeInTheDocument();
    expect(screen.getByText(/Partido 1–1/)).toBeInTheDocument();
  });

  it('usa los puntajes configurados para grupos al mejor de tres', async () => {
    const user = userEvent.setup();
    const rules = {
      ...DEFAULT_COMPETITION_RULES,
      groupStage: {
        ...DEFAULT_COMPETITION_RULES.groupStage,
        matchFormat: 'best_of_three' as const,
        regularSetPoints: 21,
      },
    };
    render(
      <MatchScoreModal
        match={match}
        rules={rules}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    await fillSet(user, 1, '21', '10');
    await fillSet(user, 2, '21', '15');

    await user.click(screen.getByText('Guardar marcador'));

    await waitFor(() =>
      expect(tournamentsService.updateMatchScore).toHaveBeenCalled(),
    );
  });

  it('acepta sets ganados por un punto cuando no hay alargue', async () => {
    const user = userEvent.setup();
    const rules = {
      ...DEFAULT_COMPETITION_RULES,
      knockoutStage: {
        ...DEFAULT_COMPETITION_RULES.knockoutStage,
        winByTwo: false,
      },
    };
    render(
      <MatchScoreModal
        match={{ ...match, phase: 'semifinal' }}
        rules={rules}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    await fillSet(user, 1, '25', '24');
    await fillSet(user, 2, '25', '20');

    await user.click(screen.getByText('Guardar marcador'));

    await waitFor(() =>
      expect(tournamentsService.updateMatchScore).toHaveBeenCalled(),
    );
  });
});
