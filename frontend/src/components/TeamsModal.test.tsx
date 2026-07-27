import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamsModal } from './TeamsModal';
import { gamesService } from '../services/games.service';
import type { Game, GameRegistration, RegistrationUser } from '../types';

vi.mock('../services/games.service', () => ({
  gamesService: {
    generateTeams: vi.fn(),
    sendTeamsWhatsapp: vi.fn(),
  },
}));

const mockGames = vi.mocked(gamesService);

function makeUser(overrides: Partial<RegistrationUser> = {}): RegistrationUser {
  return {
    id: 'u1',
    name: 'Ana García',
    username: 'ana',
    phone: '111',
    positions: [],
    ...overrides,
  };
}

let regCounter = 0;
function makeReg(overrides: Partial<GameRegistration> = {}): GameRegistration {
  regCounter += 1;
  return {
    id: `reg-${regCounter}`,
    gameId: 'g1',
    userId: `u${regCounter}`,
    position: regCounter,
    isWaitingList: false,
    attended: false,
    paid: false,
    fromWaitList: false,
    registeredAt: '2026-07-07T00:00:00Z',
    registeredById: 'u1',
    isGuest: false,
    pendingConfirmation: false,
    confirmationDeclined: false,
    teamNumber: null,
    user: makeUser({ id: `u${regCounter}`, name: `Jugador ${regCounter}` }),
    registeredBy: { id: 'u1', name: 'Ana García', username: 'ana' },
    ...overrides,
  };
}

function makeGame(registrations: GameRegistration[]): Game {
  return {
    id: 'g1',
    title: 'Partido Test',
    modalidad: 'seis_x_seis',
    gameDate: '2026-07-07',
    startTime: '19:50',
    registrationOpenAt: '2026-07-07T10:00:00Z',
    maxMainSpots: 18,
    pricePerPlayer: 2000,
    vigilante: 10000,
    guestCutoffTime: '13:30',
    maxProxyRegistrations: 1,
    mainListHasBeenFull: false,
    status: 'registration_open',
    createdById: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    registrations,
  };
}

function gameWithTeams(): Game {
  return makeGame([
    makeReg({
      teamNumber: 1,
      user: makeUser({ name: 'Armadora Uno', positions: ['armador'] }),
    }),
    makeReg({
      teamNumber: 1,
      user: makeUser({ name: 'Central Real', alias: 'Centralito', positions: ['central'] }),
    }),
    makeReg({
      teamNumber: 2,
      user: makeUser({ name: 'Armador Dos', positions: ['armador', 'opuesto'] }),
    }),
    makeReg({ teamNumber: 2, isGuest: true, guestName: 'Invitado X', userId: null, user: makeUser() }),
    makeReg({ teamNumber: null, user: makeUser({ name: 'Sin Equipo' }) }),
    makeReg({ isWaitingList: true, teamNumber: null, user: makeUser({ name: 'En Espera' }) }),
  ]);
}

