import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tournament } from '../types';
import { tournamentsService } from '../services/tournaments.service';
import { TournamentFormModal } from './TournamentFormModal';

vi.mock('../services/tournaments.service', () => ({
  tournamentsService: {
    create: vi.fn(),
    update: vi.fn(),
    uploadRulesPdf: vi.fn(),
    uploadFlyer: vi.fn(),
  },
}));
vi.mock('../services/api', () => ({
  getApiError: (error: unknown) => error instanceof Error ? error.message : 'Error',
}));

describe('TournamentFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tournamentsService.create).mockResolvedValue({
      data: { id: 't1' } as Tournament,
    });
  });

  it('aplica el preset de eliminación directa y envía reglas versionadas', async () => {
    const user = userEvent.setup();
    render(<TournamentFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Eliminación directa' }));
    await user.type(screen.getByPlaceholderText('Ej: Torneo Zetas 2026'), 'Copa Zetas');
    await user.click(screen.getByRole('button', { name: 'Crear torneo' }));

    await waitFor(() => expect(tournamentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Copa Zetas',
        format: 'knockout_only',
        numberOfGroups: undefined,
        competitionRules: expect.objectContaining({
          version: 1,
          knockoutStage: expect.objectContaining({ matchFormat: 'best_of_three' }),
        }),
      }),
    ));
  });
});
