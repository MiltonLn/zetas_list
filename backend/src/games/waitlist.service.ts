import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { GameQueryService } from './game-query.service';
import { GameNotifier } from './events/game-notifier.service';
import { toNotifiableTarget } from './events/notifiable-target';
import { Tx, withGameLock } from './transaction.util';
import {
  GameFullException,
  NoOneInWaitListException,
  NotRegisteredException,
} from './exceptions';
import {
  displayName,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
  CONFIRMATION_TIMEOUT_MS,
  NEXT_CONFIRM_TIMEOUT_MS,
} from './games.utils';

/**
 * Owns movement between the main list and the waiting list: manual promote and
 * demote, and the automatic promotion that fills spots as they free up.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private query: GameQueryService,
    private notifier: GameNotifier,
  ) {}

  async retryFromWaitingList(gameId: string, userId: string) {
    const result = await withGameLock(this.prisma, gameId, async (tx) => {

      const reg = await tx.gameRegistration.findFirst({
        where: { gameId, userId, isWaitingList: true, confirmationDeclined: true },
      });
      if (!reg) return { found: false, promoted: false, regId: null as string | null };

      await tx.gameRegistration.update({
        where: { id: reg.id },
        data: { confirmationDeclined: false },
      });

      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (!game) return { found: true, promoted: false, regId: reg.id };

      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });

      if (mainCount < game.maxMainSpots) {
        const maxPos = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList: false },
          _max: { position: true },
        });

        await tx.gameRegistration.update({
          where: { id: reg.id },
          data: {
            isWaitingList: false,
            position: (maxPos._max.position ?? 0) + 1,
            fromWaitList: true,
          },
        });

        return { found: true, promoted: true, regId: reg.id };
      }

      return { found: true, promoted: false, regId: reg.id };
    });

    if (!result.found) return { promoted: false, game: null };

    if (result.promoted) {
      await this.audit.log({
        gameId,
        actorId: userId,
        targetUserId: userId,
        action: 'player_promoted',
        details: { source: 'retry_from_waiting_list' },
      });
    }

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return { promoted: result.promoted, game: updated };
  }

  async promote(gameId: string, regId: string, actorId: string | null, options?: { silent?: boolean }) {
    const promoted = await withGameLock(this.prisma, gameId, (tx) =>
      this.promoteInTransaction(tx, gameId, regId),
    );

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: promoted.userId ?? undefined,
      action: 'player_promoted',
      details: { newPosition: promoted.position },
    });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    if (!options?.silent) {
      this.notifier.announcePlayerPromoted({
        playerName: displayName(promoted),
        byAdmin: !!actorId,
        game: updated,
      });
    }

    return updated;
  }

  async promoteNext(gameId: string, actorId: string) {
    const promoted = await withGameLock(this.prisma, gameId, (tx) =>
      this.promoteInTransaction(tx, gameId),
    );

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: promoted.userId ?? undefined,
      action: 'player_promoted',
      details: { newPosition: promoted.position },
    });
    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    const promotedName = displayName(promoted);
    return { updated, promotedName };
  }

  private async promoteInTransaction(tx: Tx, gameId: string, regId?: string) {
    let registrationId = regId;
    if (registrationId) {
      const registration = await tx.gameRegistration.findFirst({
        where: { id: registrationId, gameId, isWaitingList: true },
      });
      if (!registration) throw new NotRegisteredException();
    }

    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const mainCount = await tx.gameRegistration.count({
      where: { gameId, isWaitingList: false },
    });
    if (mainCount >= game.maxMainSpots) {
      throw new GameFullException();
    }

    if (!registrationId) {
      const first = await tx.gameRegistration.findFirst({
        where: { gameId, isWaitingList: true },
        orderBy: { position: 'asc' },
        include: REGISTRATION_INCLUDE,
      });
      if (!first) throw new NoOneInWaitListException();
      registrationId = first.id;
    }

    const maxPos = await tx.gameRegistration.aggregate({
      where: { gameId, isWaitingList: false },
      _max: { position: true },
    });
    return tx.gameRegistration.update({
      where: { id: registrationId },
      data: {
        isWaitingList: false,
        position: (maxPos._max.position ?? 0) + 1,
        fromWaitList: true,
      },
      include: REGISTRATION_INCLUDE,
    });
  }

  async demote(gameId: string, regId: string, actorId: string) {
    const demoted = await withGameLock(this.prisma, gameId, async (tx) => {

      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, isWaitingList: false },
      });
      if (!reg) throw new NotRegisteredException();

      await tx.gameRegistration.updateMany({
        where: { gameId, isWaitingList: false, position: { gt: reg.position } },
        data: { position: { decrement: 1 } },
      });

      const maxPos = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: true },
        _max: { position: true },
      });

      return tx.gameRegistration.update({
        where: { id: regId },
        data: {
          isWaitingList: true,
          position: (maxPos._max.position ?? 0) + 1,
          fromWaitList: false,
        },
        include: REGISTRATION_INCLUDE,
      });
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: demoted.userId ?? undefined,
      action: 'player_demoted',
      details: { newPosition: demoted.position },
    });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    this.notifier.announcePlayerDemoted({
      playerName: displayName(demoted),
      byAdmin: actorId !== demoted.userId,
      position: demoted.position,
      game: updated,
    });

    return updated;
  }

  /**
   * Returns an expired promotion to its original wait-list position and
   * advances one eligible candidate using the short continuation window.
   */
  async continueAfterConfirmationTimeout(
    gameId: string,
    regId: string,
    originalWaitPosition: number | null,
  ) {
    return withGameLock(this.prisma, gameId, async (tx) => {
      const expired = await tx.gameRegistration.findUnique({
        where: { id: regId },
        select: {
          pendingConfirmation: true,
        },
      });
      if (!expired?.pendingConfirmation) return null;

      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (
        !game ||
        (game.status !== 'registration_open' && game.status !== 'in_progress')
      ) {
        await tx.gameRegistration.update({
          where: { id: regId },
          data: { pendingConfirmation: false, confirmationDeadline: null },
        });
        return null;
      }
      const beforeCutoff = isBeforeCutoff(
        game.guestCutoffTime,
        game.gameDate,
      );

      const currentMax = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: true },
        _max: { position: true },
      });
      const maxPosition = currentMax._max.position ?? 0;
      const returnPosition =
        originalWaitPosition != null
          ? Math.min(originalWaitPosition, maxPosition + 1)
          : maxPosition + 1;

      await tx.gameRegistration.updateMany({
        where: {
          gameId,
          isWaitingList: true,
          position: { gte: returnPosition },
        },
        data: { position: { increment: 1 } },
      });
      await tx.gameRegistration.update({
        where: { id: regId },
        data: {
          isWaitingList: true,
          position: returnPosition,
          pendingConfirmation: false,
          confirmationDeadline: null,
          originalWaitPosition: null,
          fromWaitList: false,
          confirmationDeclined: true,
        },
      });

      const nextInWait = await tx.gameRegistration.findFirst({
        where: {
          gameId,
          isWaitingList: true,
          confirmationDeclined: false,
          id: { not: regId },
          ...(beforeCutoff ? { isGuest: false } : {}),
        },
        orderBy: { position: 'asc' },
        include: REGISTRATION_INCLUDE,
      });
      if (!nextInWait) {
        return {
          returnPosition,
          nextInWait: null,
          nextDeadline: null,
          nextOriginalPosition: null,
        };
      }

      const nextOriginalPosition = nextInWait.position;
      const nextDeadline = new Date(Date.now() + NEXT_CONFIRM_TIMEOUT_MS);
      const maxMainPosition = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: false },
        _max: { position: true },
      });
      await tx.gameRegistration.update({
        where: { id: nextInWait.id },
        data: {
          isWaitingList: false,
          position: (maxMainPosition._max.position ?? 0) + 1,
          fromWaitList: true,
          pendingConfirmation: true,
          confirmationDeadline: nextDeadline,
          originalWaitPosition: nextOriginalPosition,
        },
      });
      return {
        returnPosition,
        nextInWait,
        nextDeadline,
        nextOriginalPosition,
      };
    });
  }

  async autoPromoteIfNeeded(gameId: string, options?: { skipMainListFullCheck?: boolean }) {
    // Promote all eligible waiters that fit in the available spots atomically.
    // Using a single serializable transaction guarantees no two concurrent
    // calls double-fill the same spots (the FOR UPDATE row-lock on the game
    // row serializes concurrent calls).
    const result = await withGameLock(this.prisma, gameId, async (tx) => {
      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (!game || (game.status !== 'registration_open' && game.status !== 'in_progress')) {
        return { promotedList: [], beforeCutoff: false };
      }
      if (!options?.skipMainListFullCheck && !game.mainListHasBeenFull) {
        return { promotedList: [], beforeCutoff: false };
      }
      const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);

      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      const spotsAvailable = game.maxMainSpots - mainCount;
      if (spotsAvailable <= 0) {
        this.logger.log(`[AUTO_PROMOTE] game=${gameId} | mainCount=${mainCount}/${game.maxMainSpots} | FULL, no promotion`);
        return { promotedList: [], beforeCutoff };
      }

      const eligibleWaiters = await tx.gameRegistration.findMany({
        where: {
          gameId,
          isWaitingList: true,
          confirmationDeclined: false,
          ...(beforeCutoff ? { isGuest: false } : {}),
        },
        orderBy: { position: 'asc' },
        take: spotsAvailable,
        include: REGISTRATION_INCLUDE,
      });

      if (eligibleWaiters.length === 0) {
        this.logger.log(`[AUTO_PROMOTE] game=${gameId} | mainCount=${mainCount}/${game.maxMainSpots} | beforeCutoff=${beforeCutoff} | No eligible waiters found`);
        return { promotedList: [], beforeCutoff };
      }

      const maxPosResult = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: false },
        _max: { position: true },
      });
      let nextPos = (maxPosResult._max.position ?? 0) + 1;

      const confirmDeadline = new Date(Date.now() + CONFIRMATION_TIMEOUT_MS);
      const results: Array<{ reg: (typeof eligibleWaiters)[0]; originalPos: number; confirmDeadline: Date }> = [];

      for (const waiter of eligibleWaiters) {
        const originalPos = waiter.position as number;
        const updatedReg = await tx.gameRegistration.update({
          where: { id: waiter.id },
          data: {
            isWaitingList: false,
            position: nextPos++,
            fromWaitList: true,
            pendingConfirmation: true,
            confirmationDeadline: confirmDeadline,
            originalWaitPosition: originalPos,
          },
          include: REGISTRATION_INCLUDE,
        });
        results.push({ reg: updatedReg, originalPos, confirmDeadline });
      }

      return { promotedList: results, beforeCutoff };
    });
    const { promotedList, beforeCutoff } = result;

    if (promotedList.length === 0) return;

    // Audit log for each promoted person
    for (const p of promotedList) {
      await this.audit.log({
        gameId,
        actorId: null,
        targetUserId: p.reg.userId ?? undefined,
        action: 'confirmation_requested',
        details: { deadline: p.confirmDeadline.toISOString(), originalWaitPosition: p.originalPos },
      });
    }

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    for (const p of promotedList) {
      this.logger.log(
        `[AUTO_PROMOTE] game=${gameId} | promoted=${displayName(p.reg)} | isGuest=${p.reg.isGuest} | fromWaitPos=${p.originalPos} | beforeCutoff=${beforeCutoff} | confirmWindow=15min`,
      );
    }

    this.notifier.announcePlayersAutoPromoted({
      promoted: promotedList.map((p) => ({
        playerName: displayName(p.reg),
        target: toNotifiableTarget(p.reg),
      })),
      confirmWindowMinutes: CONFIRMATION_TIMEOUT_MS / 60_000,
      game: updated,
    });
  }
}
