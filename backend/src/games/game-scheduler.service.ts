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

        const appUrl = process.env.APP_URL || 'https://zetas.miltonln.site';
        const gameUrl = `${appUrl}/game/${game.id}`;
        const message =
          `🏐 *${game.title}*\n\n` +
          `¡La inscripción está abierta! 🎉\n\n` +
          `Anótate aquí: ${gameUrl}\n\n` +
          `O escríbeme aquí: *@Z anotame*`;

        await this.whatsapp.sendToGroup(message);
        this.logger.log(`Registro abierto para: ${game.title}`);
      } catch (e) {
        this.logger.error(`Error abriendo registro para ${game.id}:`, e);
      }
    }
  }
}
