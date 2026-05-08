import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const BOT_NAME = 'Z';
const CMD_REGISTER = /^((@z|z)\s+)?an[oó]tame\b/i;
const CMD_LIST = /^((@z|z)\s+)?lista\b/i;
const CMD_FINISH = /^((@z|z)\s+)?terminar\b/i;

@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    @Inject(forwardRef(() => GamesService)) private games: GamesService,
    private users: UsersService,
    private prisma: PrismaService,
  ) {}

  async handleMessage(phone: string, text: string, groupId: string): Promise<void> {
    const normalized = text.trim();

    const isRegisterCmd = CMD_REGISTER.test(normalized);
    const isListCmd = CMD_LIST.test(normalized);
    const isFinishCmd = CMD_FINISH.test(normalized);

    if (!isRegisterCmd && !isListCmd && !isFinishCmd) return;

    const activeGame = await this.prisma.game.findFirst({
      where: { status: { in: ['registration_open', 'in_progress'] } },
      include: {
        registrations: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
            registeredBy: { select: { id: true, name: true } },
          },
          orderBy: [{ isWaitingList: 'asc' }, { position: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (isListCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup('No hay ninguna lista abierta en el momento 🤷');
        return;
      }
      const list = this.games.formatListForWhatsapp(activeGame as any);
      await this.wp.sendToGroup(list);
      return;
    }

    const user = await this.users.findByPhone(phone);

    if (isFinishCmd) {
      if (!user || user.role !== Role.admin) {
        await this.wp.sendToGroup(`⛔ Solo los administradores pueden usar este comando, ${BOT_NAME} no te obedece 😅`);
        return;
      }
      if (!activeGame) {
        await this.wp.sendToGroup('No hay ningún partido activo para terminar.');
        return;
      }

      try {
        const result = await this.games.complete(activeGame.id, user.id);
        await this.wp.sendToGroup(`✅ Partido terminado!\n\n${result.report}`);
      } catch (e: any) {
        this.logger.error('Error al terminar partido:', e);
        await this.wp.sendToGroup(`❌ Error al terminar partido: ${e.message}`);
      }
      return;
    }

    if (isRegisterCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup('No hay ninguna lista abierta en el momento 🤷');
        return;
      }

      if (!user) {
        await this.wp.sendToGroup(
          `❌ No encontré tu número registrado en el sistema. Pídele a un administrador que te cree una cuenta primero.`,
        );
        return;
      }

      if (user.status !== 'active') {
        await this.wp.sendToGroup(`❌ Tu cuenta está ${user.status}. Contacta a un administrador.`);
        return;
      }

      try {
        const reg = await this.games.register(activeGame.id, user.id, user.id);
        const spot = reg.isWaitingList
          ? `en la *lista de espera* en el puesto ${reg.position}`
          : `en la *lista principal* en el puesto ${reg.position}`;
        await this.wp.sendToGroup(`✅ *${user.name}* se anotó ${spot}! 🏐`);
      } catch (e: any) {
        if (e.message?.includes('Ya estás anotado')) {
          await this.wp.sendToGroup(`ℹ️ ${user.name}, ya estás anotado en esta lista.`);
        } else {
          this.logger.error('Error al anotar:', e);
          await this.wp.sendToGroup(`❌ Error al anotarte: ${e.message}`);
        }
      }
    }
  }
}
