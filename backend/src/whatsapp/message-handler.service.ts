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
const CMD_PROMOTE = /^@z\s+(promover|subir|jalar|meter)\b/i;

const MSG_NO_ACTIVE_GAME = 'No hay ninguna lista abierta en el momento 🤷';
const MSG_USER_NOT_FOUND = '❌ No encontré tu número registrado en el sistema. Pídele a un administrador que te cree una cuenta primero.';

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
    const isPromoteCmd = CMD_PROMOTE.test(normalized);

    if (!isRegisterCmd && !isUnregisterCmd && !isListCmd && !isFinishCmd && !isPromoteCmd) return;

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
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
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

    if (isPromoteCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }

      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      if (user.role !== Role.admin) {
        const isInGame = activeGame.registrations.some(
          (r) => r.user.id === user.id && !r.isWaitingList,
        );
        if (!isInGame) {
          await this.wp.sendToGroup(`⛔ ${user.name}, solo los jugadores en la lista principal pueden usar este comando.`);
          return;
        }
      }

      try {
        const { updated, promotedName } = await this.games.promoteNext(activeGame.id, user.id);
        const counts = this.games.buildCounts(updated);
        await this.wp.sendToGroup(`⬆️ *${promotedName}* fue promovido a la *lista principal* 🏐\n${counts}`);
      } catch (e: any) {
        if (e.message?.includes('lista principal ya está llena')) {
          await this.wp.sendToGroup('⚠️ La lista principal ya está llena, no se puede promover a nadie.');
        } else if (e.message?.includes('No hay nadie en la lista de espera')) {
          await this.wp.sendToGroup('ℹ️ No hay nadie en la lista de espera para promover.');
        } else {
          this.logger.error('Error al promover:', e);
          await this.wp.sendToGroup(`❌ Error al promover: ${e.message}`);
        }
      }
      return;
    }

    if (isUnregisterCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }

      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      try {
        await this.games.removeRegistration(activeGame.id, user.id, user.id, user.role, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const counts = this.games.buildCounts(updated);
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
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }

      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      if (user.status !== 'active') {
        await this.wp.sendToGroup(`❌ Tu cuenta está ${user.status}. Contacta a un administrador.`);
        return;
      }

      try {
        const reg = await this.games.register(activeGame.id, user.id, user.id, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const counts = this.games.buildCounts(updated);
        const spot = reg.isWaitingList
          ? `en la *lista de espera* en el puesto ${reg.position}`
          : `en la *lista principal* en el puesto ${reg.position}`;
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
