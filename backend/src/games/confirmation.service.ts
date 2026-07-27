import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { GameQueryService } from './game-query.service';
import { withGameLock } from './transaction.util';
import { GameNotifier } from './events/game-notifier.service';
import { NoPendingConfirmationException } from './exceptions';
import {
  displayName,
  userDisplayName,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
  NEXT_CONFIRM_TIMEOUT_MS,
} from './games.utils';
import { toNotifiableTarget } from './events/notifiable-target';

/**
 * Owns the confirmation window: someone promoted into a free spot has to claim
 * it before the deadline, or the spot cascades to the next eligible player.
 */
@Injectable()
export class ConfirmationService {
  private readonly logger = new Logger(ConfirmationService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private query: GameQueryService,
    private notifier: GameNotifier,
  ) {}

  async confirmRegistration(
    gameId: string,
    userId: string,
    actorId: string = userId,
    options: { silent?: boolean } = {},
  ): Promise<{ game: any; confirmedOwn: boolean; confirmedGuests: string[] }> {
    const confirmed = await withGameLock(this.prisma, gameId, async (tx) => {

      const ownReg = await tx.gameRegistration.findFirst({
        where: { gameId, userId, pendingConfirmation: true },
        include: { user: { select: { name: true, alias: true } } },
      });

      const guestRegs = await tx.gameRegistration.findMany({
        where: { gameId, registeredById: userId, isGuest: true, pendingConfirmation: true },
        include: { registeredBy: { select: { name: true, alias: true } } },
      });

      const allPending = [...(ownReg ? [ownReg] : []), ...guestRegs];
      if (allPending.length === 0) throw new NoPendingConfirmationException();

      await tx.gameRegistration.updateMany({
        where: { id: { in: allPending.map((r) => r.id) } },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });

      return {
        confirmedOwn: !!ownReg,
        confirmedGuests: guestRegs.map((r) => r.guestName || 'Invitado'),
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
      details: { confirmedOwn: confirmed.confirmedOwn, confirmedGuests: confirmed.confirmedGuests, onBehalf: actorId !== userId },
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

    return {
      game: updated,
      confirmedOwn: confirmed.confirmedOwn,
      confirmedGuests: confirmed.confirmedGuests,
    };
  }

  /**
   * Confirma un registro puntual por su id. Pensado para la acción de admin desde
   * la UI: funciona tanto para miembros (autopromoción) como para invitados, que
   * no tienen `userId` propio y por eso no pueden confirmarse por usuario.
   */
  async confirmRegistrationById(gameId: string, regId: string, actorId: string): Promise<{ game: any; name: string }> {
    const confirmed = await withGameLock(this.prisma, gameId, async (tx) => {

      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, pendingConfirmation: true },
        include: { user: { select: { name: true, alias: true } } },
      });
      if (!reg) throw new NoPendingConfirmationException();

      await tx.gameRegistration.update({
        where: { id: reg.id },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });

      return {
        name: reg.isGuest ? reg.guestName || 'Invitado' : (reg.user ? userDisplayName(reg.user) : 'Jugador'),
        userId: reg.userId as string | null,
      };
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: confirmed.userId ?? undefined,
      action: 'confirmation_received',
      details: { confirmedRegId: regId, onBehalf: true },
    });

    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true, alias: true } });

    this.logger.log(`[CONFIRM] game=${gameId} | reg=${regId} | confirmed=${confirmed.name} | by=${actor?.name || actorId} | onBehalf=true`);

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    this.notifier.announceAttendanceConfirmedByStaff({
      actorName: actor ? userDisplayName(actor) : 'Un admin',
      playerName: confirmed.name,
    });

    return { game: updated, name: confirmed.name };
  }

  async handleConfirmationTimeout(regId: string) {
    const reg = await this.prisma.gameRegistration.findUnique({
      where: { id: regId },
      include: REGISTRATION_INCLUDE,
    });
    if (!reg || !reg.pendingConfirmation) return;

    const game = await this.prisma.game.findUnique({ where: { id: reg.gameId } });
    if (!game || (game.status !== 'registration_open' && game.status !== 'in_progress')) {
      await this.prisma.gameRegistration.update({
        where: { id: regId },
        data: { pendingConfirmation: false, confirmationDeadline: null },
      });
      return;
    }

    // Antes del corte los invitados no son elegibles para tomar un cupo: la
    // promoción en cascada debe saltarlos y subir al siguiente miembro (o a
    // nadie), igual que autoPromoteIfNeeded.
    const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);

    // Demotion and next-promote in a single serializable transaction
    const result = await withGameLock(this.prisma, reg.gameId, async (tx) => {

      const freshReg = await tx.gameRegistration.findUnique({
        where: { id: regId },
        select: { pendingConfirmation: true },
      });
      if (!freshReg?.pendingConfirmation) return null;

      // Compute returnPos inside transaction
      const currentMaxResult = await tx.gameRegistration.aggregate({
        where: { gameId: reg.gameId, isWaitingList: true },
        _max: { position: true },
      });
      const maxPos = currentMaxResult._max.position ?? 0;
      const returnPos = reg.originalWaitPosition != null
        ? Math.min(reg.originalWaitPosition, maxPos + 1)
        : maxPos + 1;

      await tx.gameRegistration.updateMany({
        where: { gameId: reg.gameId, isWaitingList: true, position: { gte: returnPos } },
        data: { position: { increment: 1 } },
      });

      await tx.gameRegistration.update({
        where: { id: regId },
        data: {
          isWaitingList: true,
          position: returnPos,
          pendingConfirmation: false,
          confirmationDeadline: null,
          originalWaitPosition: null,
          fromWaitList: false,
          confirmationDeclined: true,
        },
      });

      // Find and promote next waiter within the same transaction. Before the
      // cutoff, guests are skipped (members have priority for freed spots).
      const nextInWait = await tx.gameRegistration.findFirst({
        where: {
          gameId: reg.gameId,
          isWaitingList: true,
          confirmationDeclined: false,
          id: { not: regId },
          ...(beforeCutoff ? { isGuest: false } : {}),
        },
        orderBy: { position: 'asc' },
        include: REGISTRATION_INCLUDE,
      });

      if (nextInWait) {
        const nextOriginalPos = nextInWait.position;
        // Esta promoción ocurre porque el candidato anterior dejó vencer su
        // ventana: es la continuación de la misma "línea" que arrancó cuando se
        // liberó el cupo. Las continuaciones reciben la ventana corta; solo la
        // primera promoción de un cupo recién liberado (autoPromoteIfNeeded)
        // recibe CONFIRMATION_TIMEOUT_MS (15 min).
        const nextDeadline = new Date(Date.now() + NEXT_CONFIRM_TIMEOUT_MS);

        const maxMainPos = await tx.gameRegistration.aggregate({
          where: { gameId: reg.gameId, isWaitingList: false },
          _max: { position: true },
        });

        await tx.gameRegistration.update({
          where: { id: nextInWait.id },
          data: {
            isWaitingList: false,
            position: (maxMainPos._max.position ?? 0) + 1,
            fromWaitList: true,
            pendingConfirmation: true,
            confirmationDeadline: nextDeadline,
            originalWaitPosition: nextOriginalPos,
          },
        });

        return { returnPos, nextInWait, nextDeadline, nextOriginalPos };
      }

      return { returnPos, nextInWait: null, nextDeadline: null, nextOriginalPos: null };
    });

    if (!result) return;

    await this.audit.log({
      gameId: reg.gameId,
      actorId: null,
      targetUserId: reg.userId ?? undefined,
      action: 'confirmation_expired',
      details: { returnedToPosition: result.returnPos },
    });

    const name = displayName(reg);
    const updated = await this.query.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: updated });

    this.logger.log(
      `[CONFIRM_TIMEOUT] game=${reg.gameId} | reg=${regId} | player=${name} | isGuest=${reg.isGuest} | returnedToPos=${result.returnPos}`,
    );

    this.notifier.announceConfirmationExpired({
      playerName: name,
      returnedToPosition: result.returnPos,
      game: updated,
    });

    if (!result.nextInWait) {
      this.logger.log(`[CONFIRM_TIMEOUT] game=${reg.gameId} | no eligible waiter -> spot left free`);
      this.notifier.announceWaitlistExhausted();
      return;
    }

    await this.audit.log({
      gameId: reg.gameId,
      actorId: null,
      targetUserId: result.nextInWait.userId ?? undefined,
      action: 'confirmation_requested',
      details: { deadline: result.nextDeadline!.toISOString() },
    });

    const nextName = displayName(result.nextInWait);
    const finalUpdated = await this.query.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: finalUpdated });

    this.logger.log(
      `[CONFIRM_TIMEOUT] game=${reg.gameId} | cascade promoted=${nextName} | isGuest=${result.nextInWait.isGuest} | fromWaitPos=${result.nextOriginalPos} | confirmWindow=5min`,
    );

    this.notifier.announcePlayersAutoPromoted({
      promoted: [{ playerName: nextName, target: toNotifiableTarget(result.nextInWait) }],
      confirmWindowMinutes: NEXT_CONFIRM_TIMEOUT_MS / 60_000,
      game: finalUpdated,
    });
  }
}
