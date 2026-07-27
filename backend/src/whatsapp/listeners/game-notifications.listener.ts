import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsappService } from '../whatsapp.service';
import {
  AttendanceConfirmedByStaffEvent,
  AttendanceConfirmedEvent,
  ConfirmationExpiredEvent,
  GameCancelledEvent,
  GameCompletedEvent,
  GameEvent,
  GameSnapshot,
  GuestCutoffReachedEvent,
  GuestRegisteredEvent,
  NotifiableTarget,
  PlayerDemotedEvent,
  PlayerPromotedEvent,
  PlayerRegisteredEvent,
  PlayerRemovedEvent,
  PlayersAutoPromotedEvent,
  RegistrationOpenedEvent,
} from '../../games/events/game-events';
import {
  buildCounts,
  buildGameLink,
  buildMention,
  buildRegistrationOpenMessage,
} from '../../games/games.utils';

/** Counts line plus deep link, the footer most announcements share. */
function footer(game: GameSnapshot): string {
  return `\n${buildCounts(game)}${buildGameLink(game.id)}`;
}

/** Who to ping, as a mentionable tag when we have a number for them. */
function confirmTarget(target: NotifiableTarget | null): { tag: string; jid?: string } {
  const mention = target ? buildMention(target) : null;
  if (mention) return { tag: mention.tag, jid: mention.jid };
  return { tag: `*${target?.displayName ?? 'Alguien'}*` };
}

/**
 * Owns every piece of group copy triggered by a games-module domain event, so
 * the games module never references WhatsApp. Handlers return whether the
 * message was delivered; emitters that gate persistence on delivery read it
 * back through `emitAsync`.
 */
@Injectable()
export class GameNotificationsListener {
  private readonly logger = new Logger(GameNotificationsListener.name);

  constructor(private whatsapp: WhatsappService) {}

  @OnEvent(GameEvent.RegistrationOpened)
  onRegistrationOpened({ game }: RegistrationOpenedEvent): Promise<boolean> {
    return this.send(buildRegistrationOpenMessage(game));
  }

  @OnEvent(GameEvent.PlayerRegistered)
  onPlayerRegistered(event: PlayerRegisteredEvent): Promise<boolean> {
    // When someone registers on behalf of another player, the message must name
    // the actor instead of implying the target registered themselves.
    const headline = event.registeredByName
      ? `✅ *${event.registeredByName}* anotó a *${event.playerName}* ${spotLabel(event)} 🏐`
      : `✅ *${event.playerName}* se anotó ${spotLabel(event)}! 🏐`;

    return this.send(headline + footer(event.game));
  }

  @OnEvent(GameEvent.GuestRegistered)
  onGuestRegistered(event: GuestRegisteredEvent): Promise<boolean> {
    const byInviter = event.inviterName ? ` por *${event.inviterName}*` : '';
    return this.send(
      `✅ Invitado *${event.guestName}* fue anotado ${spotLabel(event)}${byInviter} 🏐` +
        footer(event.game),
    );
  }

  @OnEvent(GameEvent.AttendanceConfirmed)
  onAttendanceConfirmed(event: AttendanceConfirmedEvent): Promise<boolean> {
    if (event.onBehalf) {
      return this.send(`✅ Un admin confirmó la asistencia de *${event.confirmedByName}* 🏐`);
    }

    const parts: string[] = [];
    if (event.confirmedOwn) parts.push('su asistencia');
    if (event.confirmedGuests.length > 0) {
      const guests = event.confirmedGuests.join(', ');
      parts.push(event.confirmedOwn ? `la de ${guests}` : `asistencia de ${guests}`);
    }

    return this.send(`✅ *${event.confirmedByName}* confirmó ${parts.join(' y ')} 🏐`);
  }

  @OnEvent(GameEvent.AttendanceConfirmedByStaff)
  onAttendanceConfirmedByStaff(event: AttendanceConfirmedByStaffEvent): Promise<boolean> {
    return this.send(`✅ *${event.actorName}* confirmó la asistencia de *${event.playerName}* 🏐`);
  }

  @OnEvent(GameEvent.PlayerRemoved)
  onPlayerRemoved(event: PlayerRemovedEvent): Promise<boolean> {
    let msg = event.removedBySelf
      ? `👋 *${event.playerName}* salió de la lista.`
      : `🚫 *${event.playerName}* fue sacado de la lista por un admin.`;

    if (event.removedGuestNames.length > 0) {
      const label =
        event.removedGuestNames.length === 1
          ? 'Su invitado también fue removido'
          : 'Sus invitados también fueron removidos';
      msg += `\n🚫 ${label}: ${event.removedGuestNames.join(', ')}`;
    }

    return this.send(msg + footer(event.game));
  }

