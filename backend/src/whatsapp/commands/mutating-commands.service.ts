import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GAME_MANAGERS } from '../../common/constants/roles';
import { reportCaughtError } from '../../common/errors/report-caught-error';
import {
  AlreadyRegisteredException,
  GameFullException,
  InactiveUserException,
  MustBeRegisteredFirstException,
  NoOneInWaitListException,
  NoPendingConfirmationException,
  NotRegisteredException,
  ProxyLimitExceededException,
  UserHasUnpaidFinesException,
} from '../../games/exceptions';
import { GamesService } from '../../games/games.service';
import { userDisplayName } from '../../games/games.utils';
import { UsersService } from '../../users/users.service';
import { WhatsappProvider, WHATSAPP_PROVIDER } from '../whatsapp.interface';
import { extractPhoneFromJid } from '../utils/jid-utils';
import { CommandContext } from './command-context';
import { BOT_MENTION } from './messages';

function extractInlineGuests(text: string): string[] {
  const afterKeyword = text.match(/^@z\s+\S+\s+(.*)/i)?.[1]?.trim() ?? '';
  const guestPart = afterKeyword.match(/^(?:\+|invitar?|traer?)\s+(.+)/i)?.[1];
  return guestPart
    ? guestPart.split(',').map((name) => name.trim()).filter(Boolean)
    : [];
}

@Injectable()
export class MutatingCommandsService {
  private readonly logger = new Logger(MutatingCommandsService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private wp: WhatsappProvider,
    private games: GamesService,
    private users: UsersService,
  ) {}

  private logError(context: string, error: unknown): void {
    reportCaughtError(this.logger, context, error);
  }

  async handleFinish(ctx: CommandContext): Promise<void> {
    try {
      const result = await this.games.complete(
        ctx.activeGame!.id,
        ctx.user!.id,
        { silent: true },
      );
      await this.wp.sendToGroup(result.report);
    } catch (error: unknown) {
      this.logError('Error al terminar partido', error);
      await this.wp.sendToGroup(
        '❌ No se pudo terminar el partido. Intenta de nuevo.',
      );
    }
  }

  async handleRemoveOther(ctx: CommandContext): Promise<void> {
    const otherMentions = ctx.mentionedJids.filter(
      (jid) => extractPhoneFromJid(jid) !== ctx.phone,
    );
    if (otherMentions.length === 0) {
      await this.wp.sendToGroup(
        `ℹ️ Debes mencionar a la persona que quieres sacar.\nEjemplo: *${BOT_MENTION} sacar @persona*`,
      );
      return;
    }
    const targetUser = await this.users.findByPhone(
      extractPhoneFromJid(otherMentions[0]),
    );
    if (!targetUser) {
      await this.wp.sendToGroup(
        '❌ El usuario mencionado no está registrado en el sistema.',
      );
      return;
    }
    try {
      await this.games.removeRegistration(
        ctx.activeGame!.id,
        targetUser.id,
        ctx.user!.id,
        ctx.user!.role,
      );
    } catch (error: unknown) {
      if (error instanceof NotRegisteredException) {
        await this.wp.sendToGroup(
          `ℹ️ ${userDisplayName(targetUser)} no está anotado en esta lista.`,
        );
      } else {
        this.logError('Error al sacar jugador', error);
        await this.wp.sendToGroup(
          `❌ No se pudo sacar a ${userDisplayName(targetUser)}. Intenta de nuevo.`,
        );
      }
    }
  }

