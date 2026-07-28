import { Inject, Injectable, Logger } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from '../whatsapp.interface';
import { FinancesService } from '../../finances/finances.service';
import { userDisplayName } from '../../games/games.utils';
import { reportCaughtError } from '../../common/errors/report-caught-error';
import { env } from '../../config/env';
import {
  MSG_ALIASES,
  MSG_FINANCES,
  MSG_FINED_ERROR,
  MSG_HELP,
  MSG_NO_ACTIVE_GAME,
  MSG_NO_PENDING_FINES,
  MSG_RULES,
  buildPaymentMessage,
} from './messages';
import { ActiveGame, formatListForWhatsapp } from './list-formatter';

/**
 * Read-only commands: they answer a question and never mutate a game. Split out
 * of MessageHandlerService because they share no state with the registration
 * flow and only need the provider plus a formatter.
 */
@Injectable()
export class InfoCommandsService {
  private readonly logger = new Logger(InfoCommandsService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    private finances: FinancesService,
  ) {}

  async list(activeGame: ActiveGame | null): Promise<void> {
    if (!activeGame) {
      await this.wp.sendToGroup(MSG_NO_ACTIVE_GAME);
      return;
    }
    await this.wp.sendToGroup(formatListForWhatsapp(activeGame));
  }

  async help(): Promise<void> {
    await this.wp.sendToGroup(MSG_HELP);
  }

  async aliases(): Promise<void> {
    await this.wp.sendToGroup(MSG_ALIASES);
  }

  async rules(): Promise<void> {
    await this.wp.sendToGroup(MSG_RULES);
  }

  async financesInfo(): Promise<void> {
    await this.wp.sendToGroup(MSG_FINANCES);
  }

  async payment(): Promise<void> {
    await this.wp.sendToGroup(buildPaymentMessage(env.BREB_KEY));
  }

  async fined(): Promise<void> {
    try {
      const pendingFines = await this.finances.getPendingFines();

      if (pendingFines.length === 0) {
        await this.wp.sendToGroup(MSG_NO_PENDING_FINES);
        return;
      }

      const lines: string[] = [`💰 *Multados / Deudores*\n`];
      let total = 0;

      for (const fine of pendingFines) {
        const dateStr = new Date(fine.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
        lines.push(`• ${fine.user ? userDisplayName(fine.user) : fine.userName ?? 'Sin asignar'} - $${fine.amount.toLocaleString('es-CO')} (${fine.reason}) - ${dateStr}`);
        total += fine.amount;
      }

      lines.push(`\n*Total pendiente:* $${total.toLocaleString('es-CO')}`);
      lines.push(`\nPonte al día con un admin para poder jugar. 🏐`);

      await this.wp.sendToGroup(lines.join('\n'));
    } catch (e) {
      reportCaughtError(this.logger, 'Error al consultar multados', e);
      await this.wp.sendToGroup(MSG_FINED_ERROR);
    }
  }
}