  @OnEvent(GameEvent.PlayerPromoted)
  onPlayerPromoted(event: PlayerPromotedEvent): Promise<boolean> {
    const byAdmin = event.byAdmin ? ' por un admin' : '';
    return this.send(
      `⬆️ *${event.playerName}* fue promovido a la *lista principal*${byAdmin} 🏐` +
        footer(event.game),
    );
  }

  @OnEvent(GameEvent.PlayerDemoted)
  onPlayerDemoted(event: PlayerDemotedEvent): Promise<boolean> {
    const adminNote = event.byAdmin ? ' (por un admin)' : '';
    return this.send(
      `⬇️ *${event.playerName}* fue movido a la *lista de espera*${adminNote} (puesto ${event.position})` +
        footer(event.game),
    );
  }

  @OnEvent(GameEvent.PlayersAutoPromoted)
  onPlayersAutoPromoted(event: PlayersAutoPromotedEvent): Promise<boolean> {
    const minutes = event.confirmWindowMinutes;

    if (event.promoted.length === 1) {
      const { playerName, target } = event.promoted[0];
      const { tag, jid } = confirmTarget(target);
      return this.send(
        `⬆️ *${playerName}* fue promovido a la *lista principal* 🏐\n` +
          `${tag}, confirma con *@Z confirmar* en los próximos ${minutes} min.` +
          footer(event.game),
        jid ? { mentions: [jid] } : undefined,
      );
    }

    // One consolidated message; each person still gets a push via their mention.
    const jids: string[] = [];
    const lines = event.promoted.map(({ playerName, target }) => {
      const { tag, jid } = confirmTarget(target);
      if (jid) jids.push(jid);
      return `• *${playerName}* → ${tag}`;
    });

    return this.send(
      `⬆️ *${event.promoted.length} cupos disponibles* — promovidos a la lista principal 🏐\n` +
        `${lines.join('\n')}\n` +
        `Confirmen con *@Z confirmar* en los próximos ${minutes} min.` +
        footer(event.game),
      jids.length > 0 ? { mentions: jids } : undefined,
    );
  }

  @OnEvent(GameEvent.ConfirmationExpired)
  onConfirmationExpired(event: ConfirmationExpiredEvent): Promise<boolean> {
    return this.send(
      `⏰ *${event.playerName}* no confirmó a tiempo y volvió a la lista de espera (puesto ${event.returnedToPosition}).` +
        footer(event.game),
    );
  }

  @OnEvent(GameEvent.WaitlistExhausted)
  onWaitlistExhausted(): Promise<boolean> {
    return this.send(
      `ℹ️ Nadie en lista de espera confirmó. El cupo queda disponible para quien se anote.`,
    );
  }

  @OnEvent(GameEvent.GuestCutoffReached)
  onGuestCutoffReached({ gameTitle }: GuestCutoffReachedEvent): Promise<boolean> {
    return this.send(
      `⏰ *Hora de corte alcanzada* para *${gameTitle}*\n` +
        `A partir de ahora, invitados y miembros en lista de espera tienen la misma prioridad para cupos libres.`,
    );
  }

  @OnEvent(GameEvent.GameCancelled)
  onGameCancelled({ gameTitle, reason }: GameCancelledEvent): Promise<boolean> {
    return this.send(`❌ *${gameTitle}* ha sido cancelado.${reason ? `\nMotivo: ${reason}` : ''}`);
  }

  @OnEvent(GameEvent.GameCompleted)
  onGameCompleted({ report }: GameCompletedEvent): Promise<boolean> {
    return this.send(report);
  }

  private async send(message: string, options?: { mentions: string[] }): Promise<boolean> {
    try {
      return options
        ? await this.whatsapp.sendToGroup(message, options)
        : await this.whatsapp.sendToGroup(message);
    } catch (e) {
      this.logger.warn('No se pudo enviar el aviso al grupo', e as Error);
      return false;
    }
  }
}

function spotLabel(event: { isWaitingList: boolean; position: number }): string {
  return event.isWaitingList
    ? `en la *lista de espera* (puesto ${event.position})`
    : `en la *lista principal*`;
}
