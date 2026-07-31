import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import GameDetailPage from './GameDetailPage';
import {
  useAvailableMembers,
  useGameAudit,
  useGameMutations,
  useGameQuery,
} from '../hooks/useGameQuery';
import { createTestQueryClient } from '../test/query-wrapper';

const authState = vi.hoisted(() => ({
  user: { id: 'admin-1', role: 'admin' },
  isAdmin: true,
  isGameManager: true,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../hooks/useGameQuery');
vi.mock('../components/GameCompleteModal', () => ({ GameCompleteModal: () => null }));
vi.mock('../components/RegisterOtherModal', () => ({ RegisterOtherModal: () => null }));
vi.mock('../components/game-detail/GameRegistrationLists', () => ({
  GameRegistrationLists: ({
    mainList,
    onDragEnd,
    onToggle,
    onPromote,
    onDemote,
    onConfirm,
    onRemove,
  }: {
    mainList: Array<{ id: string; user: { name: string } | null }>;
    onDragEnd: (
      event: { active: { id: string }; over: { id: string } },
      type: 'main',
    ) => void;
    onToggle: (id: string, field: 'paid', currentValue: boolean) => void;
    onPromote: (id: string) => void;
    onDemote: (id: string) => void;
    onConfirm: (id: string) => void;
    onRemove: (userId: string, id: string) => void;
  }) => (
    <div>
      <output aria-label="orden">{mainList.map((registration) => registration.user?.name).join(',')}</output>
      <button
        onClick={() => onDragEnd(
          { active: { id: 'reg-a' }, over: { id: 'reg-b' } },
          'main',
        )}
      >
        Reordenar
      </button>
      <button onClick={() => onToggle('reg-a', 'paid', false)}>Marcar pago</button>
      <button onClick={() => onPromote('reg-a')}>Promover</button>
      <button onClick={() => onDemote('reg-a')}>Degradar</button>
      <button onClick={() => onConfirm('reg-a')}>Confirmar por otro</button>
      <button onClick={() => onRemove('user-reg-a', 'reg-a')}>Quitar</button>
    </div>
  ),
}));

function registration(id: string, name: string, position: number) {
  return {
    id,
    gameId: 'game-1',
    userId: `user-${id}`,
    position,
    isWaitingList: false,
    attended: false,
    paid: false,
    note: null,
    fromWaitList: false,
    fineExempt: false,
    isGuest: false,
    guestName: null,
    pendingConfirmation: false,
    confirmationDeadline: null,
    confirmationDeclined: false,
    originalWaitPosition: null,
    registeredAt: '2026-01-01T00:00:00.000Z',
    registeredById: 'admin-1',
    user: { id: `user-${id}`, name, alias: null, username: name, phone: '300' },
    registeredBy: { id: 'admin-1', name: 'Admin', alias: null, username: 'admin' },
  };
}

const baseGame = {
  id: 'game-1',
  title: 'Partido',
  modalidad: 'seis_x_seis',
  status: 'registration_open',
  maxMainSpots: 12,
  maxProxyRegistrations: 2,
  pricePerPlayer: 10000,
  registrations: [registration('reg-a', 'Ana', 1), registration('reg-b', 'Beto', 2)],
};

describe('GameDetailPage reorder', () => {
  let currentGame = baseGame;
  const reorder = vi.fn();
  const registerMutation = vi.fn();
  const updateRegistration = vi.fn();
  const promote = vi.fn();
  const demote = vi.fn();
  const confirmFor = vi.fn();
  const removeRegistration = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: 'admin-1', role: 'admin' };
    authState.isAdmin = true;
    authState.isGameManager = true;
    currentGame = baseGame;
    reorder.mockReturnValue(new Promise(() => undefined));
    registerMutation.mockResolvedValue(undefined);
    updateRegistration.mockResolvedValue(undefined);
    promote.mockResolvedValue(undefined);
    demote.mockResolvedValue(undefined);
    confirmFor.mockResolvedValue(undefined);
    removeRegistration.mockResolvedValue(undefined);
    vi.mocked(useGameQuery).mockImplementation(() => ({
      data: currentGame,
      isPending: false,
      error: null,
      invalidate: vi.fn(),
    } as never));
    vi.mocked(useGameAudit).mockReturnValue({ data: [], isFetching: false } as never);
    vi.mocked(useAvailableMembers).mockReturnValue({ data: [] } as never);
    vi.mocked(useGameMutations).mockReturnValue({
      reorder: { mutateAsync: reorder },
      register: { isPending: false, mutateAsync: registerMutation },
      updateRegistration: { mutateAsync: updateRegistration },
      promote: { mutateAsync: promote },
      demote: { mutateAsync: demote },
      confirmFor: { mutateAsync: confirmFor },
      removeRegistration: { mutateAsync: removeRegistration },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantiene el orden optimista si SSE refresca durante el debounce', async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const page = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(
      page(),
    );

    expect(screen.getByLabelText('orden')).toHaveTextContent('Ana,Beto');
    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }));
    expect(screen.getByLabelText('orden')).toHaveTextContent('Beto,Ana');

    currentGame = { ...baseGame, registrations: [...baseGame.registrations] };
    view.rerender(page());

    expect(screen.getByLabelText('orden')).toHaveTextContent('Beto,Ana');
    act(() => vi.advanceTimersByTime(600));
    expect(reorder).toHaveBeenCalledWith({
      mainList: ['reg-b', 'reg-a'],
      waitList: [],
    });
    vi.useRealTimers();
  });

  it('mantiene el orden optimista hasta que el cache refleje el reorder confirmado', async () => {
    vi.useFakeTimers();
    reorder.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const page = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(page());

    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(reorder).toHaveBeenCalledOnce();

    currentGame = { ...baseGame, registrations: [...baseGame.registrations] };
    view.rerender(page());
    expect(screen.getByLabelText('orden')).toHaveTextContent('Beto,Ana');

    currentGame = {
      ...baseGame,
      registrations: [
        { ...baseGame.registrations[1], position: 1 },
        { ...baseGame.registrations[0], position: 2 },
      ],
    };
    view.rerender(page());
    expect(screen.getByLabelText('orden')).toHaveTextContent('Beto,Ana');
  });

  it('no persiste un reorder pendiente después de desmontar', () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }));
    unmount();
    act(() => vi.advanceTimersByTime(600));

    expect(reorder).not.toHaveBeenCalled();
  });

  it('conecta las acciones de registro con sus mutaciones', async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: '🏐 ¡Anotame!' }));
    await user.click(screen.getByRole('button', { name: 'Marcar pago' }));
    await user.click(screen.getByRole('button', { name: 'Promover' }));
    await user.click(screen.getByRole('button', { name: 'Degradar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar por otro' }));
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    await waitFor(() => {
      expect(registerMutation).toHaveBeenCalledOnce();
      expect(updateRegistration).toHaveBeenCalledWith({
        regId: 'reg-a',
        data: { paid: true },
      });
      expect(promote).toHaveBeenCalledWith('reg-a');
      expect(demote).toHaveBeenCalledWith('reg-a');
      expect(confirmFor).toHaveBeenCalledWith('reg-a');
      expect(removeRegistration).toHaveBeenCalledWith({
        userId: 'user-reg-a',
        regId: 'reg-a',
      });
    });
  });

  it('consulta miembros disponibles cuando un miembro registrado abre el modal', async () => {
    authState.user = { id: 'user-reg-a', role: 'member' };
    authState.isAdmin = false;
    authState.isGameManager = false;
    const user = userEvent.setup();
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(useAvailableMembers).toHaveBeenLastCalledWith('game-1', false);
    await user.click(screen.getByRole('button', { name: '+ Anotar a alguien más' }));
    expect(useAvailableMembers).toHaveBeenLastCalledWith('game-1', true);
  });

  it('cuenta en el resumen a quien asiste desde la lista de espera', () => {
    currentGame = {
      ...baseGame,
      registrations: [
        { ...registration('reg-main', 'Ana', 1), attended: true },
        {
          ...registration('reg-wait', 'Beto', 1),
          isWaitingList: true,
          attended: true,
        },
      ],
    };
    const client = createTestQueryClient();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/game/game-1']}>
          <Routes>
            <Route path="/game/:id" element={<GameDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const attendanceCard = screen.getByText('Asistieron').parentElement;
    expect(attendanceCard).not.toBeNull();
    expect(within(attendanceCard!).getByText('2')).toBeInTheDocument();
  });
});
