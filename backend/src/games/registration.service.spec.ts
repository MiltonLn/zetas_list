import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { FinancesService } from '../finances/finances.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameEventsService } from './game-events.service';
import { GameNotifier } from './events/game-notifier.service';
import { GameQueryService } from './game-query.service';
import { RegistrationService } from './registration.service';
import { WaitlistService } from './waitlist.service';

describe('RegistrationService', () => {
  const game = {
    id: 'game-1',
    status: 'registration_open',
    maxMainSpots: 2,
    mainListHasBeenFull: false,
    guestCutoffTime: '00:00',
    maxProxyRegistrations: 2,
    gameDate: new Date('2020-01-01'),
  };
  const registration = {
    id: 'reg-1',
    gameId: 'game-1',
    userId: 'user-1',
    registeredById: 'user-1',
    position: 1,
    isWaitingList: false,
    pendingConfirmation: false,
    attended: false,
    paid: false,
    user: { name: 'Ana' },
    registeredBy: { name: 'Ana' },
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([game]),
    game: {
      update: jest.fn().mockResolvedValue(game),
    },
    gameRegistration: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    fine: { count: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>): Promise<unknown> =>
        callback(tx),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const notifier = {
    announcePlayerRegistered: jest.fn(),
    announceGuestRegistered: jest.fn(),
    announcePlayerRemoved: jest.fn().mockResolvedValue(undefined),
  };
  const finances = { hasUnpaidFines: jest.fn().mockResolvedValue(false) };
  const query = { findOne: jest.fn().mockResolvedValue({ ...game, registrations: [] }) };
  const waitlist = { autoPromoteIfNeeded: jest.fn().mockResolvedValue(undefined) };
  let service: RegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([game]);
    tx.gameRegistration.findFirst.mockResolvedValue(null);
    tx.gameRegistration.findMany.mockResolvedValue([]);
    tx.gameRegistration.count.mockResolvedValue(0);
    tx.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
    tx.gameRegistration.create.mockResolvedValue(registration);
    tx.gameRegistration.update.mockResolvedValue(registration);
    tx.user.findUnique.mockResolvedValue({ status: 'active', role: Role.member });
    finances.hasUnpaidFines.mockResolvedValue(false);
    service = new RegistrationService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      events as unknown as GameEventsService,
      notifier as unknown as GameNotifier,
      finances as unknown as FinancesService,
      query as unknown as GameQueryService,
      waitlist as unknown as WaitlistService,
    );
  });

  it('register consulta multas usando el cliente transaccional', async () => {
    await service.register('game-1', 'user-1', 'user-1', { silent: true });
    expect(finances.hasUnpaidFines).toHaveBeenCalledWith('user-1', tx);
  });

  it('registerGuest consulta multas dentro del lock y marca la lista como llena al desbordar', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(registration);
    tx.gameRegistration.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    tx.gameRegistration.create.mockResolvedValue({ ...registration, isWaitingList: true });

    await service.registerGuest('game-1', 'Invitada', 'user-1', { silent: true });

    expect(finances.hasUnpaidFines).toHaveBeenCalledWith('user-1', tx);
    expect(tx.game.update).toHaveBeenCalledWith({
      where: { id: 'game-1' },
      data: { mainListHasBeenFull: true },
    });
  });

  it('registerGuest rechaza un nombre vacío con BadRequest tipado', async () => {
    await expect(service.registerGuest('game-1', '   ', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('registerGuest valida dentro del lock que el invitador siga registrado', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(null);
    await expect(
      service.registerGuest('game-1', 'Invitada', 'user-1', { silent: true }),
    ).rejects.toThrow('Debes estar anotado');
    expect(tx.gameRegistration.create).not.toHaveBeenCalled();
  });

  it('updateRegistration hace read y write dentro del mismo lock', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(registration);
    await service.updateRegistration('reg-1', { paid: true }, 'admin-1', 'game-1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.gameRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reg-1', gameId: 'game-1' } }),
    );
  });

  it.each([
    ['ID ajeno', ['reg-1', 'foreign'], []],
    ['ID faltante', ['reg-1'], []],
    ['ID duplicado', ['reg-1', 'reg-1'], ['reg-2']],
  ])('reorder rechaza una partición inválida: %s', async (_label, mainList, waitList) => {
    tx.gameRegistration.findMany.mockResolvedValue([{ id: 'reg-1' }, { id: 'reg-2' }]);
    await expect(
      service.reorder('game-1', { mainList, waitList }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('reorder falla con NotFound si el juego no existe', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.reorder('missing', { mainList: [], waitList: [] }, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('remove ejecuta post-effects después de la transacción', async () => {
    tx.gameRegistration.findFirst.mockResolvedValue(registration);
    tx.gameRegistration.delete.mockResolvedValue(registration);
    tx.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
    await service.removeRegistration(
      'game-1',
      'user-1',
      'user-1',
      Role.member,
      { silent: true },
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'player_removed' }));
    expect(events.emit).toHaveBeenCalled();
    expect(waitlist.autoPromoteIfNeeded).toHaveBeenCalledWith('game-1');
  });
});
