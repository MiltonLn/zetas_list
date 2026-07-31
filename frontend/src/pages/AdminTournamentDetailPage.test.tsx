import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPETITION_RULES } from '../components/tournaments/tournamentRules';
import { tournamentsService } from '../services/tournaments.service';
import type { Tournament } from '../types';
import AdminTournamentDetailPage from './AdminTournamentDetailPage';

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: {
    findOne: vi.fn(),
    getStandings: vi.fn(),
    getBracketPreview: vi.fn(),
    generateKnockoutBracket: vi.fn(),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

const tournament: Tournament = {
  id: 't1',
  name: 'Copa Zetas',
  format: 'groups_and_knockout',
  modalidad: 'seis_x_seis',
  status: 'in_progress',
  registrationOpenAt: '2026-07-01T00:00:00.000Z',
  startDate: '2026-07-10T00:00:00.000Z',
  endDate: '2026-07-11T00:00:00.000Z',
  pricePerTeam: 0,
  maxTeams: 2,
  minPlayersPerTeam: 4,
  maxPlayersPerTeam: 8,
  minZetasMembers: 0,
  allowExternalTeams: true,
  numberOfGroups: 2,
  competitionRules: DEFAULT_COMPETITION_RULES,
  createdById: 'admin-1',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  createdBy: { id: 'admin-1', name: 'Admin' },
  teams: [
    {
      id: 'a',
      tournamentId: 't1',
      name: 'Equipo A',
      paid: true,
      groupLabel: 'A',
      registeredById: 'admin-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      players: [],
      registeredBy: { id: 'admin-1', name: 'Admin' },
    },
    {
      id: 'b',
      tournamentId: 't1',
      name: 'Equipo B',
      paid: true,
      groupLabel: 'B',
      registeredById: 'admin-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      players: [],
      registeredBy: { id: 'admin-1', name: 'Admin' },
    },
  ],
  matches: [
    {
      id: 'group-1',
      tournamentId: 't1',
      phase: 'group',
      groupLabel: 'A',
      roundNumber: 1,
      matchOrder: 0,
      teamAId: 'a',
      teamBId: 'b',
      winnerId: 'a',
      status: 'completed',
      teamA: { id: 'a', name: 'Equipo A' },
      teamB: { id: 'b', name: 'Equipo B' },
      winner: { id: 'a', name: 'Equipo A' },
      sets: [],
    },
  ],
};

describe('AdminTournamentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tournamentsService.findOne).mockResolvedValue({
      data: tournament,
    });
    vi.mocked(tournamentsService.getStandings).mockResolvedValue({ data: [] });
    vi.mocked(tournamentsService.getBracketPreview).mockResolvedValue({
      data: {
        seeding: ['a', 'b'],
        firstRound: [{ teamAId: 'a', teamBId: 'b' }],
        totalRounds: 1,
        includeThirdPlace: false,
      },
    });
    vi.mocked(tournamentsService.generateKnockoutBracket).mockResolvedValue({
      data: tournament,
    });
  });

  it('previsualiza y confirma los cruces antes de generar el bracket', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/torneos/t1']}>
        <Routes>
          <Route
            path="/admin/torneos/:id"
            element={<AdminTournamentDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Copa Zetas');
    await user.click(screen.getByRole('button', { name: 'Previsualizar bracket' }));

    expect(await screen.findByText('Vista previa del bracket')).toBeInTheDocument();
    expect(screen.getAllByText('Equipo A').length).toBeGreaterThan(1);
    await user.click(
      screen.getByRole('button', { name: 'Confirmar y generar bracket' }),
    );
    expect(
      screen.getByText(
        '¿Confirmas estos cruces? Se crearán los partidos de la fase eliminatoria.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generar' }));

    await waitFor(() =>
      expect(tournamentsService.generateKnockoutBracket).toHaveBeenCalledWith(
        't1',
      ),
    );
  });
});
