import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Tournament, TournamentMatch } from '../types';
import { useTournamentDetail } from '../hooks/useTournamentDetail';
import TournamentDetailPage, { TournamentView } from './TournamentDetailPage';
import PublicTournamentPage from './PublicTournamentPage';
import { tournamentsService } from '../services/tournaments.service';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock('../hooks/useTournamentDetail', () => ({
  useTournamentDetail: vi.fn(),
}));

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: {
    getStandings: vi.fn(),
    getBracketPreview: vi.fn(),
  },
}));

vi.mock('../components/TeamRegistrationModal', () => ({
  TeamRegistrationModal: ({
    onClose,
    onSaved,
  }: {
    onClose: () => void;
    onSaved: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onClose}>Cancelar inscripción</button>
      <button onClick={onSaved}>Guardar equipo</button>
    </div>
  ),
}));

function match(
  id: string,
  phase: string,
  overrides: Partial<TournamentMatch> = {},
): TournamentMatch {
  return {
    id,
    tournamentId: 't1',
    phase,
    roundNumber: 1,
    matchOrder: 1,
    teamAId: 'team-a',
    teamBId: 'team-b',
    winnerId: 'team-a',
    status: 'completed',
    teamA: { id: 'team-a', name: 'Los Zetas' },
    teamB: { id: 'team-b', name: 'Las Panteras' },
    winner: { id: 'team-a', name: 'Los Zetas' },
    sets: [
      {
        id: `${id}-set-1`,
        matchId: id,
        setNumber: 1,
        scoreA: 25,
        scoreB: 20,
      },
      {
        id: `${id}-set-2`,
        matchId: id,
        setNumber: 2,
        scoreA: 25,
        scoreB: 18,
      },
    ],
    ...overrides,
  };
}

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Copa Zetas',
    format: 'groups_and_knockout',
    modalidad: 'seis_x_seis',
    status: 'registration_open',
    registrationOpenAt: '2026-08-01T00:00:00.000Z',
    startDate: '2026-08-15T00:00:00.000Z',
    endDate: '2026-08-16T00:00:00.000Z',
    pricePerTeam: 100000,
    prizeDescription: 'Trofeo y medallas',
    maxTeams: 4,
    minPlayersPerTeam: 4,
    maxPlayersPerTeam: 8,
    minZetasMembers: 1,
    allowExternalTeams: true,
    numberOfGroups: 2,
    rules: 'Reglas del torneo',
    rulesFileUrl: 'about:blank',
    flyerUrl: '/flyer.jpg',
    createdById: 'admin-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdBy: { id: 'admin-1', name: 'Admin' },
    teams: [
      {
        id: 'team-a',
        tournamentId: 't1',
        name: 'Los Zetas',
        paid: true,
        seed: 1,
        groupLabel: 'A',
        registeredById: 'u1',
        createdAt: '2026-07-01T00:00:00.000Z',
        registeredBy: { id: 'u1', name: 'Ana' },
        players: [
          {
            id: 'p1',
            teamId: 'team-a',
            userId: 'u1',
            isCaptain: true,
            user: { id: 'u1', name: 'Ana', phone: '3000000000' },
          },
          {
            id: 'p2',
            teamId: 'team-a',
            guestName: 'Carlos',
            isCaptain: false,
          },
        ],
      },
    ],
    matches: [
      match('group-1', 'group', { groupLabel: 'A' }),
      match('semi-1', 'semifinal'),
      match('third-1', 'third_place', { status: 'cancelled' }),
      match('final-1', 'final', { roundNumber: 2 }),
    ],
    ...overrides,
  };
}

describe('TournamentView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tournamentsService.getStandings).mockResolvedValue({
      data: [{
        teamId: 'team-a',
        teamName: 'Los Zetas',
        groupLabel: 'A',
        position: 1,
        qualified: true,
        wins: 1,
        losses: 0,
        points: 3,
        setsWon: 2,
        setsLost: 0,
        setDiff: 2,
        pointsScored: 50,
        pointsConceded: 38,
        pointDiff: 12,
      }],
    });
  });

  it('renderiza equipos, resultados y modales del torneo', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();

    render(
      <MemoryRouter>
        <TournamentView
          tournament={tournament()}
          isAdmin
          onRefresh={refresh}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Copa Zetas')).toBeInTheDocument();
    expect(screen.getByText('Campeón del torneo')).toBeInTheDocument();
    expect(screen.getAllByText('Los Zetas').length).toBeGreaterThan(0);
    expect(screen.getByText('Fase de grupos')).toBeInTheDocument();
    expect(screen.getByText('Fase eliminatoria')).toBeInTheDocument();
    expect(screen.getByText('No se jugó')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Los Zetas/ }));
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('externo')).toBeInTheDocument();

    await user.click(screen.getByAltText('Flyer'));
    expect(screen.getByAltText('Flyer del torneo')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByAltText('Flyer del torneo')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /Ver reglamento completo \(PDF\)/,
      }),
    );
    expect(screen.getByTitle('Reglamento del torneo')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await user.click(
      screen.getByRole('button', { name: '+ Inscribir mi equipo' }),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar equipo' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('muestra estados sin equipos y torneo lleno', () => {
    render(
      <MemoryRouter>
        <TournamentView
          tournament={tournament({
            pricePerTeam: 0,
            maxTeams: 0,
            teams: [],
            matches: [],
            flyerUrl: undefined,
            rulesFileUrl: undefined,
            rules: undefined,
            prizeDescription: undefined,
          })}
          isAdmin={false}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Torneo lleno — no quedan cupos disponibles'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Aún no hay equipos inscritos.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });
});

describe('tournament detail routes', () => {
  it('cubre carga, error y detalle autenticado', () => {
    vi.mocked(useTournamentDetail).mockReturnValue({
      tournament: null,
      loading: true,
      error: '',
      refresh: vi.fn(),
    });
    const { rerender } = render(
      <MemoryRouter initialEntries={['/torneos/t1']}>
        <Routes>
          <Route path="/torneos/:id" element={<TournamentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Torneo')).toBeInTheDocument();

    vi.mocked(useTournamentDetail).mockReturnValue({
      tournament: null,
      loading: false,
      error: 'No disponible',
      refresh: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={['/torneos/t1']}>
        <Routes>
          <Route path="/torneos/:id" element={<TournamentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });

  it('muestra el detalle público encontrado y no encontrado', () => {
    vi.mocked(useTournamentDetail).mockReturnValue({
      tournament: tournament({ teams: [], matches: [] }),
      loading: false,
      error: '',
      refresh: vi.fn(),
    });
    const { rerender } = render(
      <MemoryRouter initialEntries={['/t/t1']}>
        <Routes>
          <Route path="/t/:id" element={<PublicTournamentPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Copa Zetas')).toBeInTheDocument();

    vi.mocked(useTournamentDetail).mockReturnValue({
      tournament: null,
      loading: false,
      error: '',
      refresh: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={['/t/t1']}>
        <Routes>
          <Route path="/t/:id" element={<PublicTournamentPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Torneo no encontrado')).toBeInTheDocument();
  });
});
