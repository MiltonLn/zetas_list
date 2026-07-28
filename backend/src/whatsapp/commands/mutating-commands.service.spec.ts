import { Role } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { GameFullException, NoPendingConfirmationException } from '../../games/exceptions';
import { GamesService } from '../../games/games.service';
import { UsersService } from '../../users/users.service';
import { WhatsappProvider } from '../whatsapp.interface';
import { ActiveGame } from './list-formatter';
import { CommandContext } from './command-context';
import { MutatingCommandsService } from './mutating-commands.service';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn((callback: (scope: { setTag: jest.Mock }) => void) =>
    callback({ setTag: jest.fn() }),
  ),
}));

describe('MutatingCommandsService', () => {
  const user = { id: 'user-1', name: 'Ana', role: Role.member, status: 'active' };
  const game = {
    id: 'game-1',
    title: 'Partido',
    maxMainSpots: 2,
    registrations: [],
  } as unknown as ActiveGame;
  const wp = { sendToGroup: jest.fn().mockResolvedValue(true) };
  const games = {
    findOne: jest.fn(),
    retryFromWaitingList: jest.fn(),
    register: jest.fn(),
    confirmRegistration: jest.fn(),
    promoteNext: jest.fn(),
    buildCounts: jest.fn().mockReturnValue('1/2'),
    buildGameLink: jest.fn().mockReturnValue(' link'),
  };
  const users = { findByPhone: jest.fn() };
  let service: MutatingCommandsService;

  const context = (text: string): CommandContext => ({
    phone: '123',
    text,
    mentionedJids: [],
    user,
    activeGame: game,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    games.findOne.mockResolvedValue(game);
    games.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
    games.register.mockResolvedValue({ isWaitingList: false, position: 1 });
    service = new MutatingCommandsService(
      wp as unknown as WhatsappProvider,
      games as unknown as GamesService,
      users as unknown as UsersService,
    );
  });

  it('register delega al dominio y responde con el estado actualizado', async () => {
    games.findOne
      .mockResolvedValueOnce(game)
      .mockResolvedValueOnce({
        ...game,
        registrations: [{ user: { id: user.id }, isWaitingList: false, position: 1 }],
      });
    await service.handleRegister(context('@z anotame'));
    expect(games.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', {
      silent: true,
    });
    expect(wp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('se anotó'));
  });

  it('confirm traduce un error esperado sin enviarlo a Sentry', async () => {
    games.confirmRegistration.mockRejectedValue(new NoPendingConfirmationException());
    await service.handleConfirm(context('@z confirmo'));
    expect(wp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('no tienes'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('promote vuelve a leer el juego y no autoriza con el snapshot obsoleto', async () => {
    const stale = {
      ...game,
      registrations: [{ user: { id: user.id }, isWaitingList: false }],
    } as unknown as ActiveGame;
    games.findOne.mockResolvedValue(game);
    await service.handlePromote({ ...context('@z promover'), activeGame: stale });
    expect(games.promoteNext).not.toHaveBeenCalled();
    expect(wp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('solo los jugadores'));
  });

  it('promote distingue errores esperados de inesperados', async () => {
    const adminContext = {
      ...context('@z promover'),
      user: { ...user, role: Role.admin },
    };
    games.promoteNext.mockRejectedValueOnce(new GameFullException());
    await service.handlePromote(adminContext);
    expect(Sentry.captureException).not.toHaveBeenCalled();

    const unexpected = new Error('db down');
    games.promoteNext.mockRejectedValueOnce(unexpected);
    await service.handlePromote(adminContext);
    expect(Sentry.captureException).toHaveBeenCalledWith(unexpected);
  });
});
