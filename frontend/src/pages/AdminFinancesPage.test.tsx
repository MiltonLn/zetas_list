import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminFinancesPage from './AdminFinancesPage';
import {
  useDeleteFineMutation,
  useDeleteTransactionMutation,
  useFinesQuery,
  useMarkFinePaidMutation,
  useTransactionsQuery,
} from '../hooks/useFinancesQuery';
import { useUsersQuery } from '../hooks/useUsersQuery';

vi.mock('../hooks/useFinancesQuery');
vi.mock('../hooks/useUsersQuery');

const deleteTransaction = vi.fn();
const deleteFine = vi.fn();

const transaction = {
  id: 'tx-1',
  type: 'income' as const,
  date: '2026-07-27',
  amount: 12000,
  description: 'Cuota mensual',
  gameId: null,
  createdById: 'admin-1',
  createdAt: '2026-07-27T12:00:00.000Z',
};

const fine = {
  id: 'fine-1',
  userId: 'member-1',
  userName: 'Ana',
  date: '2026-07-27',
  amount: 5000,
  reason: 'Inasistencia',
  status: 'pending' as const,
  paidAt: null,
  gameId: null,
  createdById: 'admin-1',
  createdAt: '2026-07-27T12:00:00.000Z',
};

describe('AdminFinancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteTransaction.mockResolvedValue(undefined);
    deleteFine.mockResolvedValue(undefined);
    vi.mocked(useTransactionsQuery).mockReturnValue({
      data: [transaction],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useFinesQuery).mockReturnValue({
      data: [fine],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useUsersQuery).mockReturnValue({ data: [], isPending: false, error: null } as never);
    vi.mocked(useDeleteTransactionMutation).mockReturnValue({
      mutateAsync: deleteTransaction,
    } as never);
    vi.mocked(useDeleteFineMutation).mockReturnValue({ mutateAsync: deleteFine } as never);
    vi.mocked(useMarkFinePaidMutation).mockReturnValue({ mutateAsync: vi.fn() } as never);
  });

  it('exige dos pulsaciones accesibles para eliminar una transacción', async () => {
    const user = userEvent.setup();
    render(<AdminFinancesPage />);

    await user.click(screen.getByRole('button', { name: 'Eliminar Cuota mensual' }));
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Confirmar eliminación de Cuota mensual' }),
    ).toHaveTextContent('¿Seguro?');

    await user.click(
      screen.getByRole('button', { name: 'Confirmar eliminación de Cuota mensual' }),
    );

    await waitFor(() => expect(deleteTransaction).toHaveBeenCalledWith('tx-1'));
  });

  it('exige dos pulsaciones accesibles para eliminar una multa', async () => {
    const user = userEvent.setup();
    render(<AdminFinancesPage />);
    await user.click(screen.getByRole('button', { name: 'Multas y Deudas' }));

    await user.click(screen.getByRole('button', { name: 'Eliminar multa de Ana' }));
    expect(deleteFine).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Confirmar eliminación de multa de Ana' }),
    ).toHaveTextContent('¿Seguro?');

    await user.click(
      screen.getByRole('button', { name: 'Confirmar eliminación de multa de Ana' }),
    );

    await waitFor(() => expect(deleteFine).toHaveBeenCalledWith('fine-1'));
  });
});
