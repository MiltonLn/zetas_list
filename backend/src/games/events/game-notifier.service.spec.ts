import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameNotifier } from './game-notifier.service';
import { GameEvent } from './game-events';
import * as Sentry from '@sentry/nestjs';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const mockEmitter = { emitAsync: jest.fn() };

describe('GameNotifier', () => {
  let notifier: GameNotifier;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmitter.emitAsync.mockResolvedValue([true]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [GameNotifier, { provide: EventEmitter2, useValue: mockEmitter }],
    }).compile();

    notifier = module.get(GameNotifier);
  });

  describe('announce (fire and forget)', () => {
    it('emite el evento con su payload', () => {
      notifier.announceGameCancelled({ gameTitle: 'Voley VIE', reason: 'lluvia' });

      expect(mockEmitter.emitAsync).toHaveBeenCalledWith(GameEvent.GameCancelled, {
        gameTitle: 'Voley VIE',
        reason: 'lluvia',
      });
    });

    it('no propaga el fallo de un listener: la notificación nunca tumba la operación', async () => {
      const error = new Error('WhatsApp down');
      mockEmitter.emitAsync.mockRejectedValue(error);

      expect(() => notifier.announceGameCompleted({ report: 'reporte' })).not.toThrow();
      // Flush the rejected promise so an unhandled rejection would surface here.
      await Promise.resolve();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('espera la entrega al anunciar una salida, para preservar el orden en el chat', async () => {
      let settled = false;
      mockEmitter.emitAsync.mockImplementation(async () => {
        settled = true;
        return [true];
      });

      await notifier.announcePlayerRemoved({
        playerName: 'Ana',
        removedBySelf: true,
        removedGuestNames: [],
        game: { id: 'game-1', maxMainSpots: 18, registrations: [] },
      });

      expect(settled).toBe(true);
    });
  });

  describe('deliver (gated on delivery)', () => {
    it('reporta entregado cuando algún listener confirma el envío', async () => {
      mockEmitter.emitAsync.mockResolvedValue([true]);

      await expect(
        notifier.deliverGuestCutoffReached({ gameTitle: 'Voley VIE' }),
      ).resolves.toBe(true);
    });

    it('reporta NO entregado cuando el listener no pudo enviar', async () => {
      mockEmitter.emitAsync.mockResolvedValue([false]);

      await expect(
        notifier.deliverGuestCutoffReached({ gameTitle: 'Voley VIE' }),
      ).resolves.toBe(false);
    });

    it('reporta NO entregado si no hay listeners, para que el cron reintente', async () => {
      mockEmitter.emitAsync.mockResolvedValue([]);

      await expect(
        notifier.deliverRegistrationOpened({ game: { id: 'game-1', title: 'Voley VIE' } }),
      ).resolves.toBe(false);
    });

    it('reporta NO entregado si el bus lanza', async () => {
      mockEmitter.emitAsync.mockRejectedValue(new Error('bus caído'));

      await expect(
        notifier.deliverGuestCutoffReached({ gameTitle: 'Voley VIE' }),
      ).resolves.toBe(false);
    });
  });
});
