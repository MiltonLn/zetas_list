import { Test, TestingModule } from '@nestjs/testing';
import { GameSchedulerService } from './game-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from './games.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { GameStatus } from '@prisma/client';

const mockPrisma = {
  game: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  gameRegistration: {
    findMany: jest.fn(),
  },
};

const mockGames = {
  openRegistration: jest.fn(),
  buildRegistrationOpenMessage: jest.fn().mockReturnValue('¡Inscripción abierta!'),
  handleConfirmationTimeout: jest.fn(),
  isBeforeCutoff: jest.fn(),
  autoPromoteIfNeeded: jest.fn(),
};

const mockWhatsapp = {
  sendToGroup: jest.fn().mockResolvedValue(undefined),
};

function makeGame(overrides: Partial<any> = {}) {
  return {
    id: 'game-1',
    title: 'Voley VIE',
    status: GameStatus.registration_open,
    guestCutoffTime: '13:30',
    gameDate: new Date('2026-01-10'),
    cutoffNotified: false,
    ...overrides,
  };
}

function makeReg(overrides: Partial<any> = {}) {
  return {
    id: 'reg-1',
    gameId: 'game-1',
    pendingConfirmation: true,
    confirmationDeadline: new Date(Date.now() - 1000),
    game: { status: GameStatus.registration_open },
    user: { name: 'Juan' },
    ...overrides,
  };
}

