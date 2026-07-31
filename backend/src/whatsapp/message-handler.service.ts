import { Inject, Injectable, Logger } from '@nestjs/common';
import { GAME_MANAGERS } from '../common/constants/roles';
import { reportCaughtError } from '../common/errors/report-caught-error';
import {
  newReqId,
  runWithLogContext,
  setLogContext,
} from '../common/logging/log-context';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { CommandContext } from './commands/command-context';
import { InfoCommandsService } from './commands/info-commands.service';
import {
  MSG_NO_ACTIVE_GAME,
  MSG_UNEXPECTED_ERROR,
  MSG_UNKNOWN_COMMAND,
  MSG_USER_NOT_FOUND,
  buildAccountNotActiveMessage,
} from './commands/messages';
import { MutatingCommandsService } from './commands/mutating-commands.service';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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
const CMD_PAYMENT = /^@z\s+(llave|pago|pagos|transferencia|nequi)\b/i;
const CMD_TOURNAMENTS = /^@z\s+(torneos?|competencias?)\b/i;
const CMD_ALIASES = /^@z\s+(alias|variantes|sinonimos|alternativas)\b/i;
const CMD_IS_BOT_MENTION = /^@z\b/i;

interface CommandDef {
  regex: RegExp;
  requiresGame: boolean;
  requiresUser: boolean;
  requiresActiveAccount: boolean;
  managerOnly?: string;
  handler: (
    ctx: CommandContext,
    match: RegExpMatchArray | null,
  ) => Promise<void>;
}

@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);
  private readonly commands: CommandDef[];

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    private games: GamesService,
    private users: UsersService,
    private info: InfoCommandsService,
    private mutating: MutatingCommandsService,
  ) {
    this.commands = [
      { regex: CMD_LIST, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: (ctx) => this.info.list(ctx.activeGame) },
      { regex: CMD_HELP, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.help() },
      { regex: CMD_ALIASES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.aliases() },
      { regex: CMD_RULES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.rules() },
      { regex: CMD_FINANCES, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.financesInfo() },
      { regex: CMD_FINED, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.fined() },
      { regex: CMD_PAYMENT, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.payment() },
      { regex: CMD_TOURNAMENTS, requiresGame: false, requiresUser: false, requiresActiveAccount: false, handler: () => this.info.tournamentsInfo() },
      { regex: CMD_FINISH, requiresGame: true, requiresUser: true, requiresActiveAccount: true, managerOnly: '⛔ Solo los administradores pueden usar este comando.', handler: (ctx) => this.mutating.handleFinish(ctx) },
      { regex: CMD_REMOVE_OTHER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, managerOnly: '⛔ Solo los administradores pueden sacar a otros de la lista.', handler: (ctx) => this.mutating.handleRemoveOther(ctx) },
      { regex: CMD_CONFIRM, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.mutating.handleConfirm(ctx) },
      { regex: CMD_PROMOTE, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.mutating.handlePromote(ctx) },
      { regex: CMD_INVITE, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.mutating.handleInvite(ctx) },
      { regex: CMD_UNREGISTER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.mutating.handleUnregister(ctx) },
      { regex: CMD_REGISTER, requiresGame: true, requiresUser: true, requiresActiveAccount: true, handler: (ctx) => this.mutating.handleRegister(ctx) },
    ];
  }

  async handleMessage(
    phone: string,
    text: string,
    _groupId: string,
    mentionedJids?: string[],
  ): Promise<void> {
    const normalized = text.trim();
    if (!CMD_IS_BOT_MENTION.test(normalized)) return;
    return runWithLogContext(
      { reqId: newReqId(), source: 'wa', phone },
      () => this.dispatch(phone, normalized, mentionedJids),
    );
  }

  private logError(context: string, error: unknown): void {
    reportCaughtError(this.logger, context, error);
  }

  private async dispatch(
    phone: string,
    normalized: string,
    mentionedJids?: string[],
  ): Promise<void> {
    const forMatching = stripAccents(normalized).toLowerCase();
    const command = this.commands.find((candidate) =>
      candidate.regex.test(forMatching),
    );
    if (!command) {
      await this.wp.sendToGroup(MSG_UNKNOWN_COMMAND);
      return;
    }

    const activeGame = await this.games.findActiveGame();
    if (activeGame) setLogContext({ gameId: activeGame.id });
    this.logger.log(`[CMD] ${command.regex.source.slice(0, 30)} | phone=${phone}`);
    if (command.requiresGame && !activeGame) {
      await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
      return;
    }
    const user = command.requiresUser
      ? await this.users.findByPhone(phone)
      : null;
    if (command.requiresUser && !user) {
      await this.wp.sendToGroup(MSG_USER_NOT_FOUND);
      return;
    }
    if (command.requiresActiveAccount && user && user.status !== 'active') {
      await this.wp.sendToGroup(buildAccountNotActiveMessage(user.status));
      return;
    }
    if (command.managerOnly && user && !GAME_MANAGERS.includes(user.role)) {
      await this.wp.sendToGroup(command.managerOnly);
      return;
    }

    const context: CommandContext = {
      phone,
      text: normalized,
      mentionedJids: mentionedJids ?? [],
      user,
      activeGame,
    };
    try {
      await command.handler(context, forMatching.match(command.regex));
    } catch (error: unknown) {
      this.logError(`Error no manejado en comando ${command.regex.source}`, error);
      await this.wp.sendToGroup(MSG_UNEXPECTED_ERROR).catch(() => undefined);
    }
  }
}
