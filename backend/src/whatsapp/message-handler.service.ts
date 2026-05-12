import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const BOT_NAME = 'Z';
const CMD_REGISTER = /^@z\s+(an[oó]tame|m[eé]teme|ap[uú]ntame|juego|voy|entro)\b/i;
const CMD_UNREGISTER = /^@z\s+(salirme|s[aá]came|qu[ií]tame|no\s+voy|no\s+juego|salgo)\b/i;
const CMD_LIST = /^@z\s+(lista|cupos|qui[eé]nes?\s+van|cu[aá]ntos)\b/i;
const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;

@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    @Inject(forwardRef(() => GamesService)) private games: GamesService,
    private users: UsersService,
    private prisma: PrismaService,
  ) {}

  async handleMessage(phone: string, text: string, _groupId: string): Promise<void> {
    const normalized = text.trim();

    const isRegisterCmd = CMD_REGISTER.test(normalized);
    const isUnregisterCmd = CMD_UNREGISTER.test(normalized);
    const isListCmd = CMD_LIST.test(normalized);
    const isFinishCmd = CMD_FINISH.test(normalized);

    if (!isRegisterCmd && !isUnregisterCmd && !isListCmd && !isFinishCmd) return;

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
        const result = await this.games.complete(activeGame.id, user.id, { silent: true });
        await this.wp.sendToGroup(result.report);
      } catch (e: any) {
        this.logger.error('Error al terminar partido:', e);
        await this.wp.sendToGroup(`❌ Error al terminar partido: ${e.message}`);
      }
      return;
    }

    if (isUnregisterCmd) {
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

      try {
        await this.games.removeRegistration(activeGame.id, user.id, user.id, user.role, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const mainCount = updated.registrations.filter((r: any) => !r.isWaitingList).length;
        const waitCount = updated.registrations.filter((r: any) => r.isWaitingList).length;
        const maxSpots = updated.maxMainSpots;

        let counts = `📊 *${mainCount}/${maxSpots}* cupos ocupados`;
        if (mainCount >= maxSpots) {
          counts = `📊 Lista principal *llena* (${mainCount}/${maxSpots})`;
          if (waitCount > 0) counts += ` · ${waitCount} en espera`;
        } else {
          counts += ` (${maxSpots - mainCount} disponibles)`;
        }

        await this.wp.sendToGroup(`👋 *${user.name}* salió de la lista.\n${counts}`);
      } catch (e: any) {
        if (e.message?.includes('No estás anotado') || e.message?.includes('not found')) {
          await this.wp.sendToGroup(`ℹ️ ${user.name}, no estás anotado en esta lista.`);
        } else {
          this.logger.error('Error al salir:', e);
          await this.wp.sendToGroup(`❌ Error al salirte: ${e.message}`);
        }
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
        const reg = await this.games.register(activeGame.id, user.id, user.id, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const mainCount = updated.registrations.filter((r: any) => !r.isWaitingList).length;
        const waitCount = updated.registrations.filter((r: any) => r.isWaitingList).length;
        const maxSpots = updated.maxMainSpots;

        const spot = reg.isWaitingList
          ? `en la *lista de espera* en el puesto ${reg.position}`
          : `en la *lista principal* en el puesto ${reg.position}`;

        let counts = `📊 *${mainCount}/${maxSpots}* cupos ocupados`;
        if (mainCount >= maxSpots) {
          counts = `📊 Lista principal *llena* (${mainCount}/${maxSpots})`;
          if (waitCount > 0) counts += ` · ${waitCount} en espera`;
        } else {
          counts += ` (${maxSpots - mainCount} disponibles)`;
        }

        await this.wp.sendToGroup(`✅ *${user.name}* se anotó ${spot}! 🏐\n${counts}`);
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
