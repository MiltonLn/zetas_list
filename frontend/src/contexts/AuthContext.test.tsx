import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { authService } from '../services/auth.service';
import { queryClient, queryKeys } from '../lib/query-client';

vi.mock('../services/auth.service', () => ({
  authService: {
    me: vi.fn(),
    login: vi.fn(),
  },
}));

function SessionActions() {
  const { user, login, logout } = useAuth();
  return (
    <>
      <output>{user?.username ?? 'sin sesión'}</output>
      <button onClick={() => void logout()}>Salir</button>
      <button onClick={() => void login('b', 'secret')}>Entrar B</button>
    </>
  );
}

describe('AuthProvider session cache', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await queryClient.cancelQueries();
    queryClient.clear();
    vi.mocked(authService.login).mockResolvedValue({
      data: {
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        user: {
          id: 'b',
          username: 'b',
          name: 'Usuario B',
          role: 'member',
          phone: '3000000000',
        },
      },
    } as never);
  });

  it('elimina userMe y ordersMine de A al salir y antes de adoptar B', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <SessionActions />
      </AuthProvider>,
    );
    await screen.findByText('sin sesión');

    queryClient.setQueryData(queryKeys.userMe, { id: 'a' });
    queryClient.setQueryData(queryKeys.ordersMine, [{ id: 'order-a' }]);
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));

    queryClient.setQueryData(queryKeys.userMe, { id: 'a-stale' });
    queryClient.setQueryData(queryKeys.ordersMine, [{ id: 'order-a-stale' }]);
    await user.click(screen.getByRole('button', { name: 'Entrar B' }));

    await screen.findByText('b');
    expect(queryClient.getQueryData(queryKeys.userMe)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.ordersMine)).toBeUndefined();
  });
});