describe('GameSchedulerService', () => {
  let scheduler: GameSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GamesService, useValue: mockGames },
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();

    scheduler = module.get<GameSchedulerService>(GameSchedulerService);
  });

  // ─── checkRegistrationOpening ──────────────────────────────────────────────

  describe('checkRegistrationOpening', () => {
    it('no hace nada si no hay partidos por abrir', async () => {
      mockPrisma.game.findMany.mockResolvedValue([]);
      await scheduler.checkRegistrationOpening();
      expect(mockGames.openRegistration).not.toHaveBeenCalled();
    });

    it('abre el registro de cada partido encontrado', async () => {
      const games = [makeGame({ id: 'g1' }), makeGame({ id: 'g2' })];
      mockPrisma.game.findMany.mockResolvedValue(games);
      mockGames.openRegistration.mockResolvedValue(undefined);

      await scheduler.checkRegistrationOpening();

      expect(mockGames.openRegistration).toHaveBeenCalledTimes(2);
      expect(mockGames.openRegistration).toHaveBeenCalledWith('g1');
      expect(mockGames.openRegistration).toHaveBeenCalledWith('g2');
    });

    it('envía mensaje de WhatsApp al abrir el registro', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.openRegistration.mockResolvedValue(undefined);

      await scheduler.checkRegistrationOpening();

      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith('¡Inscripción abierta!');
    });

    it('continúa con otros partidos si uno falla', async () => {
      const games = [makeGame({ id: 'g1' }), makeGame({ id: 'g2' })];
      mockPrisma.game.findMany.mockResolvedValue(games);
      mockGames.openRegistration
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);

      await expect(scheduler.checkRegistrationOpening()).resolves.not.toThrow();
      expect(mockGames.openRegistration).toHaveBeenCalledTimes(2);
    });
  });

  // ─── checkConfirmationTimeouts ─────────────────────────────────────────────

  describe('checkConfirmationTimeouts', () => {
    it('no hace nada si no hay confirmaciones expiradas', async () => {
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      await scheduler.checkConfirmationTimeouts();
      expect(mockGames.handleConfirmationTimeout).not.toHaveBeenCalled();
    });

    it('procesa el timeout de cada registro expirado', async () => {
      const regs = [makeReg({ id: 'r1' }), makeReg({ id: 'r2' })];
      mockPrisma.gameRegistration.findMany.mockResolvedValue(regs);
      mockGames.handleConfirmationTimeout.mockResolvedValue(undefined);

      await scheduler.checkConfirmationTimeouts();

      expect(mockGames.handleConfirmationTimeout).toHaveBeenCalledTimes(2);
      expect(mockGames.handleConfirmationTimeout).toHaveBeenCalledWith('r1');
      expect(mockGames.handleConfirmationTimeout).toHaveBeenCalledWith('r2');
    });

    it('omite registros de partidos que no están activos', async () => {
      const reg = makeReg({ game: { status: GameStatus.completed } });
      mockPrisma.gameRegistration.findMany.mockResolvedValue([reg]);

      await scheduler.checkConfirmationTimeouts();

      expect(mockGames.handleConfirmationTimeout).not.toHaveBeenCalled();
    });

    it('continúa con otros registros si uno falla', async () => {
      const regs = [makeReg({ id: 'r1' }), makeReg({ id: 'r2' })];
      mockPrisma.gameRegistration.findMany.mockResolvedValue(regs);
      mockGames.handleConfirmationTimeout
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);

      await expect(scheduler.checkConfirmationTimeouts()).resolves.not.toThrow();
    });
  });

  // ─── checkGuestCutoff ─────────────────────────────────────────────────────

  describe('checkGuestCutoff', () => {
    it('no hace nada si no hay partidos activos sin notificar', async () => {
      mockPrisma.game.findMany.mockResolvedValue([]);
      await scheduler.checkGuestCutoff();
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('no notifica si aún es antes del cutoff', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.isBeforeCutoff.mockReturnValue(true);

      await scheduler.checkGuestCutoff();

      expect(mockPrisma.game.update).not.toHaveBeenCalled();
    });

    it('marca cutoffNotified y envía mensaje cuando se alcanza el cutoff', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update.mockResolvedValue({});
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);

      await scheduler.checkGuestCutoff();

      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { cutoffNotified: true } }),
      );
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('corte'),
      );
    });

    it('al corte NO expira confirmaciones pendientes (las maneja checkConfirmationTimeouts)', async () => {
      // Al quitar la confirmación de proxy, el corte ya no debe expirar
      // confirmaciones: las autopromociones conservan su ventana de 15 min y
      // son manejadas exclusivamente por checkConfirmationTimeouts cuando vencen.
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update.mockResolvedValue({});
      mockGames.autoPromoteIfNeeded.mockResolvedValue(undefined);

      await scheduler.checkGuestCutoff();

      expect(mockGames.handleConfirmationTimeout).not.toHaveBeenCalled();
    });

    it('envía el anuncio de corte ANTES de auto-promover', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update.mockResolvedValue({});

      const callOrder: string[] = [];
      mockWhatsapp.sendToGroup.mockImplementation(() => {
        callOrder.push('announce');
        return Promise.resolve();
      });
      mockGames.autoPromoteIfNeeded.mockImplementation(() => {
        callOrder.push('autopromote');
        return Promise.resolve();
      });

      await scheduler.checkGuestCutoff();

      expect(callOrder[0]).toBe('announce');
      expect(callOrder[1]).toBe('autopromote');
    });

    it('continúa con otros partidos si uno falla', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame({ id: 'g1' }), makeGame({ id: 'g2' })]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue({});
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);

      await expect(scheduler.checkGuestCutoff()).resolves.not.toThrow();
    });

    it('llama autoPromoteIfNeeded al llegar el cutoff para llenar cupos con la waitlist', async () => {
      mockPrisma.game.findMany.mockResolvedValue([makeGame()]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update.mockResolvedValue({});
      mockPrisma.gameRegistration.findMany.mockResolvedValue([]);
      mockGames.autoPromoteIfNeeded.mockResolvedValue(undefined);

      await scheduler.checkGuestCutoff();

      expect(mockGames.autoPromoteIfNeeded).toHaveBeenCalledWith('game-1', { skipMainListFullCheck: true });
    });

    // ── El corte ya no compite con las confirmaciones de autopromoción ──

    it('el corte NO expira autopromociones; solo checkConfirmationTimeouts lo hace al vencer', async () => {
      // Bug previo: una autopromoción recibía su ventana de 15 min, pero el corte
      // la expiraba antes de tiempo. Ahora el corte no toca confirmaciones, así que
      // solo checkConfirmationTimeouts las expira (cuando confirmationDeadline <= now).

      const promotedRegId = 'autopromo-reg-1';

      // checkGuestCutoff corre al llegar el corte: no debe expirar nada.
      mockPrisma.game.findMany.mockResolvedValue([makeGame({ cutoffNotified: false })]);
      mockGames.isBeforeCutoff.mockReturnValue(false);
      mockPrisma.game.update.mockResolvedValue({});
      mockGames.autoPromoteIfNeeded.mockResolvedValue(undefined);

      await scheduler.checkGuestCutoff();

      expect(mockGames.handleConfirmationTimeout).not.toHaveBeenCalled();

      // checkConfirmationTimeouts: encuentra la autopromoción vencida (deadline <= now)
      mockPrisma.gameRegistration.findMany.mockResolvedValue([
        makeReg({ id: promotedRegId, game: { status: GameStatus.registration_open } }),
      ]);
      mockGames.handleConfirmationTimeout.mockResolvedValue(undefined);

      await scheduler.checkConfirmationTimeouts();

      expect(mockGames.handleConfirmationTimeout).toHaveBeenCalledWith(promotedRegId);
      expect(mockGames.handleConfirmationTimeout).toHaveBeenCalledTimes(1);
    });
  });
});
