import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { Role } from '@prisma/client';
import {
  AlreadyRegisteredException,
  GameFullException,
  NoPendingConfirmationException,
  NotRegisteredException,
  NoOneInWaitListException,
  UserHasUnpaidFinesException,
} from '../games/exceptions';
import { extractPhoneFromJid } from './utils/jid-utils';

const BOT_MENTION = '@Z';
const CMD_REGISTER = /^@z\s+(an[oó]tame|m[eé]teme|ap[uú]ntame|juego|voy|entro|anotar|an[oó]ta|apuntar|ap[uú]nta)\b/i;
const CMD_UNREGISTER = /^@z\s+(salirme|s[aá]came|qu[ií]tame|no\s+voy|no\s+juego|salgo|salir)\b/i;
const CMD_LIST = /^@z\s+(lista|cupos|qui[eé]nes?\s+van|cu[aá]ntos)\b/i;
const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;
const CMD_PROMOTE = /^@z\s+(promover|subir|jalar|meter)\b/i;
const CMD_REMOVE_OTHER = /^@z\s+(sacar|quitar|remover|eliminar)\b/i;
const CMD_INVITE = /^@z\s+invitar\s+(.+)/i;
const CMD_CONFIRM = /^@z\s+(confirmar|confirmo|listo|lista)\b/i;
const CMD_HELP = /^@z\s+(ayuda|help|comandos|info)\b/i;
const CMD_RULES = /^@z\s+(reglas|reglamento|normas)\b/i;
const CMD_FINANCES = /^@z\s+(finanzas|presupuesto|plata|dinero)\b/i;
const CMD_FINED = /^@z\s+(multados|deudores|morosos)\b/i;
const CMD_IS_BOT_MENTION = /^@z\b/i;

const MSG_NO_ACTIVE_GAME = 'No hay ninguna lista abierta en el momento 🤷';
const MSG_USER_NOT_FOUND = '❌ No encontré tu número registrado en el sistema. Pídele a un administrador que te cree una cuenta primero.';

interface CommandContext {
  phone: string;
  text: string;
  mentionedJids: string[];
  user: { id: string; name: string; role: Role; status: string } | null;
  activeGame: any;
}

interface CommandDef {
  regex: RegExp;
  requiresGame: boolean;
  requiresUser: boolean;
  requiresActiveAccount: boolean;
  handler: (ctx: CommandContext, match: RegExpMatchArray | null) => Promise<void>;
}