  async handleConfirm(ctx: CommandContext): Promise<void> {
    const otherMentions = ctx.mentionedJids.filter(
      (jid) => extractPhoneFromJid(jid) !== ctx.phone,
    );
    if (otherMentions.length > 0) {
      if (!GAME_MANAGERS.includes(ctx.user!.role)) {
        await this.wp.sendToGroup(
          '⛔ Solo los administradores pueden confirmar por otros.',
        );
        return;
      }
      const confirmedNames: string[] = [];
      for (const jid of otherMentions) {
        const targetUser = await this.users.findByPhone(
          extractPhoneFromJid(jid),
        );
        if (!targetUser) {
          await this.wp.sendToGroup(
            '❌ Un usuario mencionado no está registrado en el sistema.',
          );
          continue;
        }
        try {
          await this.games.confirmRegistration(
            ctx.activeGame!.id,
            targetUser.id,
            ctx.user!.id,
            { silent: true },
          );
          confirmedNames.push(userDisplayName(targetUser));
        } catch (error: unknown) {
          if (error instanceof NoPendingConfirmationException) {
            await this.wp.sendToGroup(
              `ℹ️ ${userDisplayName(targetUser)} no tiene ninguna confirmación pendiente.`,
            );
          } else {
            this.logError('Error al confirmar por otro', error);
            await this.wp.sendToGroup(
              `❌ No se pudo confirmar a ${userDisplayName(targetUser)}. Intenta de nuevo.`,
            );
          }
        }
      }
      if (confirmedNames.length > 0) {
        await this.wp.sendToGroup(
          `✅ *${userDisplayName(ctx.user!)}* confirmó la asistencia de ${confirmedNames.join(', ')} 🏐`,
        );
      }
      return;
    }

    try {
      const result = await this.games.confirmRegistration(
        ctx.activeGame!.id,
        ctx.user!.id,
        ctx.user!.id,
        { silent: true },
      );
      const parts: string[] = [];
      if (result.confirmedOwn) parts.push('su asistencia');
      if (result.confirmedGuests.length > 0) {
        const guests = result.confirmedGuests.join(', ');
        parts.push(
          result.confirmedOwn ? `la de ${guests}` : `asistencia de ${guests}`,
        );
      }
      await this.wp.sendToGroup(
        `✅ *${userDisplayName(ctx.user!)}* confirmó ${parts.join(' y ')} 🏐`,
      );
    } catch (error: unknown) {
      if (error instanceof NoPendingConfirmationException) {
        await this.wp.sendToGroup(
          `ℹ️ ${userDisplayName(ctx.user!)}, no tienes ninguna confirmación pendiente.`,
        );
      } else {
        this.logError('Error al confirmar', error);
        await this.wp.sendToGroup(
          '❌ No se pudo confirmar tu asistencia. Intenta de nuevo.',
        );
      }
    }
  }

  async handlePromote(ctx: CommandContext): Promise<void> {
    if (ctx.user!.role !== Role.admin) {
      const currentGame = await this.games.findOne(ctx.activeGame!.id);
      const isInGame = currentGame.registrations.some(
        (registration) =>
          registration.user?.id === ctx.user!.id &&
          !registration.isWaitingList,
      );
      if (!isInGame) {
        await this.wp.sendToGroup(
          `⛔ ${userDisplayName(ctx.user!)}, solo los jugadores en la lista principal pueden usar este comando.`,
        );
        return;
      }
    }
    try {
      const { updated, promotedName } = await this.games.promoteNext(
        ctx.activeGame!.id,
        ctx.user!.id,
      );
      await this.wp.sendToGroup(
        `⬆️ *${promotedName}* fue promovido a la *lista principal* 🏐\n${this.games.buildCounts(updated)}${this.games.buildGameLink(ctx.activeGame!.id)}`,
      );
    } catch (error: unknown) {
      if (error instanceof GameFullException) {
        await this.wp.sendToGroup(
          '⚠️ La lista principal ya está llena, no se puede promover a nadie.',
        );
      } else if (error instanceof NoOneInWaitListException) {
        await this.wp.sendToGroup(
          'ℹ️ No hay nadie en la lista de espera para promover.',
        );
      } else {
        this.logError('Error al promover', error);
        await this.wp.sendToGroup('❌ No se pudo promover. Intenta de nuevo.');
      }
    }
  }

  async handleInvite(ctx: CommandContext): Promise<void> {
    const currentGame = await this.games.findOne(ctx.activeGame!.id);
    const isRegistered = currentGame.registrations.some(
      (registration) => registration.user?.id === ctx.user!.id,
    );
    if (!isRegistered) {
      await this.wp.sendToGroup(
        `⚠️ ${userDisplayName(ctx.user!)}, debes estar anotado en la lista antes de invitar a alguien.`,
      );
      return;
    }
    const rawNames = ctx.text.match(/^@z\s+\S+\s+(.+)/i)?.[1]?.trim();
    if (!rawNames && ctx.mentionedJids.length === 0) {
      await this.wp.sendToGroup(
        `ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez, Ana López*`,
      );
      return;
    }
    const messages: string[] = [];
    const nonSelfJids = ctx.mentionedJids.filter(
      (jid) => extractPhoneFromJid(jid) !== ctx.phone,
    );
    for (const jid of nonSelfJids) {
      const phone = extractPhoneFromJid(jid);
      const targetUser = await this.users.findByPhone(phone);
      if (!targetUser) {
        messages.push(
          `❌ El usuario @${phone} no está registrado en el sistema. Usa su nombre para anotarlo como invitado.`,
        );
        continue;
      }
      try {
        const registration = await this.games.register(
          ctx.activeGame!.id,
          targetUser.id,
          ctx.user!.id,
          { silent: true },
        );
        const spot = registration.isWaitingList
          ? `en la *lista de espera* (puesto ${registration.position})`
          : 'en la *lista principal*';
        messages.push(
          `✅ *${userDisplayName(targetUser)}* fue anotado ${spot} por *${userDisplayName(ctx.user!)}* 🏐`,
        );
      } catch (error: unknown) {
        if (error instanceof AlreadyRegisteredException) {
          messages.push(
            `ℹ️ ${userDisplayName(targetUser)} ya está anotado en esta lista.`,
          );
        } else {
          this.logError(
            `Error al anotar al miembro ${targetUser.name} via invitar`,
            error,
          );
          messages.push(
            `❌ No se pudo anotar a *${userDisplayName(targetUser)}*. Intenta de nuevo.`,
          );
        }
      }
    }
    const textNames = (rawNames ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && !name.startsWith('@'));
    for (const guestName of textNames) {
      try {
        const registration = await this.games.registerGuest(
          ctx.activeGame!.id,
          guestName,
          ctx.user!.id,
          { silent: true },
        );
        const spot = registration.isWaitingList
          ? `en la *lista de espera* (puesto ${registration.position})`
          : 'en la *lista principal*';
        messages.push(
          `✅ Invitado *${guestName}* fue anotado ${spot} por *${userDisplayName(ctx.user!)}* 🏐`,
        );
      } catch (error: unknown) {
        this.logError(`Error al invitar a ${guestName}`, error);
        messages.push(
          `❌ No se pudo anotar a *${guestName}*. Intenta de nuevo.`,
        );
      }
    }
    if (messages.length === 0) {
      await this.wp.sendToGroup(
        `ℹ️ Debes indicar el nombre del invitado.\nEjemplo: *${BOT_MENTION} invitar Juan Pérez, Ana López*`,
      );
      return;
    }
    const updated = await this.games.findOne(ctx.activeGame!.id);
    messages.push(
      this.games.buildCounts(updated) +
        this.games.buildGameLink(ctx.activeGame!.id),
    );
    await this.wp.sendToGroup(messages.join('\n'));
  }

