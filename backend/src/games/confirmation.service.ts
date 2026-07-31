import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameEventsService } from './game-events.service';
import { GameNotifier } from './events/game-notifier.service';
import { toNotifiableTarget } from './events/notifiable-target';
import { NoPendingConfirmationException } from './exceptions';
import { GameQueryService } from './game-query.service';
import {
  displayName,
  NEXT_CONFIRM_TIMEOUT_MS,
  REGISTRATION_INCLUDE,
  userDisplayName,
} from './games.utils';
import { withGameLock } from './transaction.util';
import { WaitlistService } from './waitlist.service';

@Injectable()
export class ConfirmationService {
  private readonly logger = new Logger(ConfirmationService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private query: GameQueryService,
    private notifier: GameNotifier,
    private waitlist: WaitlistService,
  ) {}

  async confirmRegistration(
    gameId: string,
    userId: string,
    actorId: string = userId,
    options: { silent?: boolean } = {},
  ) {
    const confirmed = await withGameLock(this.prisma, gameId, async (tx) => {
      const ownReg = await tx.gameRegistration.findFirst({
        where: { gameId, userId, pendingConfirmation: true },
        include: { user: { select: { name: true, alias: true } } },
      });
      const guestRegs = await tx.gameRegistration.findMany({
        where: {
          gameId,
          registeredById: userId,
          isGuest: true,
          pendingConfirmation: true,
        },
        include: { registeredBy: { select: { name: true, alias: true } } },
      });
      const allPending = [...(ownReg ? [ownReg] : []), ...guestRegs];
      if (allPending.length === 0) throw new NoPendingConfirmationException();
      await tx.gameRegistration.updateMany({
        where: { id: { in: allPending.map((registration) => registration.id) } },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });
      return {
        confirmedOwn: Boolean(ownReg),
        confirmedGuests: guestRegs.map(
          (registration) => registration.guestName || 'Invitado',
        ),
        confirmedByName: ownReg?.user
          ? userDisplayName(ownReg.user)
          : guestRegs[0]?.registeredBy
            ? userDisplayName(guestRegs[0].registeredBy)
            : 'Jugador',
      };
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: userId,
      action: 'confirmation_received',
      details: {
        confirmedOwn: confirmed.confirmedOwn,
        confirmedGuests: confirmed.confirmedGuests,
        onBehalf: actorId !== userId,
      },
    });
    this.logger.log(
      `[CONFIRM] game=${gameId} | user=${userId} | own=${confirmed.confirmedOwn} | guests=${confirmed.confirmedGuests.length} | onBehalf=${actorId !== userId}`,
    );
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    if (!options.silent) {
      this.notifier.announceAttendanceConfirmed({
        confirmedByName: confirmed.confirmedByName,
        confirmedOwn: confirmed.confirmedOwn,
        confirmedGuests: confirmed.confirmedGuests,
        onBehalf: actorId !== userId,
      });
    }
    return { game: updated, ...confirmed };
  }

  async confirmRegistrationById(
    gameId: string,
    regId: string,
    actorId: string,
  ) {
    const confirmed = await withGameLock(this.prisma, gameId, async (tx) => {
      const registration = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, pendingConfirmation: true },
        include: { user: { select: { name: true, alias: true } } },
      });
      if (!registration) throw new NoPendingConfirmationException();
      await tx.gameRegistration.update({
        where: { id: registration.id },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });
      return {
        name: registration.isGuest
          ? registration.guestName || 'Invitado'
          : registration.user
            ? userDisplayName(registration.user)
            : 'Jugador',
        userId: registration.userId,
      };
    });
    await this.audit.log({
      gameId,
      actorId,
      targetUserId: confirmed.userId ?? undefined,
      action: 'confirmation_received',
      details: { confirmedRegId: regId, onBehalf: true },
    });
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, alias: true },
    });
    this.logger.log(
      `[CONFIRM] game=${gameId} | reg=${regId} | confirmed=${confirmed.name} | by=${actor?.name || actorId} | onBehalf=true`,
    );
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    this.notifier.announceAttendanceConfirmedByStaff({
      actorName: actor ? userDisplayName(actor) : 'Un admin',
      playerName: confirmed.name,
    });
    return { game: updated, name: confirmed.name };
  }

  async handleConfirmationTimeout(regId: string): Promise<void> {
    const registration = await this.prisma.gameRegistration.findUnique({
      where: { id: regId },
      include: REGISTRATION_INCLUDE,
    });
    if (!registration?.pendingConfirmation) return;
    const result = await this.waitlist.continueAfterConfirmationTimeout(
      registration.gameId,
      regId,
      registration.originalWaitPosition,
    );
    if (!result) return;

    await this.audit.log({
      gameId: registration.gameId,
      actorId: null,
      targetUserId: registration.userId ?? undefined,
      action: 'confirmation_expired',
      details: { returnedToPosition: result.returnPosition },
    });
    const playerName = displayName(registration);
    const updated = await this.query.findOne(registration.gameId);
    this.events.emit({
      gameId: registration.gameId,
      type: 'update',
      data: updated,
    });
    this.logger.log(
      `[CONFIRM_TIMEOUT] game=${registration.gameId} | reg=${regId} | player=${playerName} | isGuest=${registration.isGuest} | returnedToPos=${result.returnPosition}`,
    );
    this.notifier.announceConfirmationExpired({
      playerName,
      returnedToPosition: result.returnPosition,
      game: updated,
    });

    if (!result.nextInWait || !result.nextDeadline) {
      this.logger.log(
        `[CONFIRM_TIMEOUT] game=${registration.gameId} | no eligible waiter -> spot left free`,
      );
      this.notifier.announceWaitlistExhausted();
      return;
    }
    await this.audit.log({
      gameId: registration.gameId,
      actorId: null,
      targetUserId: result.nextInWait.userId ?? undefined,
      action: 'confirmation_requested',
      details: { deadline: result.nextDeadline.toISOString() },
    });
    const nextName = displayName(result.nextInWait);
    const finalUpdated = await this.query.findOne(registration.gameId);
    this.events.emit({
      gameId: registration.gameId,
      type: 'update',
      data: finalUpdated,
    });
    this.logger.log(
      `[CONFIRM_TIMEOUT] game=${registration.gameId} | cascade promoted=${nextName} | isGuest=${result.nextInWait.isGuest} | fromWaitPos=${result.nextOriginalPosition} | confirmWindow=5min`,
    );
    this.notifier.announcePlayersAutoPromoted({
      promoted: [
        {
          playerName: nextName,
          target: toNotifiableTarget(result.nextInWait),
        },
      ],
      confirmWindowMinutes: NEXT_CONFIRM_TIMEOUT_MS / 60_000,
      game: finalUpdated,
    });
  }
}