@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);
  private readonly commands: CommandDef[];

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    @Inject(forwardRef(() => GamesService)) private games: GamesService,
    private users: UsersService,
    private prisma: PrismaService,
    private finances: FinancesService,
  ) {
    this.commands = [
      { regex: CMD_LIST, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: (ctx) => this.handleList(ctx) },
      { regex: CMD_HELP, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleHelp() },
      { regex: CMD_RULES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleRules() },
      { regex: CMD_FINANCES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleFinances() },
      { regex: CMD_FINED, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleFined() },
      { regex: CMD_FINISH, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleFinish(ctx) },
      { regex: CMD_REMOVE_OTHER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleRemoveOther(ctx) },
      { regex: CMD_CONFIRM, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleConfirm(ctx) },
      { regex: CMD_PROMOTE, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handlePromote(ctx) },
      { regex: CMD_INVITE, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx, m) => this.handleInvite(ctx, m) },
      { regex: CMD_UNREGISTER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleUnregister(ctx) },
      { regex: CMD_REGISTER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleRegister(ctx) },
    ];
  }

  async handleMessage(phone: string, text: string, _groupId: string, mentionedJids?: string[]): Promise<void> {
    const normalized = text.trim();
    if (!CMD_IS_BOT_MENTION.test(normalized)) return;

    const matchedCommand = this.commands.find((cmd) => cmd.regex.test(normalized));

    if (!matchedCommand) {
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

    if (matchedCommand.requiresGame && !activeGame) {
      await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
      return;
    }

    const user = matchedCommand.requiresUser
      ? await this.users.findByPhone(phone)
      : null;

    if (matchedCommand.requiresUser && !user) {
      await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
      return;
    }

    if (matchedCommand.requiresActiveAccount && user && user.status !== 'active') {
      const statusLabels: Record<string, string> = {
        inactive: 'inactiva',
        banned: 'suspendida',
        suspended: 'suspendida',
      };
      const label = statusLabels[user.status] || user.status;
      await this.wp.sendToGroup(`❌ Tu cuenta está ${label}. Contacta a un administrador.`);
      return;
    }

    const ctx: CommandContext = {
      phone,
      text: normalized,
      mentionedJids: mentionedJids || [],
      user,
      activeGame,
    };

    const match = normalized.match(matchedCommand.regex);
    try {
      await matchedCommand.handler(ctx, match);
    } catch (e: unknown) {
      this.logger.error(`Error no manejado en comando ${matchedCommand.regex.source}:`, e);
      await this.wp.sendToGroup('❌ Ocurrió un error inesperado procesando tu comando. Intenta de nuevo.').catch(() => {});
    }
  }

  // ─── Command Handlers ─────────────────────────────────────────────────────

  private async handleList(ctx: CommandContext): Promise<void> {
    if (!ctx.activeGame) {
      await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
      return;
    }
    const list = this.games.formatListForWhatsapp(ctx.activeGame);
    await this.wp.sendToGroup(list);
  }

  private async handleHelp(): Promise<void> {
    await this.wp.sendToGroup(
      `🤖 *Comandos del Bot Zetas*\n\n` +
      `_Menciónalo al inicio de cada comando._\n\n` +
      `📝 *Registro:*\n` +
      `• *${BOT_MENTION} anótame* — Anotarte en la lista\n` +
      `• *${BOT_MENTION} anótame @persona* — Anotarte y anotar a otro miembro\n` +
      `• *${BOT_MENTION} sácame* — Salir de la lista\n` +
      `• *${BOT_MENTION} invitar NombreInvitado* — Anotar un invitado externo\n\n` +
      `📋 *Consulta:*\n` +
      `• *${BOT_MENTION} lista* — Ver la lista actual y cupos\n` +
      `• *${BOT_MENTION} reglas* — Ver las reglas del grupo\n` +
      `• *${BOT_MENTION} finanzas* — Ver el presupuesto del grupo\n` +
      `• *${BOT_MENTION} multados* — Ver personas con multas pendientes\n\n` +
      `✅ *Confirmación:*\n` +
      `• *${BOT_MENTION} confirmar* — Confirmar asistencia cuando te promueven\n\n` +
      `⬆️ *Gestión de espera:*\n` +
      `• *${BOT_MENTION} promover* — Subir al primero de la lista de espera\n\n` +
      `🔒 *Solo admin:*\n` +
      `• *${BOT_MENTION} sacar @persona* — Sacar a alguien de la lista\n` +
      `• *${BOT_MENTION} confirmar @persona* — Confirmar por otro jugador\n` +
      `• *${BOT_MENTION} terminar* — Cerrar el partido y generar reporte\n\n` +
      `💡 _Sinónimos: anótame/méteme/voy/juego/entro/anotar, sácame/no voy/salgo, etc._`,
    );
  }

  private async handleRules(): Promise<void> {
    await this.wp.sendToGroup(
      `📜 *Reglas del Grupo Zetas 2026*\n\n` +
      `Consulta el reglamento completo aquí:\n` +
      `🔗 https://zetas.club/reglas`,
    );
  }

  private async handleFinances(): Promise<void> {
    await this.wp.sendToGroup(
      `💰 *Finanzas del Grupo Zetas*\n\n` +
      `Consulta el presupuesto, gastos, entradas y multas aquí:\n` +
      `🔗 https://zetas.club/finances`,
    );
  }

  private async handleFined(): Promise<void> {
    try {
      const pendingFines = await this.finances.getPendingFines();

      if (pendingFines.length === 0) {
        await this.wp.sendToGroup(`✅ No hay personas con multas o deudas pendientes. ¡Todos al día! 🎉`);
        return;
      }

      const lines: string[] = [`💰 *Multados / Deudores*\n`];
      let total = 0;

      for (const fine of pendingFines) {
        const dateStr = new Date(fine.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
        lines.push(`• ${fine.user?.name ?? fine.userName ?? 'Sin asignar'} - $${fine.amount.toLocaleString('es-CO')} (${fine.reason}) - ${dateStr}`);
        total += fine.amount;
      }

      lines.push(`\n*Total pendiente:* $${total.toLocaleString('es-CO')}`);
      lines.push(`\nPonte al día con un admin para poder jugar. 🏐`);

      await this.wp.sendToGroup(lines.join('\n'));
    } catch (e) {
      this.logger.error('Error al consultar multados:', e);
      await this.wp.sendToGroup(`❌ No se pudo consultar los multados. Intenta de nuevo.`);
    }
  }

  private async handleFinish(ctx: CommandContext): Promise<void> {
    if (ctx.user!.role !== Role.admin) {
      await this.wp.sendToGroup(`⛔ Solo los administradores pueden usar este comando.`);
      return;
    }

    try {
      const result = await this.games.complete(ctx.activeGame.id, ctx.user!.id, { silent: true });
      await this.wp.sendToGroup(result.report);
    } catch (e: unknown) {
      this.logger.error('Error al terminar partido:', e);
      await this.wp.sendToGroup(`❌ No se pudo terminar el partido. Intenta de nuevo.`);
    }
  }

  /**
   * Construye el sufijo que aclara que los invitados de un jugador también
   * fueron removidos al salir/sacarlo. Se calcula desde el snapshot del partido
   * (las inscripciones aún presentes antes de la baja).
   */
  private removedGuestsSuffix(ctx: CommandContext, ownerUserId: string): string {
    const guestNames = ctx.activeGame.registrations
      .filter((r: any) => r.isGuest && r.registeredById === ownerUserId)
      .map((r: any) => r.guestName || 'Invitado');
    if (guestNames.length === 0) return '';
    const label = guestNames.length === 1
      ? 'Su invitado también fue removido'
      : 'Sus invitados también fueron removidos';
    return `\n🚫 ${label}: ${guestNames.join(', ')}`;
  }

  private async handleRemoveOther(ctx: CommandContext): Promise<void> {
    if (ctx.user!.role !== Role.admin) {
      await this.wp.sendToGroup(`⛔ Solo los administradores pueden sacar a otros de la lista.`);
      return;
    }

    const otherMentions = ctx.mentionedJids.filter((jid) => {
      const jidNumber = extractPhoneFromJid(jid);
      return jidNumber !== ctx.phone;
    });

    if (otherMentions.length === 0) {
      await this.wp.sendToGroup(`ℹ️ Debes mencionar a la persona que quieres sacar.\nEjemplo: *${BOT_MENTION} sacar @persona*`);
      return;
    }

    const mentionedPhone = extractPhoneFromJid(otherMentions[0]);
    const targetUser = await this.users.findByPhone(mentionedPhone);

    if (!targetUser) {
      await this.wp.sendToGroup(`❌ El usuario mencionado no está registrado en el sistema.`);
      return;
    }

    try {
      const guestsSuffix = this.removedGuestsSuffix(ctx, targetUser.id);
      await this.games.removeRegistration(ctx.activeGame.id, targetUser.id, ctx.user!.id, ctx.user!.role, { silent: true });
      const updated = await this.games.findOne(ctx.activeGame.id);
      const counts = this.games.buildCounts(updated);
      await this.wp.sendToGroup(`🚫 *${targetUser.name}* fue sacado de la lista por un admin.${guestsSuffix}\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
    } catch (e: unknown) {
      if (e instanceof NotRegisteredException) {
        await this.wp.sendToGroup(`ℹ️ ${targetUser.name} no está anotado en esta lista.`);
      } else {
        this.logger.error('Error al sacar jugador:', e);
        await this.wp.sendToGroup(`❌ No se pudo sacar a ${targetUser.name}. Intenta de nuevo.`);
      }
    }
  }

  private async handleConfirm(ctx: CommandContext): Promise<void> {
    const otherMentions = ctx.mentionedJids.filter((jid) => {
      const jidNumber = extractPhoneFromJid(jid);
      return jidNumber !== ctx.phone;
    });

    // Admin confirma por otros mencionándolos: "@Z confirmar @persona".
    if (otherMentions.length > 0) {
      if (ctx.user!.role !== Role.admin) {
        await this.wp.sendToGroup(`⛔ Solo los administradores pueden confirmar por otros.`);
        return;
      }

      const confirmedNames: string[] = [];
      for (const jid of otherMentions) {
        const mPhone = extractPhoneFromJid(jid);
        const targetUser = await this.users.findByPhone(mPhone);
        if (!targetUser) {
          await this.wp.sendToGroup(`❌ Un usuario mencionado no está registrado en el sistema.`);
          continue;
        }
        try {
          await this.games.confirmRegistration(ctx.activeGame.id, targetUser.id, ctx.user!.id);
          confirmedNames.push(targetUser.name);
        } catch (e: unknown) {
          if (e instanceof NoPendingConfirmationException) {
            await this.wp.sendToGroup(`ℹ️ ${targetUser.name} no tiene ninguna confirmación pendiente.`);
          } else {
            this.logger.error('Error al confirmar por otro:', e);
            await this.wp.sendToGroup(`❌ No se pudo confirmar a ${targetUser.name}. Intenta de nuevo.`);
          }
        }
      }

      if (confirmedNames.length > 0) {
        await this.wp.sendToGroup(`✅ *${ctx.user!.name}* confirmó la asistencia de ${confirmedNames.join(', ')} 🏐`);
      }
      return;
    }

    try {
      const result = await this.games.confirmRegistration(ctx.activeGame.id, ctx.user!.id);
      const parts: string[] = [];
      if (result.confirmedOwn) parts.push('su asistencia');
      if (result.confirmedGuests.length > 0) {
        const guestNames = result.confirmedGuests.join(', ');
        parts.push(result.confirmedOwn ? `la de ${guestNames}` : `asistencia de ${guestNames}`);
      }
      await this.wp.sendToGroup(`✅ *${ctx.user!.name}* confirmó ${parts.join(' y ')} 🏐`);
    } catch (e: unknown) {
      if (e instanceof NoPendingConfirmationException) {
        await this.wp.sendToGroup(`ℹ️ ${ctx.user!.name}, no tienes ninguna confirmación pendiente.`);
      } else {
        this.logger.error('Error al confirmar:', e);
        await this.wp.sendToGroup(`❌ No se pudo confirmar tu asistencia. Intenta de nuevo.`);
      }
    }
  }

  private async handlePromote(ctx: CommandContext): Promise<void> {
    if (ctx.user!.role !== Role.admin) {
      const isInGame = ctx.activeGame.registrations.some(
        (r: any) => r.user?.id === ctx.user!.id && !r.isWaitingList,
      );
      if (!isInGame) {
        await this.wp.sendToGroup(`⛔ ${ctx.user!.name}, solo los jugadores en la lista principal pueden usar este comando.`);
        return;
      }
    }

    try {
      const { updated, promotedName } = await this.games.promoteNext(ctx.activeGame.id, ctx.user!.id);
      const counts = this.games.buildCounts(updated);
      await this.wp.sendToGroup(`⬆️ *${promotedName}* fue promovido a la *lista principal* 🏐\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
    } catch (e: unknown) {
      if (e instanceof GameFullException) {
        await this.wp.sendToGroup('⚠️ La lista principal ya está llena, no se puede promover a nadie.');
      } else if (e instanceof NoOneInWaitListException) {
        await this.wp.sendToGroup('ℹ️ No hay nadie en la lista de espera para promover.');
      } else {
        this.logger.error('Error al promover:', e);
        await this.wp.sendToGroup(`❌ No se pudo promover. Intenta de nuevo.`);
      }
    }
  }

  private async handleInvite(ctx: CommandContext, match: RegExpMatchArray | null): Promise<void> {
    const isRegistered = ctx.activeGame.registrations.some((r: any) => r.user?.id === ctx.user!.id);
    if (!isRegistered) {
      await this.wp.sendToGroup(`⚠️ ${ctx.user!.name}, debes estar anotado en la lista antes de invitar a alguien.`);
      return;
    }

    const guestName = match?.[1]?.trim();
    if (!guestName) {
      await this.wp.sendToGroup(`ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez*`);
      return;
    }

    try {
      const reg = await this.games.registerGuest(ctx.activeGame.id, guestName, ctx.user!.id, { silent: true });
      const updated = await this.games.findOne(ctx.activeGame.id);
      const counts = this.games.buildCounts(updated);
      const spot = reg.isWaitingList
        ? `en la *lista de espera* (puesto ${reg.position})`
        : `en la *lista principal*`;
      await this.wp.sendToGroup(`✅ Invitado *${guestName}* fue anotado ${spot} por *${ctx.user!.name}* 🏐\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
    } catch (e: unknown) {
      this.logger.error('Error al invitar:', e);
      await this.wp.sendToGroup(`❌ No se pudo registrar al invitado. Intenta de nuevo.`);
    }
  }

  private async handleUnregister(ctx: CommandContext): Promise<void> {
    try {
      const guestsSuffix = this.removedGuestsSuffix(ctx, ctx.user!.id);
      await this.games.removeRegistration(ctx.activeGame.id, ctx.user!.id, ctx.user!.id, ctx.user!.role, { silent: true });
      const updated = await this.games.findOne(ctx.activeGame.id);
      const counts = this.games.buildCounts(updated);
      await this.wp.sendToGroup(`👋 *${ctx.user!.name}* salió de la lista.${guestsSuffix}\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
    } catch (e: unknown) {
      if (e instanceof NotRegisteredException) {
        await this.wp.sendToGroup(`ℹ️ ${ctx.user!.name}, no estás anotado en esta lista.`);
      } else {
        this.logger.error('Error al salir:', e);
        await this.wp.sendToGroup(`❌ No se pudo salir de la lista. Intenta de nuevo.`);
      }
    }
  }

  private async handleRegister(ctx: CommandContext): Promise<void> {
    const otherMentions = ctx.mentionedJids.filter((jid) => {
      const jidNumber = extractPhoneFromJid(jid);
      return jidNumber !== ctx.phone;
    });

    const allowedMentions = ctx.user!.role === Role.admin
      ? otherMentions
      : otherMentions.slice(0, 1);
    const rejectedMentions = ctx.user!.role === Role.admin
      ? []
      : otherMentions.slice(1);

    const hasTargetMention = allowedMentions.length > 0;

    let senderRegistered = false;
    let senderAlreadyRegistered = false;
    const existingSenderReg = ctx.activeGame.registrations.find((r: any) => r.user?.id === ctx.user!.id);
    // Un jugador que no confirmó a tiempo vuelve a la lista de espera marcado como
    // "declined". Si usa "anótame" de nuevo, debe reactivarse y —si hay cupo libre—
    // subir de inmediato a la principal, en vez de recibir "ya estás anotado".
    const isDeclinedWaiter = !!existingSenderReg?.isWaitingList && !!existingSenderReg?.confirmationDeclined;

    if (existingSenderReg && !isDeclinedWaiter) {
      senderAlreadyRegistered = true;
    } else {
      try {
        const retry = await this.games.retryFromWaitingList(ctx.activeGame.id, ctx.user!.id);
        if (retry.game) {
          senderRegistered = true;
          if (!retry.promoted && !hasTargetMention) {
            const counts = this.games.buildCounts(retry.game);
            await this.wp.sendToGroup(`⚠️ *${ctx.user!.name}*, no hay cupos disponibles en este momento. Si se libera un cupo serás promovido automáticamente.\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
            return;
          }
        } else {
          await this.games.register(ctx.activeGame.id, ctx.user!.id, ctx.user!.id, { silent: true });
          senderRegistered = true;
        }
      } catch (e: unknown) {
        if (e instanceof AlreadyRegisteredException) {
          senderAlreadyRegistered = true;
        } else if (e instanceof UserHasUnpaidFinesException) {
          await this.wp.sendToGroup(`🚫 *${ctx.user!.name}*, no puedes anotarte porque tienes multas/deudas pendientes. Contacta a un admin para ponerte al día.`);
          return;
        } else {
          this.logger.error('Error al anotar al remitente:', e);
          await this.wp.sendToGroup(`❌ No se pudo anotarte. Intenta de nuevo.`);
          return;
        }
      }
    }

    if (!hasTargetMention) {
      if (senderAlreadyRegistered) {
        await this.wp.sendToGroup(`ℹ️ ${ctx.user!.name}, ya estás anotado en esta lista.`);
      } else {
        const updated = await this.games.findOne(ctx.activeGame.id);
        const counts = this.games.buildCounts(updated);
        const senderReg = updated.registrations?.find((r: any) => r.user?.id === ctx.user!.id);
        const spot = senderReg?.isWaitingList
          ? `en la *lista de espera* en el puesto ${senderReg.position}`
          : `en la *lista principal*`;
        await this.wp.sendToGroup(`✅ *${ctx.user!.name}* se anotó ${spot}! 🏐\n${counts}${this.games.buildGameLink(ctx.activeGame.id)}`);
      }
      return;
    }

    const msgs: string[] = [];
    if (senderRegistered) msgs.push(`✅ *${ctx.user!.name}* se anotó en la lista.`);

    for (const mentionJid of allowedMentions) {
      const mPhone = extractPhoneFromJid(mentionJid);
      const targetUser = await this.users.findByPhone(mPhone);

      if (!targetUser) {
        msgs.push(`❌ Un usuario mencionado no está registrado en el sistema.`);
        continue;
      }

      try {
        const reg = await this.games.register(ctx.activeGame.id, targetUser.id, ctx.user!.id, { silent: true });
        const spot = reg.isWaitingList
          ? `en la *lista de espera* (puesto ${reg.position})`
          : `en la *lista principal*`;
        msgs.push(`✅ *${targetUser.name}* fue anotado ${spot} por *${ctx.user!.name}* 🏐`);
      } catch (e: unknown) {
        if (e instanceof AlreadyRegisteredException) {
          msgs.push(`ℹ️ ${targetUser.name} ya está anotado en esta lista.`);
        } else if (e instanceof UserHasUnpaidFinesException) {
          msgs.push(`🚫 ${targetUser.name} tiene multas/deudas pendientes y no puede anotarse.`);
        } else {
          this.logger.error(`Error al anotar a ${targetUser.name}:`, e);
          msgs.push(`❌ No se pudo anotar a ${targetUser.name}.`);
        }
      }
    }

    if (rejectedMentions.length > 0) {
      msgs.push(`⚠️ Solo puedes anotar a una persona adicional. ${rejectedMentions.length === 1 ? 'Una mención fue ignorada' : `${rejectedMentions.length} menciones fueron ignoradas`}.`);
    }

    const updated = await this.games.findOne(ctx.activeGame.id);
    const counts = this.games.buildCounts(updated);
    msgs.push(counts + this.games.buildGameLink(ctx.activeGame.id));
    await this.wp.sendToGroup(msgs.join('\n'));
  }
}
