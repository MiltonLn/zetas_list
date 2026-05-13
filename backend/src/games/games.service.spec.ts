import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GameStatus, Modalidad, Role } from '@prisma/client';
import { GamesService } from './games.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const mockPrisma = {
  game: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  gameRegistration: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };
const mockEvents = { emit: jest.fn() };
const mockWhatsapp = { sendToGroup: jest.fn(), sendMessage: jest.fn() };

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
    startTime: '19:50',
    registrationOpenAt: new Date('2026-05-11T10:00:00-05:00'),
    maxMainSpots: 18,
    pricePerPlayer: 2000,
    vigilante: 10000,
    status: GameStatus.registration_open,
    cancellationReason: null,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: GameEventsService, useValue: mockEvents },
        { provide: WhatsappService, useValue: mockWhatsapp },
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
      startTime: '19:50',
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
      expect(createCall.data.startTime).toBe('19:50');
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
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(null);
      await expect(
        service.removeRegistration('game-1', 'user-1', 'actor-1', Role.member),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si un miembro intenta remover a otro', async () => {
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(makeReg({ userId: 'other-user' }));
      await expect(
        service.removeRegistration('game-1', 'other-user', 'actor-1', Role.member),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite a un admin remover a cualquier jugador', async () => {
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(makeReg({ userId: 'other-user' }));
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      const game = makeGame();
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);

      await expect(
        service.removeRegistration('game-1', 'other-user', 'actor-admin', Role.admin),
      ).resolves.toBeDefined();
    });

    it('permite a un miembro removerse a sí mismo', async () => {
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(makeReg({ userId: 'user-1' }));
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await expect(
        service.removeRegistration('game-1', 'user-1', 'user-1', Role.member),
      ).resolves.toBeDefined();
    });

    it('NO envía WhatsApp cuando es silent', async () => {
      mockPrisma.gameRegistration.findUnique.mockResolvedValue(makeReg());
      mockPrisma.gameRegistration.delete.mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(makeGame() as any);

      await service.removeRegistration('game-1', 'user-1', 'user-1', Role.member, { silent: true });
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
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
});
