import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from './games.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { GameStatus } from '@prisma/client';

@Injectable()
export class GameSchedulerService {
  private readonly logger = new Logger(GameSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private games: GamesService,
    private whatsapp: WhatsappService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkRegistrationOpening() {
    const now = new Date();

    const gamesToOpen = await this.prisma.game.findMany({
      where: {
        status: GameStatus.scheduled,
        registrationOpenAt: { lte: now },
      },
    });

    for (const game of gamesToOpen) {
      try {
        await this.games.openRegistration(game.id);

        const message = this.games.buildRegistrationOpenMessage(game);
        await this.whatsapp.sendToGroup(message);
        this.logger.log(`Registro abierto para: ${game.title}`);
      } catch (e) {
        this.logger.error(`Error abriendo registro para ${game.id}:`, e);
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkConfirmationTimeouts() {
    const now = new Date();

    const expired = await this.prisma.gameRegistration.findMany({
      where: {
        pendingConfirmation: true,
        confirmationDeadline: { lte: now },
      },
      include: {
        game: { select: { status: true } },
      },
    });

    for (const reg of expired) {
      if (reg.game.status !== 'registration_open' && reg.game.status !== 'in_progress') continue;

      try {
        await this.games.handleConfirmationTimeout(reg.id);
        this.logger.log(`Confirmación expirada para registro ${reg.id}`);
      } catch (e) {
        this.logger.error(`Error procesando timeout de confirmación ${reg.id}:`, e);
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkGuestCutoff() {
    const activeGames = await this.prisma.game.findMany({
      where: {
        status: { in: [GameStatus.registration_open, GameStatus.in_progress] },
        cutoffNotified: false,
      },
    });

    for (const game of activeGames) {
      const isBefore = this.games.isBeforeCutoff(game.guestCutoffTime, game.gameDate);
      if (isBefore) continue;

      try {
        await this.prisma.game.update({
          where: { id: game.id },
          data: { cutoffNotified: true },
        });

        await this.whatsapp.sendToGroup(
          `⏰ *Hora de corte alcanzada* para *${game.title}*\n` +
          `A partir de ahora, invitados y miembros en lista de espera tienen la misma prioridad para cupos libres.`,
        );
        this.logger.log(`Cutoff notificado para: ${game.title}`);

        // After cutoff, fill any open spots from the waitlist (guests now have equal priority).
        // Auto-promotion confirmations keep their own 15-min window and are handled
        // by checkConfirmationTimeouts when they actually expire — the cutoff must
        // not prematurely expire a still-pending auto-promotion.
        await this.games.autoPromoteIfNeeded(game.id, { skipMainListFullCheck: true });
      } catch (e) {
        this.logger.error(`Error procesando cutoff para ${game.id}:`, e);
      }
    }
  }
}
