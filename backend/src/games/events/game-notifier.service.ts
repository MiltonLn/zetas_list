import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttendanceConfirmedByStaffEvent,
  AttendanceConfirmedEvent,
  ConfirmationExpiredEvent,
  GameCancelledEvent,
  GameCompletedEvent,
  GameEvent,
  GuestCutoffReachedEvent,
  GuestRegisteredEvent,
  PlayerDemotedEvent,
  PlayerPromotedEvent,
  PlayerRegisteredEvent,
  PlayerRemovedEvent,
  PlayersAutoPromotedEvent,
  RegistrationOpenedEvent,
} from './game-events';

/**
 * Typed façade over the event bus. Two flavours:
 *
 * - `announce*` — fire-and-forget. A failed notification must never fail the
 *   request that triggered it.
 * - `deliver*` — awaits listeners and reports whether one confirmed delivery,
 *   for the scheduler flows that only persist a state change once the group
 *   actually received the message.
 */
@Injectable()
export class GameNotifier {
  private readonly logger = new Logger(GameNotifier.name);

  constructor(private emitter: EventEmitter2) {}

  announceRegistrationOpened(payload: RegistrationOpenedEvent): void {
    this.announce(GameEvent.RegistrationOpened, payload);
  }

  announcePlayerRegistered(payload: PlayerRegisteredEvent): void {
    this.announce(GameEvent.PlayerRegistered, payload);
  }

  announceGuestRegistered(payload: GuestRegisteredEvent): void {
    this.announce(GameEvent.GuestRegistered, payload);
  }

  announceAttendanceConfirmed(payload: AttendanceConfirmedEvent): void {
    this.announce(GameEvent.AttendanceConfirmed, payload);
  }

  announceAttendanceConfirmedByStaff(payload: AttendanceConfirmedByStaffEvent): void {
    this.announce(GameEvent.AttendanceConfirmedByStaff, payload);
  }

  /**
   * Awaited so the removal notice lands before any auto-promotion notice that
   * follows it; otherwise "X fue promovido" can read before "Y salió".
   */
  async announcePlayerRemoved(payload: PlayerRemovedEvent): Promise<void> {
    await this.emit(GameEvent.PlayerRemoved, payload);
  }

  announcePlayerPromoted(payload: PlayerPromotedEvent): void {
    this.announce(GameEvent.PlayerPromoted, payload);
  }

  announcePlayerDemoted(payload: PlayerDemotedEvent): void {
    this.announce(GameEvent.PlayerDemoted, payload);
  }

  announcePlayersAutoPromoted(payload: PlayersAutoPromotedEvent): void {
    this.announce(GameEvent.PlayersAutoPromoted, payload);
  }

  announceConfirmationExpired(payload: ConfirmationExpiredEvent): void {
    this.announce(GameEvent.ConfirmationExpired, payload);
  }

  announceWaitlistExhausted(): void {
    this.announce(GameEvent.WaitlistExhausted, {});
  }

  announceGameCancelled(payload: GameCancelledEvent): void {
    this.announce(GameEvent.GameCancelled, payload);
  }

  announceGameCompleted(payload: GameCompletedEvent): void {
    this.announce(GameEvent.GameCompleted, payload);
  }

  deliverRegistrationOpened(payload: RegistrationOpenedEvent): Promise<boolean> {
    return this.deliver(GameEvent.RegistrationOpened, payload);
  }

  deliverGuestCutoffReached(payload: GuestCutoffReachedEvent): Promise<boolean> {
    return this.deliver(GameEvent.GuestCutoffReached, payload);
  }

  private announce(event: string, payload: unknown): void {
    this.emit(event, payload).catch(() => {
      /* already logged in emit() */
    });
  }

  private async emit(event: string, payload: unknown): Promise<unknown[]> {
    try {
      return await this.emitter.emitAsync(event, payload);
    } catch (e) {
      this.logger.warn(`Fallo notificando ${event}`, e as Error);
      return [];
    }
  }

  /** True only if some listener reported a successful delivery. */
  private async deliver(event: string, payload: unknown): Promise<boolean> {
    const results = await this.emit(event, payload);

    if (results.length === 0) {
      // No listener registered: report undelivered so the caller retries rather
      // than marking the notification done.
      this.logger.error(`No hay listeners para ${event}; el aviso no se envió`);
      return false;
    }

    return results.some((result) => result === true);
  }
}
