import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { TournamentSummary } from '../types';
import { tournamentsService } from '../services/tournaments.service';
import TournamentsPage from './TournamentsPage';
import AdminTournamentsPage from './AdminTournamentsPage';

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: {
    list: vi.fn(),
  },
}));

vi.mock('../components/TournamentFormModal', () => ({
  TournamentFormModal: ({
    onClose,
    onSaved,
  }: {
    onClose: () => void;
    onSaved: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onClose}>Cerrar formulario</button>
      <button onClick={onSaved}>Guardar torneo</button>
    </div>
  ),
}));

function tournament(
  overrides: Partial<TournamentSummary> = {},
): TournamentSummary {
  return {
    id: 't1',
    name: 'Copa Zetas',
    format: 'groups_and_knockout',
    modalidad: 'seis_x_seis',
    status: 'registration_open',
    registrationOpenAt: '2026-08-01T00:00:00.000Z',
    startDate: '2026-08-15T00:00:00.000Z',
    endDate: '2026-08-15T00:00:00.000Z',
    pricePerTeam: 100000,
    prizeDescription: 'Trofeo',
    maxTeams: 4,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdBy: { id: 'admin-1', name: 'Admin' },
    teams: [{ id: 'team-1', paid: true }],
    ...overrides,
  };
}

describe('TournamentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra torneos y permite filtrarlos por estado', async () => {
    const user = userEvent.setup();
    vi.mocked(tournamentsService.list)
      .mockResolvedValueOnce({
        data: [
          tournament(),
          tournament({
            id: 't2',
            name: 'Torneo gratuito',
            pricePerTeam: 0,
            prizeDescription: undefined,
            maxTeams: 1,
            teams: [{ id: 'team-2', paid: false }],
          }),
        ],
      } as never)
      .mockResolvedValueOnce({ data: [tournament()] } as never);

    render(
      <MemoryRouter>
        <TournamentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Copa Zetas')).toBeInTheDocument();
    expect(screen.getByText('Torneo gratuito')).toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.getByText('Trofeo')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Inscripciones abiertas' }),
    );
    await waitFor(() =>
      expect(tournamentsService.list).toHaveBeenLastCalledWith(
        'registration_open',
      ),
    );
  });

  it('muestra estados vacío y de error', async () => {
    vi.mocked(tournamentsService.list).mockResolvedValueOnce({
      data: [],
    } as never);
    const { unmount } = render(
      <MemoryRouter>
        <TournamentsPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('No hay torneos para mostrar.'),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(tournamentsService.list).mockRejectedValueOnce(
      new Error('No disponible'),
    );
    render(
      <MemoryRouter>
        <TournamentsPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('Ha ocurrido un error inesperado'),
    ).toBeInTheDocument();
  });
});

describe('AdminTournamentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista torneos, abre el formulario y recarga al guardar', async () => {
    const user = userEvent.setup();
    vi.mocked(tournamentsService.list).mockResolvedValue({
      data: [tournament()],
    } as never);

    render(
      <MemoryRouter>
        <AdminTournamentsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Copa Zetas')).toBeInTheDocument();
    expect(screen.getByText('(1 pagados)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Nuevo torneo' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar torneo' }));

    await waitFor(() => expect(tournamentsService.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra estados vacío y de error', async () => {
    vi.mocked(tournamentsService.list).mockResolvedValueOnce({
      data: [],
    } as never);
    const { unmount } = render(
      <MemoryRouter>
        <AdminTournamentsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No hay torneos todavía.')).toBeInTheDocument();
    unmount();

    vi.mocked(tournamentsService.list).mockRejectedValueOnce(
      new Error('No disponible'),
    );
    render(
      <MemoryRouter>
        <AdminTournamentsPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('Ha ocurrido un error inesperado'),
    ).toBeInTheDocument();
  });
});
