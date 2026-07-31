import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameCompleteModal } from './GameCompleteModal';
import { renderWithQueryClient } from '../test/query-wrapper';

vi.mock('../services/games.service', () => ({
  gamesService: {
    previewReport: vi.fn(),
    setFineExempt: vi.fn(),
    complete: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  getApiError: (e: unknown) => (e as Error).message || 'Error',
}));

import { gamesService } from '../services/games.service';

const mockGames = vi.mocked(gamesService);

const baseFineablePlayer = { regId: 'r1', userId: 'u1', name: 'Carlos', fineExempt: false };

describe('GameCompleteModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    gameId: 'g1',
    onCompleted: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGames.previewReport.mockResolvedValue({
      data: {
        report: 'Reporte de prueba\nLínea 2',
        fineable: [baseFineablePlayer],
      },
    } as ReturnType<typeof gamesService.previewReport> extends Promise<infer R> ? R : never);
  });

  it('carga y muestra el reporte al abrir', async () => {
    renderWithQueryClient(<GameCompleteModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Vista previa del reporte')).toBeInTheDocument();
    });
    expect(screen.getByText('Reporte de prueba')).toBeInTheDocument();
    expect(mockGames.previewReport).toHaveBeenCalledWith('g1');
  });

  it('muestra la lista de jugadores multables', async () => {
    renderWithQueryClient(<GameCompleteModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });
    expect(screen.getByText('Multado')).toBeInTheDocument();
  });

  it('toggle fine exempt al clickar checkbox', async () => {
    mockGames.setFineExempt.mockResolvedValue({} as Awaited<ReturnType<typeof gamesService.setFineExempt>>);
    mockGames.previewReport
      .mockResolvedValueOnce({
        data: { report: 'Reporte', fineable: [baseFineablePlayer] },
      } as Awaited<ReturnType<typeof gamesService.previewReport>>)
      .mockResolvedValueOnce({
        data: { report: 'Reporte actualizado', fineable: [{ ...baseFineablePlayer, fineExempt: true }] },
      } as Awaited<ReturnType<typeof gamesService.previewReport>>);

    const user = userEvent.setup();
    renderWithQueryClient(<GameCompleteModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(mockGames.setFineExempt).toHaveBeenCalledWith('g1', 'r1', true);
  });

  it('llama complete y onCompleted al confirmar', async () => {
    mockGames.complete.mockResolvedValue({} as Awaited<ReturnType<typeof gamesService.complete>>);

    const user = userEvent.setup();
    renderWithQueryClient(<GameCompleteModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Confirmar y Terminar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Confirmar y Terminar'));

    await waitFor(() => {
      expect(mockGames.complete).toHaveBeenCalledWith('g1');
      expect(defaultProps.onCompleted).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('muestra error si complete falla', async () => {
    mockGames.complete.mockRejectedValue(new Error('Falló'));

    const user = userEvent.setup();
    renderWithQueryClient(<GameCompleteModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Confirmar y Terminar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Confirmar y Terminar'));

    await waitFor(() => {
      expect(screen.getByText('Falló')).toBeInTheDocument();
    });
  });

  it('no renderiza nada cuando open=false', () => {
    const { container } = renderWithQueryClient(
      <GameCompleteModal {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
