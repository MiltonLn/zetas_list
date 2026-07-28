import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameEventsService } from './game-events.service';
import { GameNotifier } from './events/game-notifier.service';
import { GameQueryService } from './game-query.service';
import { WaitlistService } from './waitlist.service';

describe('WaitlistService', () => {
  const game = {
    id: 'game-1',
    status: 'registration_open',
    maxMainSpots: 2,
    mainListHasBeenFull: true,
    guestCutoffTime: '23:59',
    maxProxyRegistrations: 2,
    gameDate: new Date(Date.now() + 86_400_000),
  };
  const waiter = {
    id: 'wait-1',
    gameId: 'game-1',
    userId: 'user-1',
    registeredById: 'user-1',
    position: 1,
    isWaitingList: true,
    isGuest: false,
    guestName: null,
    confirmationDeclined: false,
    user: { name: 'Ana', alias: null, phone: '123', whatsappLid: null },
    registeredBy: { name: 'Ana', alias: null },
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([game]),
    game: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    gameRegistration: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    game: { ...tx.game, findUnique: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>): Promise<unknown> =>
        callback(tx),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const query = { findOne: jest.fn().mockResolvedValue({ ...game, registrations: [] }) };
  const notifier = {
    announcePlayerPromoted: jest.fn(),
    announcePlayersAutoPromoted: jest.fn(),
  };
  let service: WaitlistService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([game]);
    tx.game.findUnique.mockResolvedValue(game);
    tx.game.findUniqueOrThrow.mockResolvedValue(game);
    tx.gameRegistration.count.mockResolvedValue(0);
    tx.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
    tx.gameRegistration.findMany.mockResolvedValue([]);
    tx.gameRegistration.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ ...waiter, ...data }),
    );
    service = new WaitlistService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      events as unknown as GameEventsService,
      query as unknown as GameQueryService,
      notifier as unknown as GameNotifier,
    );
  });

  it('promoteNext selecciona y promueve en una sola transacción', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(waiter);
    await expect(service.promoteNext('game-1', 'admin-1')).resolves.toEqual({
      updated: expect.any(Object),
      promotedName: 'Ana',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.gameRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wait-1' },
        data: expect.objectContaining({ isWaitingList: false, fromWaitList: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'player_promoted' }));
    expect(events.emit).toHaveBeenCalled();
  });

  it('promote aplica las mismas reglas y update en una sola transacción', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(waiter);

    await service.promote('game-1', 'wait-1', 'admin-1', { silent: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.gameRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wait-1' },
        data: {
          isWaitingList: false,
          position: 1,
          fromWaitList: true,
        },
      }),
    );
    expect(notifier.announcePlayerPromoted).not.toHaveBeenCalled();
  });

  it('autoPromote no produce efectos para un juego completed', async () => {
    tx.game.findUnique.mockResolvedValue({
      ...game,
      status: 'completed',
    });
    tx.gameRegistration.findMany.mockResolvedValue([waiter]);

    await service.autoPromoteIfNeeded('game-1');

    expect(tx.game.findUnique).toHaveBeenCalledWith({ where: { id: 'game-1' } });
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
    expect(tx.gameRegistration.count).not.toHaveBeenCalled();
    expect(tx.gameRegistration.findMany).not.toHaveBeenCalled();
    expect(tx.gameRegistration.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(notifier.announcePlayersAutoPromoted).not.toHaveBeenCalled();
  });

  it('autoPromote no produce efectos si mainListHasBeenFull=false', async () => {
    tx.game.findUnique.mockResolvedValue({
      ...game,
      mainListHasBeenFull: false,
    });
    tx.gameRegistration.findMany.mockResolvedValue([waiter]);

    await service.autoPromoteIfNeeded('game-1');

    expect(tx.gameRegistration.count).not.toHaveBeenCalled();
    expect(tx.gameRegistration.findMany).not.toHaveBeenCalled();
    expect(tx.gameRegistration.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(notifier.announcePlayersAutoPromoted).not.toHaveBeenCalled();
  });

  it('continueAfterConfirmationTimeout no hace nada si pending=false', async () => {
    tx.gameRegistration.findUnique.mockResolvedValue({ pendingConfirmation: false });
    await expect(
      service.continueAfterConfirmationTimeout('game-1', 'reg-1', 3),
    ).resolves.toBeNull();
    expect(tx.gameRegistration.update).not.toHaveBeenCalled();
  });

  it('continueAfterConfirmationTimeout calcula el cutoff bajo lock y omite invitados', async () => {
    tx.gameRegistration.findUnique.mockResolvedValue({ pendingConfirmation: true });
    tx.game.findUnique.mockResolvedValue({
      ...game,
      gameDate: new Date(Date.now() + 86_400_000),
      guestCutoffTime: '23:59',
    });
    tx.gameRegistration.aggregate
      .mockResolvedValueOnce({ _max: { position: 2 } })
      .mockResolvedValueOnce({ _max: { position: 1 } });
    tx.gameRegistration.findFirst.mockResolvedValue(waiter);
    const result = await service.continueAfterConfirmationTimeout(
      'game-1',
      'reg-1',
      99,
    );
    expect(result?.returnPosition).toBe(3);
    expect(tx.game.findUnique).toHaveBeenCalledWith({ where: { id: 'game-1' } });
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
    expect(tx.gameRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isGuest: false }) }),
    );
  });
});
