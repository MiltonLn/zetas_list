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
  ProxyLimitExceededException,
  InactiveUserException,
  MustBeRegisteredFirstException,
} from '../games/exceptions';
import { extractPhoneFromJid } from './utils/jid-utils';
import { isExpectedBusinessError } from '../common/errors/is-expected-error';
import {
  runWithLogContext,
  setLogContext,
  newReqId,
} from '../common/logging/log-context';

const BOT_MENTION = '@Z';

/** Strip diacritics so all commands match with or without accents. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extracts inline guest names from a combined register+invite command.
 * Supports: "@Z anotame + Carlos, María" and "@Z anotame invitar Carlos, María".
 * Returns an empty array if no inline guests are detected.
 */
function extractInlineGuests(text: string): string[] {
  const afterKeyword = text.match(/^@z\s+\S+\s+(.*)/i)?.[1]?.trim() ?? '';
  const guestPart = afterKeyword.match(/^(?:\+|invitar?|traer?)\s+(.+)/i)?.[1];
  if (!guestPart) return [];
  return guestPart.split(',').map((n) => n.trim()).filter(Boolean);
}

// All regexes use plain ASCII — input is pre-normalized in dispatch().
const CMD_REGISTER = /^@z\s+(anotame|anotarme|meteme|meterme|meto|apuntame|apuntarme|inscribeme|inscribirme|juego|voy|entro|anotar|anota|apuntar|apunta)\b/i;
const CMD_UNREGISTER = /^@z\s+(salirme|sacame|sacarme|quitame|quitarme|borrame|borrarme|retirame|retirarme|safo|no\s+voy|no\s+juego|no\s+puedo|salgo|salir)\b/i;
const CMD_LIST = /^@z\s+(lista|cupos|quienes?\s+van|cuantos|como\s+vamos)\b/i;
const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;
const CMD_PROMOTE = /^@z\s+(promover|subir|jalar|meter)\b/i;
const CMD_REMOVE_OTHER = /^@z\s+(sacar|quitar|remover|eliminar)\b/i;
const CMD_INVITE = /^@z\s+(?:invitar?|traer?)\s+(.+)/i;
const CMD_CONFIRM = /^@z\s+(confirmar|confirmo|confirma|listo|acepto)\b/i;
const CMD_HELP = /^@z\s+(ayuda|help|comandos|info)\b/i;
const CMD_RULES = /^@z\s+(reglas|reglamento|normas)\b/i;
const CMD_FINANCES = /^@z\s+(finanzas|presupuesto|plata|dinero|caja|lucas|fondos)\b/i;
const CMD_FINED = /^@z\s+(multados|deudores|morosos|multas|deudas)\b/i;
const CMD_ALIASES = /^@z\s+(alias|variantes|sinonimos|alternativas)\b/i;
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
      { regex: CMD_LIST,    requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: (ctx) => this.handleList(ctx) },
      { regex: CMD_HELP,    requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleHelp() },
      { regex: CMD_ALIASES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleAliases() },
      { regex: CMD_RULES,   requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleRules() },
      { regex: CMD_FINANCES,requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleFinances() },
      { regex: CMD_FINED,   requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.handleFined() },
      { regex: CMD_FINISH,  requiresGame: true,  requiresUser: true,  requiresActiveAccount: true,  handler: (ctx) => this.handleFinish(ctx) },
      { regex: CMD_REMOVE_OTHER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleRemoveOther(ctx) },
      { regex: CMD_CONFIRM, requiresGame: true,  requiresUser: true,  requiresActiveAccount: true,  handler: (ctx) => this.handleConfirm(ctx) },
      { regex: CMD_PROMOTE, requiresGame: true,  requiresUser: true,  requiresActiveAccount: true,  handler: (ctx) => this.handlePromote(ctx) },
      { regex: CMD_INVITE,  requiresGame: true,  requiresUser: true,  requiresActiveAccount: true,  handler: (ctx, m) => this.handleInvite(ctx, m) },
      { regex: CMD_UNREGISTER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.handleUnregister(ctx) },
      { regex: CMD_REGISTER,requiresGame: true,  requiresUser: true,  requiresActiveAccount: true,  handler: (ctx) => this.handleRegister(ctx) },
    ];
  }

  async handleMessage(phone: string, text: string, groupId: string, mentionedJids?: string[]): Promise<void> {
    const normalized = text.trim();
    if (!CMD_IS_BOT_MENTION.test(normalized)) return;
    // Bind a correlation context so every log emitted while handling this
    // command (here + GamesService + scheduler triggers) shares the same reqId.
    return runWithLogContext({ reqId: newReqId(), source: 'wa', phone }, () =>
      this.dispatch(phone, normalized, mentionedJids),
    );
  }

  /**
   * Logs a caught error, classifying expected business rejections (4xx) as
   * debug so they don't pollute error dashboards, while keeping unexpected
   * failures at error level with the full object.
   */
  private logError(context: string, e: unknown): void {
    if (isExpectedBusinessError(e)) {
      this.logger.debug(`${context}: ${(e as Error).message}`);
    } else {
      this.logger.error(`${context}:`, e as Error);
    }
  }

  private async dispatch(phone: string, normalized: string, mentionedJids?: string[]): Promise<void> {
    // Normalize accents so commands match regardless of whether the user typed tildes.
    const forMatching = stripAccents(normalized).toLowerCase();
    const matchedCommand = this.commands.find((cmd) => cmd.regex.test(forMatching));

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

    if (activeGame) setLogContext({ gameId: activeGame.id });
    this.logger.log(`[CMD] ${matchedCommand.regex.source.slice(0, 30)} | phone=${phone}`);

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
      text: normalized,        // original text (accents preserved for display/names)
      mentionedJids: mentionedJids || [],
      user,
      activeGame,
    };

    const match = forMatching.match(matchedCommand.regex);
    try {
      await matchedCommand.handler(ctx, match);
    } catch (e: unknown) {
      this.logError(`Error no manejado en comando ${matchedCommand.regex.source}`, e);
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
      `• *${BOT_MENTION} anótame + Nombre, Nombre2* — Anotarte y traer invitados externos\n` +
      `• *${BOT_MENTION} sácame* — Salir de la lista\n` +
      `• *${BOT_MENTION} invitar Nombre, Nombre2* — Anotar uno o varios invitados externos\n\n` +
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
      `💡 _Todos los comandos funcionan con o sin tildes._\n` +
      `📖 _Escribe *${BOT_MENTION} alias* para ver todos los alias disponibles._`,
    );
  }

  private async handleAliases(): Promise<void> {
    await this.wp.sendToGroup(
      `📖 *Alias del Bot Zetas*\n` +
      `_Todos funcionan con o sin tildes._\n\n` +
      `📝 *Anotarse:*\n` +
      `anótame · anotarme · méteme · meterme · meto · apúntame · apuntarme · inscríbeme · inscribirme · voy · juego · entro · anotar · anota · apuntar · apunta\n\n` +
      `🚪 *Salirse:*\n` +
      `salirme · sácame · sacarme · quítame · quitarme · bórrame · borrarme · retírame · retirarme · safo · no voy · no juego · no puedo · salgo · salir\n\n` +
      `✅ *Confirmar:*\n` +
      `confirmar · confirmo · confirma · listo · acepto\n\n` +
      `📋 *Ver lista:*\n` +
      `lista · cupos · quiénes van · cuántos · cómo vamos\n\n` +
      `⬆️ *Promover de espera:*\n` +
      `promover · subir · jalar · meter\n\n` +
      `🎟️ *Invitar externos (uno o varios, separados por coma):*\n` +
      `invitar · invita · traer · trae\n` +
      `_Ejemplo: *${BOT_MENTION} invitar Carlos, María*_\n` +
      `_O al anotarse: *${BOT_MENTION} anotame + Carlos, María*_\n\n` +
      `💰 *Finanzas:*\n` +
      `finanzas · presupuesto · plata · dinero · caja · lucas · fondos\n\n` +
      `🚫 *Multados/Deudas:*\n` +
      `multados · deudores · morosos · multas · deudas\n\n` +
      `📜 *Reglas:* reglas · reglamento · normas\n` +
      `❓ *Ayuda:* ayuda · help · comandos · info\n` +
      `📖 *Alias:* alias · variantes · sinónimos · alternativas`,
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
      this.logError('Error al consultar multados', e);
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
      this.logError('Error al terminar partido', e);
      await this.wp.sendToGroup(`❌ No se pudo terminar el partido. Intenta de nuevo.`);
    }
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
      // removeRegistration sends the "fue sacado" message itself (and the
      // guest-removal note), awaiting it before any auto-promotion so the chat
      // stays in order. We must NOT send a duplicate here.
      await this.games.removeRegistration(ctx.activeGame.id, targetUser.id, ctx.user!.id, ctx.user!.role);
    } catch (e: unknown) {
      if (e instanceof NotRegisteredException) {
        await this.wp.sendToGroup(`ℹ️ ${targetUser.name} no está anotado en esta lista.`);
      } else {
        this.logError('Error al sacar jugador', e);
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
            this.logError('Error al confirmar por otro', e);
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
        this.logError('Error al confirmar', e);
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
        this.logError('Error al promover', e);
        await this.wp.sendToGroup(`❌ No se pudo promover. Intenta de nuevo.`);
      }
    }
  }

  private async handleInvite(ctx: CommandContext, _match: RegExpMatchArray | null): Promise<void> {
    const isRegistered = ctx.activeGame.registrations.some((r: any) => r.user?.id === ctx.user!.id);
    if (!isRegistered) {
      await this.wp.sendToGroup(`⚠️ ${ctx.user!.name}, debes estar anotado en la lista antes de invitar a alguien.`);
      return;
    }

    // Extract from the original text so guest names keep their accents.
    const rawNames = ctx.text.match(/^@z\s+\S+\s+(.+)/i)?.[1]?.trim();
    if (!rawNames && ctx.mentionedJids.length === 0) {
      await this.wp.sendToGroup(`ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez, Ana López*`);
      return;
    }

    const msgs: string[] = [];

    // ── WhatsApp @mentions: register members by proxy, flag unknown phones ──
    const nonSelfJids = ctx.mentionedJids.filter(
      (jid) => extractPhoneFromJid(jid) !== ctx.phone,
    );

    for (const jid of nonSelfJids) {
      const phone = extractPhoneFromJid(jid);
      const targetUser = await this.users.findByPhone(phone);

      if (!targetUser) {
        msgs.push(`❌ El usuario @${phone} no está registrado en el sistema. Usa su nombre para anotarlo como invitado.`);
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
        } else {
          this.logError(`Error al anotar al miembro ${targetUser.name} via invitar`, e);
          msgs.push(`❌ No se pudo anotar a *${targetUser.name}*. Intenta de nuevo.`);
        }
      }
    }

    // ── Plain-text names: skip @-prefixed tokens (those were JID mentions) ──
    const textNames = (rawNames ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith('@'));

    for (const guestName of textNames) {
      try {
        const reg = await this.games.registerGuest(ctx.activeGame.id, guestName, ctx.user!.id, { silent: true });
        const spot = reg.isWaitingList
          ? `en la *lista de espera* (puesto ${reg.position})`
          : `en la *lista principal*`;
        msgs.push(`✅ Invitado *${guestName}* fue anotado ${spot} por *${ctx.user!.name}* 🏐`);
      } catch (e: unknown) {
        this.logError(`Error al invitar a ${guestName}`, e);
        msgs.push(`❌ No se pudo anotar a *${guestName}*. Intenta de nuevo.`);
      }
    }

    if (msgs.length === 0) {
      await this.wp.sendToGroup(`ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez, Ana López*`);
      return;
    }

    const updated = await this.games.findOne(ctx.activeGame.id);
    const counts = this.games.buildCounts(updated);
    msgs.push(counts + this.games.buildGameLink(ctx.activeGame.id));
    await this.wp.sendToGroup(msgs.join('\n'));
  }

  private async handleUnregister(ctx: CommandContext): Promise<void> {
    try {
      // removeRegistration sends the "salió" message itself (and the
      // guest-removal note), awaited before any auto-promotion so the chat
      // stays in order. We must NOT send a duplicate here.
      await this.games.removeRegistration(ctx.activeGame.id, ctx.user!.id, ctx.user!.id, ctx.user!.role);
    } catch (e: unknown) {
      if (e instanceof NotRegisteredException) {
        await this.wp.sendToGroup(`ℹ️ ${ctx.user!.name}, no estás anotado en esta lista.`);
      } else {
        this.logError('Error al salir', e);
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
    const inlineGuests = extractInlineGuests(ctx.text);
    const hasInlineGuests = inlineGuests.length > 0;

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
          if (!retry.promoted && !hasTargetMention && !hasInlineGuests) {
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
          this.logError('Error al anotar al remitente', e);
          await this.wp.sendToGroup(`❌ No se pudo anotarte. Intenta de nuevo.`);
          return;
        }
      }
    }

    // Solo el emisor, sin invitados → mensaje simple y salir.
    if (!hasTargetMention && !hasInlineGuests) {
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

    // Hay menciones de miembros o invitados externos → acumular mensajes.
    const msgs: string[] = [];
    if (senderRegistered) msgs.push(`✅ *${ctx.user!.name}* se anotó en la lista.`);

    // ── Miembros mencionados con @mention ────────────────────────────────────
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
        } else if (e instanceof ProxyLimitExceededException) {
          msgs.push(`🚫 No pudimos anotar a ${targetUser.name}: ya alcanzaste el máximo de personas que puedes anotar en este partido.`);
        } else if (e instanceof MustBeRegisteredFirstException) {
          msgs.push(`🚫 No pudimos anotar a ${targetUser.name}: primero debes anotarte tú para poder anotar a alguien más.`);
        } else if (e instanceof InactiveUserException) {
          msgs.push(`🚫 No pudimos anotar a ${targetUser.name}: su cuenta no está activa. Contacta a un admin.`);
        } else {
          this.logError(`Error al anotar a ${targetUser.name}`, e);
          msgs.push(`❌ No se pudo anotar a ${targetUser.name}. Intenta de nuevo.`);
        }
      }
    }

    if (rejectedMentions.length > 0) {
      msgs.push(`⚠️ Solo puedes anotar a una persona adicional. ${rejectedMentions.length === 1 ? 'Una mención fue ignorada' : `${rejectedMentions.length} menciones fueron ignoradas`}.`);
    }

    // ── Invitados externos en línea ("+ Nombre" / "invitar Nombre") ──────────
    if (hasInlineGuests) {
      const canInvite = senderRegistered || senderAlreadyRegistered;
      if (!canInvite) {
        msgs.push(`⚠️ ${ctx.user!.name}, debes estar anotado en la lista para poder traer invitados.`);
      } else {
        for (const guestName of inlineGuests) {
          try {
            const reg = await this.games.registerGuest(ctx.activeGame.id, guestName, ctx.user!.id, { silent: true });
            const spot = reg.isWaitingList
              ? `en la *lista de espera* (puesto ${reg.position})`
              : `en la *lista principal*`;
            msgs.push(`✅ Invitado *${guestName}* fue anotado ${spot} por *${ctx.user!.name}* 🏐`);
          } catch (e: unknown) {
            this.logError(`Error al invitar inline a ${guestName}`, e);
            msgs.push(`❌ No se pudo anotar al invitado *${guestName}*. Intenta de nuevo.`);
          }
        }
      }
    }

    const updated = await this.games.findOne(ctx.activeGame.id);
    const counts = this.games.buildCounts(updated);
    msgs.push(counts + this.games.buildGameLink(ctx.activeGame.id));
    await this.wp.sendToGroup(msgs.join('\n'));
  }
}