describe('TeamsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    regCounter = 0;
  });

  it('renderiza los equipos con sus jugadores', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(screen.getByText('Equipo 1')).toBeInTheDocument();
    expect(screen.getByText('Equipo 2')).toBeInTheDocument();
    expect(screen.getByText(/Armadora Uno/)).toBeInTheDocument();
    expect(screen.getByText(/Invitado X/)).toBeInTheDocument();
  });

  it('usa el alias en lugar del nombre real', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(screen.getByText(/Centralito/)).toBeInTheDocument();
    expect(screen.queryByText(/Central Real/)).not.toBeInTheDocument();
  });

  it('marca a los armadores (incluye multi-posición)', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(screen.getAllByTitle('Armador')).toHaveLength(2);
  });

  it('excluye jugadores sin equipo y lista de espera', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(screen.queryByText(/Sin Equipo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/En Espera/)).not.toBeInTheDocument();
  });

  it('no muestra niveles de habilidad para no-admins', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'Jugador A', skillLevel: 4.5 }) }),
    ]);
    const { container } = render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/4\.5/);
  });

  it('muestra el nivel de habilidad como badge para admins', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'Jugador A', skillLevel: 4.5 }) }),
      makeReg({ teamNumber: 1, user: makeUser({ name: 'Jugador B', skillLevel: 3.0 }) }),
    ]);
    render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(screen.getByTitle('Habilidad: 4.5')).toBeInTheDocument();
    expect(screen.getByTitle('Habilidad: 3.0')).toBeInTheDocument();
  });

  it('no muestra badge de habilidad para jugadores sin skillLevel', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'Jugador C', skillLevel: null }) }),
    ]);
    render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(screen.queryByTitle(/Habilidad/)).not.toBeInTheDocument();
  });

  it('no muestra badge de habilidad para invitados aunque sea admin', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, isGuest: true, guestName: 'Invitado Y', userId: null, user: makeUser() }),
    ]);
    render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(screen.queryByTitle(/Habilidad/)).not.toBeInTheDocument();
  });

  it('muestra el total de skill por equipo solo para admins', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P1', skillLevel: 4.5 }) }),
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P2', skillLevel: 3.0 }) }),
      makeReg({ teamNumber: 2, user: makeUser({ name: 'P3', skillLevel: 4.0 }) }),
      makeReg({ teamNumber: 2, user: makeUser({ name: 'P4', skillLevel: 3.5 }) }),
    ]);
    render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    // Equipo 1: 4.5 + 3.0 = 7.5, Equipo 2: 4.0 + 3.5 = 7.5 — ambos totales iguales
    expect(screen.getAllByText('7.5')).toHaveLength(2);
    expect(screen.getAllByText('Total skill')).toHaveLength(2);
  });

  it('no muestra total de skill para no-admins', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P1', skillLevel: 4.5 }) }),
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P2', skillLevel: 3.0 }) }),
    ]);
    const { container } = render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/Total skill/);
    expect(container.textContent).not.toMatch(/7\.5/);
  });

  it('no muestra total si algún miembro no tiene skillLevel', () => {
    const game = makeGame([
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P1', skillLevel: 4.5 }) }),
      makeReg({ teamNumber: 1, user: makeUser({ name: 'P2', skillLevel: null }) }),
    ]);
    const { container } = render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/Total skill/);
  });

  it('no muestra botones de acción para no-admins', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={false} onGameUpdate={() => {}} />,
    );
    expect(screen.queryByText(/Regenerar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviar a WhatsApp/)).not.toBeInTheDocument();
  });

  it('muestra Regenerar y Enviar a WhatsApp para admins', () => {
    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(screen.getByText(/Regenerar/)).toBeInTheDocument();
    expect(screen.getByText(/Enviar a WhatsApp/)).toBeInTheDocument();
  });

  it('sin equipos generados muestra mensaje vacío y botón Generar para admin', () => {
    const game = makeGame([makeReg({ teamNumber: null })]);
    render(
      <TeamsModal open={true} onClose={() => {}} game={game} isAdmin={true} onGameUpdate={() => {}} />,
    );
    expect(screen.getByText(/Aún no se han generado los equipos/)).toBeInTheDocument();
    expect(screen.getByText(/Generar equipos/)).toBeInTheDocument();
    expect(screen.queryByText(/Enviar a WhatsApp/)).not.toBeInTheDocument();
  });

  it('Regenerar llama al servicio y notifica el juego actualizado', async () => {
    const user = userEvent.setup();
    const updated = gameWithTeams();
    mockGames.generateTeams.mockResolvedValue({ data: updated } as never);
    const onGameUpdate = vi.fn();

    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={true} onGameUpdate={onGameUpdate} />,
    );
    await user.click(screen.getByText(/Regenerar/));

    expect(mockGames.generateTeams).toHaveBeenCalledWith('g1');
    expect(onGameUpdate).toHaveBeenCalledWith(updated);
  });

  it('Enviar a WhatsApp muestra confirmación al enviar', async () => {
    const user = userEvent.setup();
    mockGames.sendTeamsWhatsapp.mockResolvedValue({ data: { sent: true } } as never);

    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={true} onGameUpdate={() => {}} />,
    );
    await user.click(screen.getByText(/Enviar a WhatsApp/));

    expect(mockGames.sendTeamsWhatsapp).toHaveBeenCalledWith('g1');
    expect(screen.getByText(/Equipos enviados al grupo de WhatsApp/)).toBeInTheDocument();
  });

  it('Enviar a WhatsApp muestra error si sent=false', async () => {
    const user = userEvent.setup();
    mockGames.sendTeamsWhatsapp.mockResolvedValue({ data: { sent: false } } as never);

    render(
      <TeamsModal open={true} onClose={() => {}} game={gameWithTeams()} isAdmin={true} onGameUpdate={() => {}} />,
    );
    await user.click(screen.getByText(/Enviar a WhatsApp/));

    expect(screen.getByText(/No se pudo enviar el mensaje/)).toBeInTheDocument();
  });
});
