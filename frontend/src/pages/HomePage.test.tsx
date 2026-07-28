import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import HomePage from './HomePage';
import { gamesService } from '../services/games.service';
import { renderWithQueryClient } from '../test/query-wrapper';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock('../services/games.service', () => ({
  gamesService: { list: vi.fn() },
}));

function LocationProbe() {
  return <output aria-label="ubicación">{useLocation().search}</output>;
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gamesService.list).mockImplementation((params) => {
      if (params?.limit === 1) {
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 1 } } as never);
      }
      return Promise.resolve({
        data: {
          data: Array.from({ length: 15 }, (_, index) => ({
            id: `game-${index}`,
            title: `Partido ${index}`,
            status: 'completed',
            modalidad: 'seis_x_seis',
            _count: { registrations: 12 },
          })),
          total: 45,
          page: Number(params?.page ?? 1),
          limit: 15,
        },
      } as never);
    });
  });

  it('usa la paginación compartida y conserva la página en la URL', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/?page=2']}>
        <HomePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Pág. 2 de 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(screen.getByLabelText('ubicación')).toHaveTextContent('?page=3'));
  });
});
