import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const BOT_MENTION = '@Z';
const CMD_REGISTER = /^@z\s+(an[oó]tame|m[eé]teme|ap[uú]ntame|juego|voy|entro)\b/i;
const CMD_UNREGISTER = /^@z\s+(salirme|s[aá]came|qu[ií]tame|no\s+voy|no\s+juego|salgo)\b/i;
const CMD_LIST = /^@z\s+(lista|cupos|qui[eé]nes?\s+van|cu[aá]ntos)\b/i;
const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;
const CMD_PROMOTE = /^@z\s+(promover|subir|jalar|meter)\b/i;
const CMD_REGISTER_OTHER = /^@z\s+(anotar|an[oó]ta|apuntar|ap[uú]nta)\b/i;
const CMD_INVITE = /^@z\s+invitar\s+(.+)/i;
const CMD_CONFIRM = /^@z\s+(confirmar|confirmo|listo|lista)\b/i;
const CMD_HELP = /^@z\s+(ayuda|help|comandos|info)\b/i;
const CMD_IS_BOT_MENTION = /^@z\b/i;

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

  async handleMessage(phone: string, text: string, _groupId: string, mentionedJids?: string[]): Promise<void> {
    const normalized = text.trim();

    if (!CMD_IS_BOT_MENTION.test(normalized)) return;

    const isRegisterCmd = CMD_REGISTER.test(normalized);
    const isUnregisterCmd = CMD_UNREGISTER.test(normalized);
    const isListCmd = CMD_LIST.test(normalized);
    const isFinishCmd = CMD_FINISH.test(normalized);
    const isPromoteCmd = CMD_PROMOTE.test(normalized);
    const isRegisterOtherCmd = CMD_REGISTER_OTHER.test(normalized);
    const inviteMatch = normalized.match(CMD_INVITE);
    const isInviteCmd = !!inviteMatch;
    const isConfirmCmd = CMD_CONFIRM.test(normalized);
    const isHelpCmd = CMD_HELP.test(normalized);

    const isKnownCommand = isRegisterCmd || isUnregisterCmd || isListCmd || isFinishCmd ||
        isPromoteCmd || isRegisterOtherCmd || isInviteCmd || isConfirmCmd || isHelpCmd;

    if (!isKnownCommand) {
      await this.wp.sendToGroup(
        `❓ Comando no reconocido. Escribe *${BOT_MENTION} ayuda* para ver los comandos disponibles.`,
      );
      return;
    }

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

    if (isHelpCmd) {
      await this.wp.sendToGroup(
        `🤖 *Comandos del Bot Zetas*\n\n` +
        `_Menciónalo al inicio de cada comando._\n\n` +
        `📝 *Registro:*\n` +
        `• *${BOT_MENTION} anótame* — Anotarte en la lista\n` +
        `• *${BOT_MENTION} sácame* — Salir de la lista\n` +
        `• *${BOT_MENTION} anotar @persona* — Anotarte y anotar a otro miembro\n` +
        `• *${BOT_MENTION} invitar NombreInvitado* — Anotar un invitado externo\n\n` +
        `📋 *Consulta:*\n` +
        `• *${BOT_MENTION} lista* — Ver la lista actual y cupos\n\n` +
        `✅ *Confirmación:*\n` +
        `• *${BOT_MENTION} confirmar* — Confirmar asistencia cuando te promueven\n\n` +
        `⬆️ *Gestión de espera:*\n` +
        `• *${BOT_MENTION} promover* — Subir al primero de la lista de espera\n\n` +
        `🔒 *Solo admin:*\n` +
        `• *${BOT_MENTION} terminar* — Cerrar el partido y generar reporte\n\n` +
        `💡 _Sinónimos: anótame/méteme/voy/juego/entro, sácame/no voy/salgo, etc._`,
      );
      return;
    }

    const user = await this.users.findByPhone(phone);

    const needsActiveAccount = isRegisterCmd || isUnregisterCmd || isRegisterOtherCmd ||
      isInviteCmd || isConfirmCmd || isPromoteCmd || isFinishCmd;

    if (needsActiveAccount && user && user.status !== 'active') {
      const statusLabels: Record<string, string> = {
        inactive: 'inactiva',
        banned: 'suspendida',
        suspended: 'suspendida',
      };
      const label = statusLabels[user.status] || user.status;
      await this.wp.sendToGroup(`❌ Tu cuenta está ${label}. Contacta a un administrador.`);
      return;
    }

    if (isFinishCmd) {
      if (!user || user.role !== Role.admin) {
        await this.wp.sendToGroup(`⛔ Solo los administradores pueden usar este comando.`);
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

    if (isConfirmCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }
      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      try {
        await this.games.confirmRegistration(activeGame.id, user.id);
        await this.wp.sendToGroup(`✅ *${user.name}* confirmó su asistencia 🏐`);
      } catch (e: any) {
        if (e.message?.includes('confirmación pendiente')) {
          await this.wp.sendToGroup(`ℹ️ ${user.name}, no tienes ninguna confirmación pendiente.`);
        } else {
          this.logger.error('Error al confirmar:', e);
          await this.wp.sendToGroup(`❌ Error al confirmar: ${e.message}`);
        }
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
          (r) => r.user?.id === user.id && !r.isWaitingList,
        );
        if (!isInGame) {
          await this.wp.sendToGroup(`⛔ ${user.name}, solo los jugadores en la lista principal pueden usar este comando.`);
          return;
        }
      }

      try {
        const { updated, promotedName } = await this.games.promoteNext(activeGame.id, user.id);
        const counts = this.games.buildCounts(updated);
        await this.wp.sendToGroup(`⬆️ *${promotedName}* fue promovido a la *lista principal* 🏐\n${counts}${this.games.buildGameLink(activeGame.id)}`);
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

    if (isRegisterOtherCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }
      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      if (!mentionedJids || mentionedJids.length === 0) {
        await this.wp.sendToGroup(`ℹ️ ${user.name}, debes mencionar (@) a la persona que quieres anotar.\nEjemplo: *${BOT_MENTION} anotar @persona*`);
        return;
      }

      // Filter out the bot's own JID from mentions
      const otherMentions = mentionedJids.filter((jid) => {
        const jidNumber = jid.split(':')[0].split('@')[0];
        return jidNumber !== phone;
      });

      // Step 1: Register the sender first
      let senderRegistered = false;
      const existingSenderReg = activeGame.registrations.find((r) => r.user?.id === user.id);
      if (!existingSenderReg) {
        try {
          await this.games.register(activeGame.id, user.id, user.id, { silent: true });
          senderRegistered = true;
        } catch (e: any) {
          if (!e.message?.includes('Ya estás anotado') && !e.message?.includes('Ya está')) {
            this.logger.error('Error al anotar al remitente:', e);
            await this.wp.sendToGroup(`❌ Error al anotarte: ${e.message}`);
            return;
          }
        }
      }

      // Step 2: Register the mentioned person
      if (otherMentions.length === 0) {
        // No other person mentioned (only bot was tagged) — just confirm self-registration
        if (senderRegistered) {
          const updated = await this.games.findOne(activeGame.id);
          const counts = this.games.buildCounts(updated);
          await this.wp.sendToGroup(`✅ *${user.name}* se anotó en la lista 🏐\n${counts}${this.games.buildGameLink(activeGame.id)}`);
        } else {
          await this.wp.sendToGroup(`ℹ️ ${user.name}, ya estás anotado en esta lista.`);
        }
        return;
      }

      const mentionedPhone = otherMentions[0].split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      const targetUser = await this.users.findByPhone(mentionedPhone);

      if (!targetUser) {
        // Report sender registration and mention error together
        const msgs: string[] = [];
        if (senderRegistered) msgs.push(`✅ *${user.name}* se anotó en la lista.`);
        msgs.push(`❌ El usuario mencionado no está registrado en el sistema.`);
        await this.wp.sendToGroup(msgs.join('\n'));
        return;
      }

      try {
        const reg = await this.games.register(activeGame.id, targetUser.id, user.id, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const counts = this.games.buildCounts(updated);
        const spot = reg.isWaitingList
          ? `en la *lista de espera* (puesto ${reg.position})`
          : `en la *lista principal*`;
        const msgs: string[] = [];
        if (senderRegistered) msgs.push(`✅ *${user.name}* se anotó en la lista.`);
        msgs.push(`✅ *${targetUser.name}* fue anotado ${spot} por *${user.name}* 🏐`);
        if (reg.pendingConfirmation) {
          msgs.push(`⏳ *${targetUser.name}* debe confirmar con *${BOT_MENTION} confirmar* antes de la hora de corte.`);
        }
        msgs.push(counts + this.games.buildGameLink(activeGame.id));
        await this.wp.sendToGroup(msgs.join('\n'));
      } catch (e: any) {
        if (e.message?.includes('Ya estás anotado') || e.message?.includes('Ya está')) {
          const msgs: string[] = [];
          if (senderRegistered) msgs.push(`✅ *${user.name}* se anotó en la lista.`);
          msgs.push(`ℹ️ ${targetUser.name} ya está anotado en esta lista.`);
          await this.wp.sendToGroup(msgs.join('\n'));
        } else if (e.message?.includes('máximo')) {
          await this.wp.sendToGroup(`⚠️ ${user.name}, ${e.message}`);
        } else {
          this.logger.error('Error al anotar a otro:', e);
          await this.wp.sendToGroup(`❌ Error al anotar: ${e.message}`);
        }
      }
      return;
    }

    if (isInviteCmd) {
      if (!activeGame) {
        await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
        return;
      }
      if (!user) {
        await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
        return;
      }

      const isRegistered = activeGame.registrations.some((r) => r.user?.id === user.id);
      if (!isRegistered) {
        await this.wp.sendToGroup(`⚠️ ${user.name}, debes estar anotado en la lista antes de invitar a alguien.`);
        return;
      }

      const guestName = inviteMatch![1].trim();
      if (!guestName) {
        await this.wp.sendToGroup(`ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez*`);
        return;
      }

      try {
        const reg = await this.games.registerGuest(activeGame.id, guestName, user.id, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const counts = this.games.buildCounts(updated);
        const spot = reg.isWaitingList
          ? `en la *lista de espera* (puesto ${reg.position})`
          : `en la *lista principal*`;
        await this.wp.sendToGroup(`✅ Invitado *${guestName}* fue anotado ${spot} por *${user.name}* 🏐\n${counts}${this.games.buildGameLink(activeGame.id)}`);
      } catch (e: any) {
        this.logger.error('Error al invitar:', e);
        await this.wp.sendToGroup(`❌ Error al invitar: ${e.message}`);
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
        await this.wp.sendToGroup(`👋 *${user.name}* salió de la lista.\n${counts}${this.games.buildGameLink(activeGame.id)}`);
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

      try {
        const retry = await this.games.retryFromWaitingList(activeGame.id, user.id);
        if (retry.game) {
          const counts = this.games.buildCounts(retry.game);
          if (retry.promoted) {
            await this.wp.sendToGroup(`✅ *${user.name}* volvió a la *lista principal*! 🏐\n${counts}${this.games.buildGameLink(activeGame.id)}`);
          } else {
            await this.wp.sendToGroup(`⚠️ *${user.name}*, no hay cupos disponibles en este momento. Si se libera un cupo serás promovido automáticamente.\n${counts}${this.games.buildGameLink(activeGame.id)}`);
          }
          return;
        }

        const reg = await this.games.register(activeGame.id, user.id, user.id, { silent: true });
        const updated = await this.games.findOne(activeGame.id);
        const counts = this.games.buildCounts(updated);
        const spot = reg.isWaitingList
          ? `en la *lista de espera* en el puesto ${reg.position}`
          : `en la *lista principal*`;
        await this.wp.sendToGroup(`✅ *${user.name}* se anotó ${spot}! 🏐\n${counts}${this.games.buildGameLink(activeGame.id)}`);
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
