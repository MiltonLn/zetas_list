import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GameStatus, Modalidad, Role } from '@prisma/client';
import { GamesService } from './games.service';
import { displayName, userDisplayName } from './games.utils';
import { formatCutoffTime } from './games.utils';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FinancesService } from '../finances/finances.service';

const mockPrisma = {
  game: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  gameRegistration: {
    findUnique: jest.fn(),
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
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockAudit = { log: jest.fn() };
const mockEvents = { emit: jest.fn() };
const mockWhatsapp = { sendToGroup: jest.fn(), sendMessage: jest.fn() };
const mockFinances = {
  createGameFines: jest.fn().mockResolvedValue(undefined),
  createGameDebts: jest.fn().mockResolvedValue(undefined),
  createGameIncome: jest.fn().mockResolvedValue(undefined),
  hasUnpaidFines: jest.fn().mockResolvedValue(false),
};

function makeReg(overrides: Partial<any> = {}) {
  return {
    id: 'reg-1',
    gameId: 'game-1',
    userId: 'user-1',
    position: 1,
    isWaitingList: false,
    attended: false,
    paid: false,
    fromWaitList: false,
    registeredAt: new Date(),
    registeredById: 'user-1',
    user: { id: 'user-1', name: 'Test User', username: 'test', phone: '111', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
    registeredBy: { id: 'user-1', name: 'Test User', username: 'test' },
    ...overrides,
  };
}

function makeGame(overrides: Partial<any> = {}) {
  return {
    id: 'game-1',
    title: 'Test Game',
    modalidad: Modalidad.seis_x_seis,
    gameDate: new Date('2026-05-11'),
    startTime: '18:50',
    registrationOpenAt: new Date('2026-05-11T10:00:00-05:00'),
    maxMainSpots: 18,
    pricePerPlayer: 2000,
    vigilante: 10000,
    status: GameStatus.registration_open,
    cancellationReason: null,
    guestCutoffTime: '13:30',
    maxProxyRegistrations: 5,
    fineAmountNoShow: 5000,
    createdById: 'actor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    registrations: [],
    createdBy: { id: 'actor-1', name: 'Admin' },
    ...overrides,
  };
}

describe('GamesService', () => {
  let service: GamesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWhatsapp.sendToGroup.mockResolvedValue(undefined);
    mockWhatsapp.sendMessage.mockResolvedValue(undefined);
    mockAudit.log.mockResolvedValue(undefined);
    mockEvents.emit.mockReturnValue(undefined);
    // Default: execute $transaction callback with mockPrisma as the tx context
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: GameEventsService, useValue: mockEvents },
        { provide: WhatsappService, useValue: mockWhatsapp },
        { provide: FinancesService, useValue: mockFinances },
      ],
    }).compile();

    service = module.get<GamesService>(GamesService);
  });

  // ─── generateReport ────────────────────────────────────────────────────────

  describe('generateReport', () => {
    it('incluye título, fecha, asistentes y recaudado básico', () => {
      const game = makeGame({
        title: 'Volley 6x6',
        gameDate: new Date('2026-05-11T00:00:00'),
        pricePerPlayer: 2000,
        vigilante: 0,
        registrations: [
          makeReg({ attended: true, paid: true, isWaitingList: false }),
          makeReg({ id: 'reg-2', userId: 'user-2', attended: true, paid: false, isWaitingList: false, user: { id: 'user-2', name: 'Player 2', username: 'p2', phone: '222', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null } }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Volley 6x6');
      expect(report).toContain('Asistentes:* 2/2');
      expect(report).toContain('Recaudado:* $2');
    });

    it('muestra vigilante y neto cuando vigilante > 0', () => {
      const game = makeGame({
        pricePerPlayer: 2000,
        vigilante: 10000,
        registrations: [
          makeReg({ attended: true, paid: true }),
          makeReg({ id: 'r2', userId: 'u2', attended: true, paid: true, user: { id: 'u2', name: 'P2', username: 'p2', phone: '2', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null } }),
          makeReg({ id: 'r3', userId: 'u3', attended: true, paid: true, user: { id: 'u3', name: 'P3', username: 'p3', phone: '3', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null } }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Vigilante:');
      expect(report).toContain('Neto:');
    });

    it('NO muestra vigilante ni neto cuando vigilante es 0', () => {
      const game = makeGame({ vigilante: 0, registrations: [] });
      const report = service.generateReport(game as any);
      expect(report).not.toContain('Vigilante');
      expect(report).not.toContain('Neto');
    });

    it('muestra sección "Asistieron sin pagar"', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({ attended: true, paid: false, isWaitingList: false }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Asistieron sin pagar');
      expect(report).toContain('Test User');
    });

    it('muestra sección "Multados" para no asistentes de lista principal', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({ attended: false, paid: false, isWaitingList: false }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Multados:');
      expect(report).toContain('Test User');
    });

    it('NO muestra "Multados" para personas en lista de espera', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({ attended: false, paid: false, isWaitingList: true }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).not.toContain('Multados');
    });

    it('muestra "Pagaron pero no asistieron"', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({ attended: false, paid: true, isWaitingList: false }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Pagaron pero no asistieron');
    });

    it('con lista vacía no lanza errores', () => {
      const game = makeGame({ vigilante: 0, registrations: [] });
      const report = service.generateReport(game as any);
      expect(report).toContain('Asistentes:* 0/0');
      expect(report).toContain('Recaudado:* $0');
    });

    it('excluye de "Multados" a jugadores con fineExempt: true', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({
            id: 'reg-exempt', userId: 'u-exempt', attended: false, isWaitingList: false, fineExempt: true,
            user: { id: 'u-exempt', name: 'Exempt Player', username: 'exempt', phone: '333', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          }),
          makeReg({
            id: 'reg-fined', userId: 'u-fined', attended: false, isWaitingList: false, fineExempt: false,
            user: { id: 'u-fined', name: 'Fined Player', username: 'fined', phone: '444', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Multados');
      expect(report).toContain('Fined Player');
      expect(report).not.toContain('Exempt Player');
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      modalidad: Modalidad.seis_x_seis,
      gameDate: '2026-06-01',
      startTime: '18:50',
      registrationOpenTime: '10:00',
      pricePerPlayer: 2000,
      vigilante: 10000,
    };
    const actorId = 'actor-1';

    it('lanza ConflictException si ya existe un juego activo ese día', async () => {
      mockPrisma.game.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create(dto as any, actorId)).rejects.toThrow(ConflictException);
    });

    it('crea el juego con valores por defecto cuando no se proveen opcionales', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      const created = makeGame({ status: GameStatus.scheduled });
      mockPrisma.game.create.mockResolvedValue(created);

      await service.create({ modalidad: Modalidad.seis_x_seis, gameDate: '2026-06-01' } as any, actorId);

      const createCall = mockPrisma.game.create.mock.calls[0][0];
      expect(createCall.data.startTime).toBe('18:50');
      expect(createCall.data.maxMainSpots).toBe(18);
      expect(createCall.data.pricePerPlayer).toBe(2000);
      expect(createCall.data.vigilante).toBe(10000);
    });

    it('llama a audit.log con "game_created"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      mockPrisma.game.create.mockResolvedValue(makeGame({ status: GameStatus.scheduled }));

      await service.create(dto as any, actorId);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'game_created' }));
    });

    it('envía mensaje a WhatsApp cuando el registro abre inmediatamente', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      // registration time in the past → registration_open
      const pastDto = { ...dto, registrationOpenTime: '00:00', gameDate: '2020-01-01' };
      mockPrisma.game.create.mockResolvedValue(makeGame({ status: GameStatus.registration_open }));

      await service.create(pastDto as any, actorId);
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalled();
    });

    it('NO envía WhatsApp cuando el registro aún no ha abierto', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      const futureDto = { ...dto, gameDate: '2099-12-31', registrationOpenTime: '10:00' };
      mockPrisma.game.create.mockResolvedValue(makeGame({ status: GameStatus.scheduled }));

      await service.create(futureDto as any, actorId);
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('permite crear juego si el juego anterior del mismo día está completado', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null); // excluye cancelled/completed — retorna null
      mockPrisma.game.create.mockResolvedValue(makeGame({ status: GameStatus.scheduled }));

      await expect(service.create(dto as any, actorId)).resolves.toBeDefined();
    });
  });

  // ─── register (Bug 2: inactive user validation) ───────────────────────────

  describe('register', () => {
    const txMock = {
      $queryRaw: jest.fn(),
      gameRegistration: {
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      game: { update: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
      txMock.$queryRaw.mockResolvedValue([{
        id: 'game-1', status: 'registration_open', maxMainSpots: 18,
        mainListHasBeenFull: false, guestCutoffTime: '13:30', maxProxyRegistrations: 1, gameDate: new Date('2026-05-11'),
      }]);
    });

    it('lanza BadRequestException si el usuario objetivo no está activo (Bug 2)', async () => {
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      txMock.user.findUnique
        .mockResolvedValueOnce({ status: 'inactive' });

      await expect(
        service.register('game-1', 'target-user', 'admin-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite registrar proxy de usuario activo', async () => {
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      txMock.user.findUnique
        .mockResolvedValueOnce({ status: 'active' })
        .mockResolvedValueOnce({ role: 'admin' });
      txMock.gameRegistration.count.mockResolvedValue(5);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 5 } });
      const created = makeReg({ position: 6 });
      txMock.gameRegistration.create.mockResolvedValue(created);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await expect(
        service.register('game-1', 'target-user', 'admin-user'),
      ).resolves.toBeDefined();
    });

    it('anuncia "X anotó a Y" cuando el registro es en nombre de otro', async () => {
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      txMock.user.findUnique
        .mockResolvedValueOnce({ status: 'active' })
        .mockResolvedValueOnce({ role: 'admin' });
      txMock.gameRegistration.count.mockResolvedValue(5);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 5 } });
      txMock.gameRegistration.create.mockResolvedValue(
        makeReg({
          position: 6,
          userId: 'target-user',
          registeredById: 'admin-user',
          user: { id: 'target-user', name: 'Carlos', username: 'carlos', phone: '222', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          registeredBy: { id: 'admin-user', name: 'Milton', username: 'milton' },
        }),
      );
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.register('game-1', 'target-user', 'admin-user');

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('*Milton* anotó a *Carlos*'),
      );
    });

    it('el registro proxy NO requiere confirmación (se registra directo)', async () => {
      txMock.$queryRaw.mockResolvedValue([{
        id: 'game-1', status: 'registration_open', maxMainSpots: 18,
        mainListHasBeenFull: false, guestCutoffTime: '23:59', maxProxyRegistrations: 5,
        gameDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }]);
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      txMock.user.findUnique
        .mockResolvedValueOnce({ status: 'active' })
        .mockResolvedValueOnce({ role: 'admin' });
      txMock.gameRegistration.count.mockResolvedValue(0);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      txMock.gameRegistration.create.mockResolvedValue(makeReg());
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.register('game-1', 'target-user', 'admin-user');

      const createArg = txMock.gameRegistration.create.mock.calls[0][0];
      expect(createArg.data.pendingConfirmation).toBeUndefined();
      expect(createArg.data.confirmationDeadline).toBeUndefined();
    });
  });

  // ─── complete ──────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('lanza BadRequestException si el juego ya está completado', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ status: GameStatus.completed }) as any);
      await expect(service.complete('game-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el juego está cancelado', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ status: GameStatus.cancelled }) as any);
      await expect(service.complete('game-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('actualiza el estado a completed y llama audit', async () => {
      const game = makeGame({ status: GameStatus.registration_open, vigilante: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      const updated = { ...game, status: GameStatus.completed };
      mockPrisma.game.update.mockResolvedValue(updated);

      const result = await service.complete('game-1', 'actor-1');
      expect(result.game.status).toBe(GameStatus.completed);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'game_completed' }));
    });

    it('devuelve el reporte junto al juego', async () => {
      const game = makeGame({ status: GameStatus.registration_open, vigilante: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      mockPrisma.game.update.mockResolvedValue({ ...game, status: GameStatus.completed });

      const result = await service.complete('game-1', 'actor-1');
      expect(typeof result.report).toBe('string');
      expect(result.report.length).toBeGreaterThan(0);
    });

    it('envía reporte a WhatsApp cuando NO es silent', async () => {
      const game = makeGame({ status: GameStatus.registration_open, vigilante: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      mockPrisma.game.update.mockResolvedValue({ ...game, status: GameStatus.completed });

      await service.complete('game-1', 'actor-1');
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalled();
    });

    it('NO envía WhatsApp cuando es silent', async () => {
      const game = makeGame({ status: GameStatus.registration_open, vigilante: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      mockPrisma.game.update.mockResolvedValue({ ...game, status: GameStatus.completed });

      await service.complete('game-1', 'actor-1', { silent: true });
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('persiste completionReport en prisma.game.update', async () => {
      const game = makeGame({ status: GameStatus.registration_open, vigilante: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      mockPrisma.game.update.mockResolvedValue({ ...game, status: GameStatus.completed });

      const result = await service.complete('game-1', 'actor-1', { silent: true });

      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: GameStatus.completed,
            completionReport: expect.any(String),
          }),
        }),
      );
      expect(typeof result.report).toBe('string');
      expect(result.report.length).toBeGreaterThan(0);
    });
  });

  // ─── removeRegistration ────────────────────────────────────────────────────

  describe('removeRegistration', () => {
    it('lanza NotFoundException si el registro no existe', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);
      await expect(
        service.removeRegistration('game-1', 'user-1', 'actor-1', Role.member),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si un miembro intenta remover a otro', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'other-user' }));
      await expect(
        service.removeRegistration('game-1', 'other-user', 'actor-1', Role.member),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite a un admin remover a cualquier jugador', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'other-user' }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      const game = makeGame();
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await expect(
        service.removeRegistration('game-1', 'other-user', 'actor-admin', Role.admin),
      ).resolves.toBeDefined();
    });

    it('permite a un miembro removerse a sí mismo', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'user-1' }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await expect(
        service.removeRegistration('game-1', 'user-1', 'user-1', Role.member),
      ).resolves.toBeDefined();
    });

    it('NO envía WhatsApp cuando es silent', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg());
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member, { silent: true });
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('llama autoPromoteIfNeeded cuando se remueve de la lista principal', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ isWaitingList: false }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      const autoPromoteSpy = jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member);
      expect(autoPromoteSpy).toHaveBeenCalledWith('game-1');
    });

    it('NO llama autoPromoteIfNeeded cuando se remueve de la lista de espera', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ isWaitingList: true }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      const autoPromoteSpy = jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member);
      expect(autoPromoteSpy).not.toHaveBeenCalled();
    });

    it('recompacts positions after removal (Bug 3)', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'user-1', position: 2, isWaitingList: false }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member, { silent: true });

      expect(mockPrisma.gameRegistration.updateMany).toHaveBeenCalledWith({
        where: { gameId: 'game-1', isWaitingList: false, position: { gt: 2 } },
        data: { position: { decrement: 1 } },
      });
    });

    it('removes orphaned guests when inviter leaves (Bug 4)', async () => {
      const inviterReg = makeReg({ userId: 'user-1', position: 3, isWaitingList: false });
      const orphanedGuests = [
        { id: 'guest-1', guestName: 'Guest A', position: 5, isWaitingList: false },
        { id: 'guest-2', guestName: 'Guest B', position: 2, isWaitingList: true },
      ];
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(inviterReg);
      mockPrisma.gameRegistration.findMany.mockResolvedValue(orphanedGuests);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member, { silent: true });

      expect(mockPrisma.gameRegistration.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['guest-1', 'guest-2'] } },
      });
    });

    it('does not query orphaned guests for guest registrations (Bug 4)', async () => {
      const guestReg = makeReg({ userId: null, isGuest: true, guestName: 'Invitado', isWaitingList: true, user: null });
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(guestReg);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'guest', 'actor-admin', Role.admin, { regId: 'reg-1', silent: true });

      expect(mockPrisma.gameRegistration.findMany).not.toHaveBeenCalled();
    });

    it('mentions orphaned guests in WhatsApp message (Bug 4)', async () => {
      const inviterReg = makeReg({ userId: 'user-1', position: 3, isWaitingList: false });
      const orphanedGuests = [
        { id: 'guest-1', guestName: 'Carlos', position: 5, isWaitingList: false },
      ];
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(inviterReg);
      mockPrisma.gameRegistration.findMany.mockResolvedValue(orphanedGuests);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member);

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('Carlos'),
      );
    });

    it('mensaje de salida propia dice "salió"', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'user-1', isWaitingList: false }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member);

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('salió'));
    });

    it('mensaje de baja por admin dice "sacado de la lista por un admin"', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'user-1', isWaitingList: false }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'admin-1', Role.admin);

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('sacado de la lista por un admin'));
    });

    it('envía el mensaje de salida ANTES de auto-promover (orden correcto en el chat)', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg({ userId: 'user-1', isWaitingList: false }));
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      const autoPromoteSpy = jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member);

      const sendOrder = mockWhatsapp.sendToGroup.mock.invocationCallOrder[0];
      const promoteOrder = autoPromoteSpy.mock.invocationCallOrder[0];
      expect(sendOrder).toBeLessThan(promoteOrder);
    });

    it('permite remover un invitado por regId', async () => {
      const guestReg = makeReg({ userId: null, isGuest: true, guestName: 'Invitado', isWaitingList: true, user: null });
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(guestReg);
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      jest.spyOn(service, 'autoPromoteIfNeeded').mockResolvedValue(undefined);

      await expect(
        service.removeRegistration('game-1', 'guest', 'actor-admin', Role.admin, { regId: 'reg-1' }),
      ).resolves.toBeDefined();
    });
  });

  // ─── buildCounts ───────────────────────────────────────────────────────────

  describe('buildCounts (via generateReport)', () => {
    it('muestra cupos disponibles cuando la lista no está llena', () => {
      const game = { maxMainSpots: 18, registrations: [{ isWaitingList: false }] };
      // Access via indirect call through a public method
      const result = (service as any).buildCounts(game);
      expect(result).toContain('1/18');
      expect(result).toContain('17 disponibles');
    });

    it('muestra lista llena cuando mainCount >= maxMainSpots', () => {
      const regs = Array.from({ length: 18 }, () => ({ isWaitingList: false }));
      const game = { maxMainSpots: 18, registrations: regs };
      const result = (service as any).buildCounts(game);
      expect(result).toContain('llena');
      expect(result).toContain('18/18');
    });

    it('incluye conteo de lista de espera cuando está llena y hay en espera', () => {
      const regs = [
        ...Array.from({ length: 18 }, () => ({ isWaitingList: false })),
        { isWaitingList: true },
        { isWaitingList: true },
      ];
      const game = { maxMainSpots: 18, registrations: regs };
      const result = (service as any).buildCounts(game);
      expect(result).toContain('2 en espera');
    });

    it('con cero registros muestra 0 cupos ocupados', () => {
      const result = (service as any).buildCounts({ maxMainSpots: 18, registrations: [] });
      expect(result).toContain('0/18');
    });
  });

  // ─── previewReport ──────────────────────────────────────────────────────────

  describe('previewReport', () => {
    it('devuelve report y fineable con jugadores no asistentes de la lista principal', async () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({ id: 'reg-ok', userId: 'u1', attended: true, isWaitingList: false, fineExempt: false }),
          makeReg({
            id: 'reg-noshow', userId: 'u2', attended: false, isWaitingList: false, fineExempt: false,
            user: { id: 'u2', name: 'No Show', username: 'noshow', phone: '222', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          }),
          makeReg({
            id: 'reg-wait', userId: 'u3', attended: false, isWaitingList: true, fineExempt: false,
            user: { id: 'u3', name: 'Waiting', username: 'waiting', phone: '333', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          }),
        ],
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);

      const result = await service.previewReport('game-1');

      expect(typeof result.report).toBe('string');
      expect(result.fineable).toHaveLength(1);
      expect(result.fineable[0]).toEqual(expect.objectContaining({
        regId: 'reg-noshow',
        userId: 'u2',
        name: 'No Show',
        fineExempt: false,
      }));
    });

    it('incluye fineExempt status en los jugadores multables', async () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({
            id: 'reg-exempt', userId: 'u-ex', attended: false, isWaitingList: false, fineExempt: true,
            user: { id: 'u-ex', name: 'Exempt', username: 'ex', phone: '555', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
          }),
        ],
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);

      const result = await service.previewReport('game-1');

      expect(result.fineable).toHaveLength(1);
      expect(result.fineable[0].fineExempt).toBe(true);
    });
  });

  // ─── setFineExempt ──────────────────────────────────────────────────────────

  describe('setFineExempt', () => {
    it('actualiza el registro, audita y emite SSE', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(makeReg());
      mockPrisma.gameRegistration.update.mockResolvedValue({});
      const game = makeGame();
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);

      const result = await service.setFineExempt('game-1', 'reg-1', true, 'actor-1');

      expect(mockPrisma.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1' },
          data: { fineExempt: true },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'fine_exemption_toggled',
          details: { fineExempt: true },
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({ gameId: 'game-1', type: 'update' }),
      );
      expect(result).toEqual(game);
    });

    it('lanza NotFoundException si el registro no existe', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);

      await expect(
        service.setFineExempt('game-1', 'reg-999', true, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getStoredReport ────────────────────────────────────────────────────────

  describe('getStoredReport', () => {
    it('devuelve el reporte almacenado si existe completionReport', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        completionReport: 'Stored report text',
        status: GameStatus.completed,
      });

      const result = await service.getStoredReport('game-1');

      expect(result.report).toBe('Stored report text');
    });

    it('genera el reporte al vuelo cuando no hay completionReport', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        completionReport: null,
        status: GameStatus.registration_open,
      });
      const game = makeGame({ vigilante: 0, registrations: [] });
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);

      const result = await service.getStoredReport('game-1');

      expect(typeof result.report).toBe('string');
      expect(result.report.length).toBeGreaterThan(0);
      expect(service.findOne).toHaveBeenCalledWith('game-1');
    });

    it('lanza NotFoundException si el partido no existe', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);

      await expect(service.getStoredReport('game-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── promote ────────────────────────────────────────────────────────────────

  describe('promote', () => {
    const txMock = {
      $queryRaw: jest.fn(),
      gameRegistration: {
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
      },
      game: { findUniqueOrThrow: jest.fn() },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
    });

    it('promueve jugador de espera a lista principal', async () => {
      const waitReg = makeReg({ isWaitingList: true, position: 1 });
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findFirst.mockResolvedValue(waitReg);
      txMock.game.findUniqueOrThrow.mockResolvedValue(makeGame({ maxMainSpots: 18 }));
      txMock.gameRegistration.count.mockResolvedValue(10);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 10 } });
      const promoted = makeReg({ isWaitingList: false, position: 11, fromWaitList: true });
      txMock.gameRegistration.update.mockResolvedValue(promoted);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.promote('game-1', 'reg-1', 'actor-1');

      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isWaitingList: false, fromWaitList: true }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'player_promoted' }),
      );
      expect(mockEvents.emit).toHaveBeenCalled();
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('promovido'),
      );
    });

    it('lanza NotFoundException si el registro no está en lista de espera', async () => {
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findFirst.mockResolvedValue(null);

      await expect(service.promote('game-1', 'reg-1', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si la lista principal está llena', async () => {
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findFirst.mockResolvedValue(makeReg({ isWaitingList: true }));
      txMock.game.findUniqueOrThrow.mockResolvedValue(makeGame({ maxMainSpots: 18 }));
      txMock.gameRegistration.count.mockResolvedValue(18);

      await expect(service.promote('game-1', 'reg-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── demote ─────────────────────────────────────────────────────────────────

  describe('demote', () => {
    const txMock = {
      $queryRaw: jest.fn(),
      gameRegistration: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
      txMock.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
    });

    it('mueve jugador de lista principal a lista de espera', async () => {
      const mainReg = makeReg({ isWaitingList: false, position: 5 });
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findFirst.mockResolvedValue(mainReg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 3 } });
      const demoted = makeReg({ isWaitingList: true, position: 4, fromWaitList: false });
      txMock.gameRegistration.update.mockResolvedValue(demoted);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.demote('game-1', 'reg-1', 'actor-1');

      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isWaitingList: true, fromWaitList: false }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'player_demoted' }),
      );
      expect(mockEvents.emit).toHaveBeenCalled();
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('lista de espera'),
      );
    });

    it('lanza NotFoundException si el registro no está en lista principal', async () => {
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findFirst.mockResolvedValue(null);

      await expect(service.demote('game-1', 'reg-1', 'actor-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── promoteNext ──────────────────────────────────────────────────────────

  describe('promoteNext', () => {
    it('promueve al primer jugador de la lista de espera', async () => {
      mockPrisma.game.findUniqueOrThrow.mockResolvedValue(makeGame({ maxMainSpots: 18 }));
      mockPrisma.gameRegistration.count.mockResolvedValue(16);
      const firstWait = makeReg({ id: 'wait-1', isWaitingList: true, position: 1 });
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(firstWait);
      jest.spyOn(service, 'promote').mockResolvedValue(makeGame() as any);

      const result = await service.promoteNext('game-1', 'actor-1');

      expect(service.promote).toHaveBeenCalledWith('game-1', 'wait-1', 'actor-1', { silent: true });
      expect(result.promotedName).toBe('Test User');
    });

    it('lanza BadRequestException si la lista principal está llena', async () => {
      mockPrisma.game.findUniqueOrThrow.mockResolvedValue(makeGame({ maxMainSpots: 18 }));
      mockPrisma.gameRegistration.count.mockResolvedValue(18);

      await expect(service.promoteNext('game-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si no hay nadie en lista de espera', async () => {
      mockPrisma.game.findUniqueOrThrow.mockResolvedValue(makeGame({ maxMainSpots: 18 }));
      mockPrisma.gameRegistration.count.mockResolvedValue(16);
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);

      await expect(service.promoteNext('game-1', 'actor-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── shouldGoToWaitingList ─────────────────────────────────────────────────

  describe('shouldGoToWaitingList', () => {
    it('retorna true para invitado antes de la hora de corte', () => {
      expect(service.shouldGoToWaitingList(5, 0, 18, false, true, true)).toBe(true);
    });

    it('retorna true cuando lista principal está llena', () => {
      expect(service.shouldGoToWaitingList(18, 0, 18, false, false, false)).toBe(true);
    });

    it('retorna true cuando mainListHasBeenFull y hay gente en espera', () => {
      expect(service.shouldGoToWaitingList(10, 3, 18, true, false, false)).toBe(true);
    });

    it('retorna false cuando hay cupo y no se ha llenado nunca', () => {
      expect(service.shouldGoToWaitingList(10, 0, 18, false, false, false)).toBe(false);
    });

    it('retorna false para invitado después de corte con cupo y espera vacía', () => {
      expect(service.shouldGoToWaitingList(10, 0, 18, false, true, false)).toBe(false);
    });

    it('retorna false cuando mainListHasBeenFull pero espera vacía y hay cupo', () => {
      expect(service.shouldGoToWaitingList(10, 0, 18, true, false, false)).toBe(false);
    });
  });

  // ─── getAvailableMembers ──────────────────────────────────────────────────

  describe('getAvailableMembers', () => {
    it('excluye miembros ya registrados en el juego', async () => {
      mockPrisma.gameRegistration.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      mockPrisma.user = { findMany: jest.fn().mockResolvedValue([{ id: 'user-3', name: 'Available' }]) } as any;

      const result = await service.getAvailableMembers('game-1');

      expect(result).toEqual([{ id: 'user-3', name: 'Available' }]);
      expect((mockPrisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['user-1', 'user-2'] },
          }),
        }),
      );
    });
  });

  // ─── confirmRegistration ─────────────────────────────────────────────────

  describe('confirmRegistration', () => {
    it('confirma un registro pendiente', async () => {
      const pendingReg = makeReg({ pendingConfirmation: true });
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(pendingReg);
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 1 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      const result = await service.confirmRegistration('game-1', 'user-1');

      expect(mockPrisma.gameRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pendingConfirmation: false, confirmationDeadline: null },
        }),
      );
      expect(result.confirmedOwn).toBe(true);
      expect(result.confirmedGuests).toEqual([]);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'confirmation_received' }),
      );
    });

    it('confirma invitados del usuario junto con su propio registro', async () => {
      const pendingReg = makeReg({ pendingConfirmation: true });
      const guestReg = { id: 'guest-reg-1', gameId: 'game-1', isGuest: true, guestName: 'Topota', pendingConfirmation: true, registeredById: 'user-1', registeredBy: { name: 'Milton' } };
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(pendingReg);
      mockPrisma.gameRegistration.findMany.mockResolvedValue([guestReg]);
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      const result = await service.confirmRegistration('game-1', 'user-1');

      expect(result.confirmedOwn).toBe(true);
      expect(result.confirmedGuests).toEqual(['Topota']);
    });

    it('confirma solo invitados si el usuario no tiene pendiente propia', async () => {
      const guestReg = { id: 'guest-reg-1', gameId: 'game-1', isGuest: true, guestName: 'Jeffer', pendingConfirmation: true, registeredById: 'user-1', registeredBy: { name: 'Milton' } };
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);
      mockPrisma.gameRegistration.findMany.mockResolvedValue([guestReg]);
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({ count: 1 });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      const result = await service.confirmRegistration('game-1', 'user-1');

      expect(result.confirmedOwn).toBe(false);
      expect(result.confirmedGuests).toEqual(['Jeffer']);
    });

    it('lanza NotFoundException si no tiene confirmación pendiente', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);

      await expect(service.confirmRegistration('game-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── displayName ──────────────────────────────────────────────────────────

  describe('userDisplayName', () => {
    it('returns alias when set', () => {
      expect(userDisplayName({ name: 'Milton Larrañaga', alias: 'Milt' })).toBe('Milt');
    });

    it('returns name when alias is null', () => {
      expect(userDisplayName({ name: 'Milton Larrañaga', alias: null })).toBe('Milton Larrañaga');
    });

    it('returns name when alias is undefined', () => {
      expect(userDisplayName({ name: 'Milton Larrañaga' })).toBe('Milton Larrañaga');
    });

    it('returns name when alias is an empty string', () => {
      expect(userDisplayName({ name: 'Milton Larrañaga', alias: '' })).toBe('Milton Larrañaga');
    });

    it('returns name when alias is only whitespace', () => {
      expect(userDisplayName({ name: 'Milton Larrañaga', alias: '   ' })).toBe('Milton Larrañaga');
    });
  });

  describe('displayName', () => {
    it('returns guest name with inviter', () => {
      const reg = { isGuest: true, guestName: 'Carlos', registeredBy: { name: 'Milton', alias: null }, user: null };
      expect(displayName(reg)).toBe('Carlos (inv. de Milton)');
    });

    it('uses inviter alias when set', () => {
      const reg = { isGuest: true, guestName: 'Carlos', registeredBy: { name: 'Milton Larrañaga', alias: 'Milt' }, user: null };
      expect(displayName(reg)).toBe('Carlos (inv. de Milt)');
    });

    it('returns "Invitado" when guestName is null', () => {
      const reg = { isGuest: true, guestName: null, registeredBy: { name: 'Milton', alias: null }, user: null };
      expect(displayName(reg)).toBe('Invitado (inv. de Milton)');
    });

    it('returns "?" when registeredBy is null for guest', () => {
      const reg = { isGuest: true, guestName: 'Carlos', registeredBy: null, user: null };
      expect(displayName(reg)).toBe('Carlos (inv. de ?)');
    });

    it('returns user name for non-guest', () => {
      const reg = { isGuest: false, user: { name: 'Test User', alias: null }, registeredBy: null };
      expect(displayName(reg)).toBe('Test User');
    });

    it('returns user alias for non-guest when set', () => {
      const reg = { isGuest: false, user: { name: 'Test User', alias: 'Tester' }, registeredBy: null };
      expect(displayName(reg)).toBe('Tester');
    });

    it('returns "Desconocido" when user is null for non-guest', () => {
      const reg = { isGuest: false, user: null, registeredBy: null };
      expect(displayName(reg)).toBe('Desconocido');
    });
  });

  // ─── formatCutoffTime ─────────────────────────────────────────────────────

  describe('formatCutoffTime', () => {
    it('formats 13:30 as 1:30 PM', () => {
      expect(formatCutoffTime('13:30')).toBe('1:30 PM');
    });

    it('formats 10:00 as 10:00 AM', () => {
      expect(formatCutoffTime('10:00')).toBe('10:00 AM');
    });

    it('formats 12:00 as 12:00 PM', () => {
      expect(formatCutoffTime('12:00')).toBe('12:00 PM');
    });

    it('formats 00:00 as 12:00 AM', () => {
      expect(formatCutoffTime('00:00')).toBe('12:00 AM');
    });

    it('formats 15:45 as 3:45 PM', () => {
      expect(formatCutoffTime('15:45')).toBe('3:45 PM');
    });
  });

  // ─── autoPromoteIfNeeded ──────────────────────────────────────────────────

  describe('autoPromoteIfNeeded', () => {
    const txMock = {
      $queryRaw: jest.fn(),
      gameRegistration: {
        count: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
      },
    };

    beforeEach(() => {
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      txMock.gameRegistration.findMany.mockResolvedValue([]);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      txMock.gameRegistration.update.mockResolvedValue({});
    });

    it('does nothing if game is not open or in progress', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ status: GameStatus.completed }));

      await service.autoPromoteIfNeeded('game-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing if mainListHasBeenFull is false (list never filled up)', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ mainListHasBeenFull: false }));

      await service.autoPromoteIfNeeded('game-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing if main list is full', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ maxMainSpots: 18, mainListHasBeenFull: true }));
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(18);

      await service.autoPromoteIfNeeded('game-1');

      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('menciona por whatsappLid cuando está disponible (en vez del teléfono)', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ maxMainSpots: 18, mainListHasBeenFull: true }));
      const waiter = makeReg({
        id: 'wait-1', isWaitingList: true, position: 1, confirmationDeclined: false,
        user: { id: 'user-1', name: 'Test User', username: 'test', phone: '111', whatsappLid: '99999@lid', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
      });
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(16);
      txMock.gameRegistration.findMany.mockResolvedValue([waiter]);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 16 } });
      txMock.gameRegistration.update.mockResolvedValue(waiter);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.autoPromoteIfNeeded('game-1');

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('@99999'),
        { mentions: ['99999@lid'] },
      );
    });

    it('promotes first non-declined waiter without resetting confirmationDeclined flags', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ maxMainSpots: 18, mainListHasBeenFull: true }));
      const waiter = makeReg({ id: 'wait-1', isWaitingList: true, position: 1, confirmationDeclined: false });
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(16);
      txMock.gameRegistration.findMany.mockResolvedValue([waiter]);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 16 } });
      txMock.gameRegistration.update.mockResolvedValue(waiter);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.autoPromoteIfNeeded('game-1');

      expect(txMock.gameRegistration.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ confirmationDeclined: true }),
          data: { confirmationDeclined: false },
        }),
      );
      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wait-1' },
          data: expect.objectContaining({
            isWaitingList: false,
            fromWaitList: true,
            pendingConfirmation: true,
          }),
        }),
      );
      // The confirmation request must @mention the promoted player so they
      // get a WhatsApp notification (falls back to phone JID when no LID).
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('@111'),
        { mentions: ['111@s.whatsapp.net'] },
      );
    });

    it('before cutoff: only promotes non-guests (isGuest: false filter applied)', async () => {
      // Use a future gameDate so isBeforeCutoff returns true
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockPrisma.game.findUnique.mockResolvedValue(
        makeGame({ maxMainSpots: 18, mainListHasBeenFull: true, guestCutoffTime: '23:59', gameDate: futureDate }),
      );
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(16);
      txMock.gameRegistration.findMany.mockResolvedValue([]);

      await service.autoPromoteIfNeeded('game-1');

      expect(txMock.gameRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isGuest: false }),
        }),
      );
    });

    it('after cutoff: promotes guests too (no isGuest filter)', async () => {
      // gameDate in the past → isBeforeCutoff returns false
      mockPrisma.game.findUnique.mockResolvedValue(
        makeGame({ maxMainSpots: 18, mainListHasBeenFull: true, gameDate: new Date('2020-01-01') }),
      );
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(16);
      txMock.gameRegistration.findMany.mockResolvedValue([]);

      await service.autoPromoteIfNeeded('game-1');

      expect(txMock.gameRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isGuest: false }),
        }),
      );
    });

    it('does nothing when no one in waiting list (after reset)', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ maxMainSpots: 18, mainListHasBeenFull: true }));
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );
      txMock.gameRegistration.count.mockResolvedValue(16);
      txMock.gameRegistration.findMany.mockResolvedValue([]);

      await service.autoPromoteIfNeeded('game-1');

      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });
  });

  // ─── handleConfirmationTimeout ────────────────────────────────────────────

  describe('handleConfirmationTimeout', () => {
    const txMock = {
      $queryRaw: jest.fn(),
      gameRegistration: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
      txMock.$queryRaw.mockResolvedValue(undefined);
      txMock.gameRegistration.findUnique.mockResolvedValue({ pendingConfirmation: true });
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      txMock.gameRegistration.updateMany.mockResolvedValue({ count: 0 });
      txMock.gameRegistration.update.mockResolvedValue({});
    });

    it('does nothing if reg is not pending confirmation', async () => {
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(makeReg({ pendingConfirmation: false }));

      await service.handleConfirmationTimeout('reg-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('marks reg as declined and returns to waiting list (clamped position)', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 5 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 3 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-1');

      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isWaitingList: true,
            position: 4,
            pendingConfirmation: false,
            confirmationDeclined: true,
          }),
        }),
      );
    });

    it('returns to original position when waiting list is smaller', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 2 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 5 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-1');

      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            position: 2,
          }),
        }),
      );
    });

    it('sends "nadie confirmó" message when no non-declined waiter available', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 1 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-1');

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('Nadie en lista de espera confirmó'),
      );
    });

    it('promotes next non-declined waiter with 5min deadline', async () => {
      const reg = makeReg({ id: 'reg-timeout', pendingConfirmation: true, originalWaitPosition: 1 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });

      const nextWaiter = makeReg({ id: 'wait-2', userId: 'user-2', isWaitingList: true, position: 2, confirmationDeclined: false,
        user: { id: 'user-2', name: 'Next Player', username: 'next', phone: '222', position: null, gender: null, heightCm: null, birthDate: null, photoUrl: null, bio: null },
      });
      txMock.gameRegistration.findFirst.mockResolvedValue(nextWaiter);
      txMock.gameRegistration.update.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-timeout');

      // Next waiter should be promoted and given confirmation deadline inside the tx
      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wait-2' },
          data: expect.objectContaining({
            isWaitingList: false,
            fromWaitList: true,
            pendingConfirmation: true,
            originalWaitPosition: 2,
          }),
        }),
      );
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('5 min'),
        { mentions: ['222@s.whatsapp.net'] },
      );
    });

    it('queries only non-declined waiters for next promote', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 1 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-1');

      expect(txMock.gameRegistration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            confirmationDeclined: false,
          }),
        }),
      );
    });

    // ── Bug 3: proxy sin originalWaitPosition va al final, no a posición 1 ──

    it('BUG3: proxy sin originalWaitPosition vuelve al final del waitlist, no a posición 1', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: null });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ status: GameStatus.registration_open }));
      txMock.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 3 } });
      txMock.gameRegistration.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.handleConfirmationTimeout('reg-1');

      expect(txMock.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 4 }),
        }),
      );
    });

    // ── Bug 1&2: idempotencia — segunda llamada concurrente no produce duplicados ──

    it('BUG1&2: segunda llamada concurrente es no-op si el registro ya fue procesado (re-check en transacción)', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 1 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ status: GameStatus.registration_open }));
      mockPrisma.gameRegistration.aggregate.mockResolvedValue({ _max: { position: 0 } });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);

      // Simula que dentro de la transacción el registro YA fue procesado por otra llamada concurrente
      txMock.gameRegistration.findUnique.mockResolvedValue({ pendingConfirmation: false });

      await service.handleConfirmationTimeout('reg-1');

      // No debe ejecutar el update de posición ni enviar WhatsApp
      expect(txMock.gameRegistration.update).not.toHaveBeenCalled();
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });
  });

  // ─── shouldGoToWaitingList (extended: all-declined) ───────────────────────

  describe('shouldGoToWaitingList (all-declined scenario)', () => {
    it('retorna false cuando mainListHasBeenFull but activeWaitCount=0 (all declined)', () => {
      expect(service.shouldGoToWaitingList(10, 0, 18, true, false, false)).toBe(false);
    });

    it('retorna true cuando mainListHasBeenFull and activeWaitCount > 0', () => {
      expect(service.shouldGoToWaitingList(10, 2, 18, true, false, false)).toBe(true);
    });

    it('retorna false cuando solo hay invitados en espera y estamos antes del corte (eligibleWait=0)', () => {
      expect(service.shouldGoToWaitingList(17, 0, 18, true, false, false)).toBe(false);
    });
  });

  // ─── isBeforeCutoff ──────────────────────────────────────────────────────

  describe('isBeforeCutoff (EC9: game date aware)', () => {
    it('returns true when game date is in the future (regardless of current time)', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(service.isBeforeCutoff('13:30', futureDate)).toBe(true);
    });

    it('returns false when game date is in the past', () => {
      const pastDate = new Date('2020-01-01');
      expect(service.isBeforeCutoff('13:30', pastDate)).toBe(false);
    });

    it('falls back to time-only comparison when no game date provided', () => {
      const result = service.isBeforeCutoff('23:59');
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── handleConfirmationTimeout (game completed) ──────────────────────────

  describe('handleConfirmationTimeout (game completed guard)', () => {
    it('clears pending flag and returns early if game is completed', async () => {
      const reg = makeReg({ pendingConfirmation: true, originalWaitPosition: 1 });
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(reg);
      mockPrisma.game.findUnique.mockResolvedValue(makeGame({ status: GameStatus.completed }));
      mockPrisma.gameRegistration.update.mockResolvedValue({});

      await service.handleConfirmationTimeout('reg-1');

      expect(mockPrisma.gameRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── registerGuest validation (EC8) ─────────────────────────────────────

  describe('registerGuest (EC8: empty guest name)', () => {
    it('throws BadRequestException for empty guest name', async () => {
      await expect(
        service.registerGuest('game-1', '', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for whitespace-only guest name', async () => {
      await expect(
        service.registerGuest('game-1', '   ', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── generateReport with guests ──────────────────────────────────────────

  describe('generateReport (guest display)', () => {
    it('shows guest name with inviter in report sections', () => {
      const game = makeGame({
        vigilante: 0,
        registrations: [
          makeReg({
            isGuest: true,
            guestName: 'Carlos',
            userId: null,
            user: null,
            attended: true,
            paid: false,
            isWaitingList: false,
            registeredBy: { id: 'user-1', name: 'Milton', username: 'milton' },
          }),
        ],
      });
      const report = service.generateReport(game as any);
      expect(report).toContain('Carlos (inv. de Milton)');
    });
  });

  // ─── reorder ───────────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('ejecuta la reordenação dentro de uma transação', async () => {
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.reorder('game-1', { mainList: ['r1', 'r2'], waitList: [] }, 'admin-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('asigna posiciones consecutivas a cada lista', async () => {
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.reorder('game-1', { mainList: ['r1', 'r2', 'r3'], waitList: ['w1'] }, 'admin-1');

      expect(mockPrisma.gameRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 1, isWaitingList: false }) }),
      );
      expect(mockPrisma.gameRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 3, isWaitingList: false }) }),
      );
      expect(mockPrisma.gameRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 1, isWaitingList: true }) }),
      );
    });

    it('llama a audit.log con "player_reordered"', async () => {
      mockPrisma.gameRegistration.updateMany.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.reorder('game-1', { mainList: [], waitList: [] }, 'admin-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'player_reordered', actorId: 'admin-1' }),
      );
    });
  });

  // ─── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('lanza BadRequestException si el partido ya está completado', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ status: GameStatus.completed }) as any);
      await expect(service.cancel('game-1', { reason: '' }, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el partido ya está cancelado', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ status: GameStatus.cancelled }) as any);
      await expect(service.cancel('game-1', { reason: '' }, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cambia el estado a cancelled', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ status: GameStatus.registration_open }) as any);
      const cancelled = makeGame({ status: GameStatus.cancelled });
      mockPrisma.game.update.mockResolvedValue(cancelled);

      const result = await service.cancel('game-1', { reason: 'Lluvia' }, 'admin-1');

      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: GameStatus.cancelled, cancellationReason: 'Lluvia' }),
        }),
      );
      expect(result.status).toBe(GameStatus.cancelled);
    });

    it('llama a audit.log con "game_cancelled"', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);
      mockPrisma.game.update.mockResolvedValue(makeGame({ status: GameStatus.cancelled }));

      await service.cancel('game-1', { reason: 'Test' }, 'admin-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'game_cancelled' }),
      );
    });

    it('envía mensaje de WhatsApp al cancelar', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame({ title: 'Voley VIE' }) as any);
      mockPrisma.game.update.mockResolvedValue(makeGame({ status: GameStatus.cancelled }));
      mockWhatsapp.sendToGroup.mockResolvedValue(undefined);

      await service.cancel('game-1', { reason: '' }, 'admin-1');

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('Voley VIE'),
      );
    });
  });

  // ─── updateRegistration ────────────────────────────────────────────────────

  describe('updateRegistration', () => {
    it('lanza NotFoundException si el registro no pertenece al partido', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);
      await expect(
        service.updateRegistration('reg-99', { attended: true }, 'admin-1', 'game-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('verifica gameId en la búsqueda (prevención IDOR)', async () => {
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(null);
      await expect(
        service.updateRegistration('reg-1', { attended: true }, 'admin-1', 'otro-game'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.gameRegistration.findFirst).toHaveBeenCalledWith({
        where: { id: 'reg-1', gameId: 'otro-game' },
      });
    });

    it('actualiza el campo attended y llama a audit.log', async () => {
      const reg = makeReg();
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(reg);
      mockPrisma.gameRegistration.update.mockResolvedValue({ ...reg, attended: true });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.updateRegistration('reg-1', { attended: true }, 'admin-1', 'game-1');

      expect(mockPrisma.gameRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reg-1', gameId: 'game-1' },
          data: { attended: true },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'attendance_toggled' }),
      );
    });

    it('actualiza el campo paid y llama a audit.log', async () => {
      const reg = makeReg();
      mockPrisma.gameRegistration.findFirst.mockResolvedValue(reg);
      mockPrisma.gameRegistration.update.mockResolvedValue({ ...reg, paid: true });
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.updateRegistration('reg-1', { paid: true }, 'admin-1', 'game-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payment_toggled' }),
      );
    });
  });
});