  async handleUnregister(ctx: CommandContext): Promise<void> {
    try {
      await this.games.removeRegistration(
        ctx.activeGame!.id,
        ctx.user!.id,
        ctx.user!.id,
        ctx.user!.role,
      );
    } catch (error: unknown) {
      if (error instanceof NotRegisteredException) {
        await this.wp.sendToGroup(
          `ℹ️ ${userDisplayName(ctx.user!)}, no estás anotado en esta lista.`,
        );
      } else {
        this.logError('Error al salir', error);
        await this.wp.sendToGroup(
          '❌ No se pudo salir de la lista. Intenta de nuevo.',
        );
      }
    }
  }

  async handleRegister(ctx: CommandContext): Promise<void> {
    const otherMentions = ctx.mentionedJids.filter(
      (jid) => extractPhoneFromJid(jid) !== ctx.phone,
    );
    const isManager = GAME_MANAGERS.includes(ctx.user!.role);
    const allowedMentions = isManager ? otherMentions : otherMentions.slice(0, 1);
    const rejectedMentions = isManager ? [] : otherMentions.slice(1);
    const inlineGuests = extractInlineGuests(ctx.text);
    const hasTargetMention = allowedMentions.length > 0;
    const hasInlineGuests = inlineGuests.length > 0;
    let senderRegistered = false;
    let senderAlreadyRegistered = false;
    const currentGame = await this.games.findOne(ctx.activeGame!.id);
    const existingSender = currentGame.registrations.find(
      (registration) => registration.user?.id === ctx.user!.id,
    );
    const isDeclinedWaiter =
      Boolean(existingSender?.isWaitingList) &&
      Boolean(existingSender?.confirmationDeclined);

    if (existingSender && !isDeclinedWaiter) {
      senderAlreadyRegistered = true;
    } else {
      try {
        const retry = await this.games.retryFromWaitingList(
          ctx.activeGame!.id,
          ctx.user!.id,
        );
        if (retry.game) {
          senderRegistered = true;
          if (!retry.promoted && !hasTargetMention && !hasInlineGuests) {
            await this.wp.sendToGroup(
              `⚠️ *${userDisplayName(ctx.user!)}*, no hay cupos disponibles en este momento. Si se libera un cupo serás promovido automáticamente.\n${this.games.buildCounts(retry.game)}${this.games.buildGameLink(ctx.activeGame!.id)}`,
            );
            return;
          }
        } else {
          await this.games.register(
            ctx.activeGame!.id,
            ctx.user!.id,
            ctx.user!.id,
            { silent: true },
          );
          senderRegistered = true;
        }
      } catch (error: unknown) {
        if (error instanceof AlreadyRegisteredException) {
          senderAlreadyRegistered = true;
        } else if (error instanceof UserHasUnpaidFinesException) {
          await this.wp.sendToGroup(
            `🚫 *${userDisplayName(ctx.user!)}*, no puedes anotarte porque tienes multas/deudas pendientes. Contacta a un admin para ponerte al día.`,
          );
          return;
        } else {
          this.logError('Error al anotar al remitente', error);
          await this.wp.sendToGroup(
            '❌ No se pudo anotarte. Intenta de nuevo.',
          );
          return;
        }
      }
    }

    if (!hasTargetMention && !hasInlineGuests) {
      if (senderAlreadyRegistered) {
        await this.wp.sendToGroup(
          `ℹ️ ${userDisplayName(ctx.user!)}, ya estás anotado en esta lista.`,
        );
      } else {
        const updated = await this.games.findOne(ctx.activeGame!.id);
        const senderReg = updated.registrations.find(
          (registration) => registration.user?.id === ctx.user!.id,
        );
        const spot = senderReg?.isWaitingList
          ? `en la *lista de espera* en el puesto ${senderReg.position}`
          : 'en la *lista principal*';
        await this.wp.sendToGroup(
          `✅ *${userDisplayName(ctx.user!)}* se anotó ${spot}! 🏐\n${this.games.buildCounts(updated)}${this.games.buildGameLink(ctx.activeGame!.id)}`,
        );
      }
      return;
    }

    const messages: string[] = [];
    if (senderRegistered) {
      messages.push(
        `✅ *${userDisplayName(ctx.user!)}* se anotó en la lista.`,
      );
    }
    for (const mentionJid of allowedMentions) {
      const targetUser = await this.users.findByPhone(
        extractPhoneFromJid(mentionJid),
      );
      if (!targetUser) {
        messages.push(
          '❌ Un usuario mencionado no está registrado en el sistema.',
        );
        continue;
      }
      try {
        const registration = await this.games.register(
          ctx.activeGame!.id,
          targetUser.id,
          ctx.user!.id,
          { silent: true },
        );
        const spot = registration.isWaitingList
          ? `en la *lista de espera* (puesto ${registration.position})`
          : 'en la *lista principal*';
        messages.push(
          `✅ *${userDisplayName(targetUser)}* fue anotado ${spot} por *${userDisplayName(ctx.user!)}* 🏐`,
        );
      } catch (error: unknown) {
        if (error instanceof AlreadyRegisteredException) {
          messages.push(
            `ℹ️ ${userDisplayName(targetUser)} ya está anotado en esta lista.`,
          );
        } else if (error instanceof UserHasUnpaidFinesException) {
          messages.push(
            `🚫 ${userDisplayName(targetUser)} tiene multas/deudas pendientes y no puede anotarse.`,
          );
        } else if (error instanceof ProxyLimitExceededException) {
          messages.push(
            `🚫 No pudimos anotar a ${userDisplayName(targetUser)}: ya alcanzaste el máximo de personas que puedes anotar en este partido.`,
          );
        } else if (error instanceof MustBeRegisteredFirstException) {
          messages.push(
            `🚫 No pudimos anotar a ${userDisplayName(targetUser)}: primero debes anotarte tú para poder anotar a alguien más.`,
          );
        } else if (error instanceof InactiveUserException) {
          messages.push(
            `🚫 No pudimos anotar a ${userDisplayName(targetUser)}: su cuenta no está activa. Contacta a un admin.`,
          );
        } else {
          this.logError(`Error al anotar a ${targetUser.name}`, error);
          messages.push(
            `❌ No se pudo anotar a ${userDisplayName(targetUser)}. Intenta de nuevo.`,
          );
        }
      }
    }
    if (rejectedMentions.length > 0) {
      messages.push(
        `⚠️ Solo puedes anotar a una persona adicional. ${
          rejectedMentions.length === 1
            ? 'Una mención fue ignorada'
            : `${rejectedMentions.length} menciones fueron ignoradas`
        }.`,
      );
    }
    if (hasInlineGuests) {
      if (!senderRegistered && !senderAlreadyRegistered) {
        messages.push(
          `⚠️ ${userDisplayName(ctx.user!)}, debes estar anotado en la lista para poder traer invitados.`,
        );
      } else {
        for (const guestName of inlineGuests) {
          try {
            const registration = await this.games.registerGuest(
              ctx.activeGame!.id,
              guestName,
              ctx.user!.id,
              { silent: true },
            );
            const spot = registration.isWaitingList
              ? `en la *lista de espera* (puesto ${registration.position})`
              : 'en la *lista principal*';
            messages.push(
              `✅ Invitado *${guestName}* fue anotado ${spot} por *${userDisplayName(ctx.user!)}* 🏐`,
            );
          } catch (error: unknown) {
            this.logError(`Error al invitar inline a ${guestName}`, error);
            messages.push(
              `❌ No se pudo anotar al invitado *${guestName}*. Intenta de nuevo.`,
            );
          }
        }
      }
    }
    const updated = await this.games.findOne(ctx.activeGame!.id);
    messages.push(
      this.games.buildCounts(updated) +
        this.games.buildGameLink(ctx.activeGame!.id),
    );
    await this.wp.sendToGroup(messages.join('\n'));
  }
}
