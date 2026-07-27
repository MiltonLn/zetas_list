import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_MANAGERS } from '../common/constants/roles';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { FinancesService } from '../finances/finances.service';
import { GameNotifier } from './events/game-notifier.service';
import { GameQueryService } from './game-query.service';
import { withGameLock } from './transaction.util';
import { ConfirmationService } from './confirmation.service';
import { WaitlistService } from './waitlist.service';
import { GameLifecycleService } from './game-lifecycle.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReorderDto } from './dto/reorder.dto';
import {
  AlreadyRegisteredException,
  GameNotFoundException,
  GameNotOpenException,
  InactiveUserException,
  MustBeRegisteredFirstException,
  ProxyLimitExceededException,
  NotRegisteredException,
  CannotRemoveOtherException,
  UserHasUnpaidFinesException,
} from './exceptions';
import {
  displayName,
  userDisplayName,
  buildCounts,
  buildGameLink,
  shouldGoToWaitingList,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
} from './games.utils';

export { displayName, MODALIDAD_LABEL } from './games.utils';

/** The current game plus its registrations, as returned by findActiveGame(). */
export type ActiveGame = NonNullable<Awaited<ReturnType<GameQueryService['findActiveGame']>>>;

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    private notifier: GameNotifier,
    private finances: FinancesService,
    private query: GameQueryService,
    private confirmation: ConfirmationService,
    private waitlist: WaitlistService,
    private lifecycle: GameLifecycleService,
  ) {}

  private readonly logger = new Logger(GamesService.name);

  buildCounts(game: { maxMainSpots: number; registrations: Array<{ isWaitingList: boolean }> }): string {
    return buildCounts(game);
  }

  buildGameLink(gameId: string): string {
    return buildGameLink(gameId);
  }

  // ─── FACADE ───────────────────────────────────────────────────────────────
  //
  // GamesService stays the single entry point for controllers and the WhatsApp
  // handler; the behaviour now lives in the focused services below.

  findAll(...args: Parameters<GameQueryService['findAll']>) {
    return this.query.findAll(...args);
  }

  findOne(id: string) {
    return this.query.findOne(id);
  }

  findActiveGame() {
    return this.query.findActiveGame();
  }

  confirmRegistration(...args: Parameters<ConfirmationService['confirmRegistration']>) {
    return this.confirmation.confirmRegistration(...args);
  }

  confirmRegistrationById(...args: Parameters<ConfirmationService['confirmRegistrationById']>) {
    return this.confirmation.confirmRegistrationById(...args);
  }

  handleConfirmationTimeout(regId: string) {
    return this.confirmation.handleConfirmationTimeout(regId);
  }

  retryFromWaitingList(gameId: string, userId: string) {
    return this.waitlist.retryFromWaitingList(gameId, userId);
  }

  promote(...args: Parameters<WaitlistService['promote']>) {
    return this.waitlist.promote(...args);
  }

  promoteNext(gameId: string, actorId: string) {
    return this.waitlist.promoteNext(gameId, actorId);
  }

  demote(gameId: string, regId: string, actorId: string) {
    return this.waitlist.demote(gameId, regId, actorId);
  }

  autoPromoteIfNeeded(...args: Parameters<WaitlistService['autoPromoteIfNeeded']>) {
    return this.waitlist.autoPromoteIfNeeded(...args);
  }

  create(dto: CreateGameDto, actorId: string) {
    return this.lifecycle.create(dto, actorId);
  }

  openRegistration(gameId: string, actorId?: string) {
    return this.lifecycle.openRegistration(gameId, actorId);
  }

  cancel(gameId: string, dto: CancelGameDto, actorId: string) {
    return this.lifecycle.cancel(gameId, dto, actorId);
  }

  complete(...args: Parameters<GameLifecycleService['complete']>) {
    return this.lifecycle.complete(...args);
  }

  previewReport(gameId: string) {
    return this.lifecycle.previewReport(gameId);
  }

  setFineExempt(...args: Parameters<GameLifecycleService['setFineExempt']>) {
    return this.lifecycle.setFineExempt(...args);
  }

  getStoredReport(gameId: string) {
    return this.lifecycle.getStoredReport(gameId);
  }

  generateReport(game: Parameters<GameLifecycleService['generateReport']>[0]) {
    return this.lifecycle.generateReport(game);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  // ─── REGISTRATION ─────────────────────────────────────────────────────────

  async register(gameId: string, userId: string, registeredById: string, options?: { silent?: boolean }) {
    const registration = await this.prisma.$transaction(
      async (tx) => {
        const game = await tx.$queryRaw<Array<{ id: string; status: string; maxMainSpots: number; mainListHasBeenFull: boolean; guestCutoffTime: string; maxProxyRegistrations: number; gameDate: Date }>>`
          SELECT id, status, "maxMainSpots", "mainListHasBeenFull", "guestCutoffTime", "maxProxyRegistrations", "gameDate"
          FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (!game.length) throw new GameNotFoundException();

        const g = game[0];
        if (g.status !== 'registration_open' && g.status !== 'in_progress') {
          throw new GameNotOpenException();
        }

        const existing = await tx.gameRegistration.findFirst({
          where: { gameId, userId },
        });
        if (existing) {
          if (existing.confirmationDeclined && existing.isWaitingList) {
            await tx.gameRegistration.update({
              where: { id: existing.id },
              data: { confirmationDeclined: false },
            });

            const mainCount = await tx.gameRegistration.count({
              where: { gameId, isWaitingList: false },
            });

            if (mainCount < g.maxMainSpots) {
              const maxPos = await tx.gameRegistration.aggregate({
                where: { gameId, isWaitingList: false },
                _max: { position: true },
              });
              return tx.gameRegistration.update({
                where: { id: existing.id },
                data: { isWaitingList: false, position: (maxPos._max.position ?? 0) + 1 },
                include: REGISTRATION_INCLUDE,
              });
            }

            return tx.gameRegistration.update({
              where: { id: existing.id },
              data: { confirmationDeclined: false },
              include: REGISTRATION_INCLUDE,
            });
          }
          throw new AlreadyRegisteredException();
        }

        const isSelfRegister = userId === registeredById;

        const targetUser = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
        if (targetUser && targetUser.status !== 'active') {
          throw new InactiveUserException();
        }

        const hasDebt = await this.finances.hasUnpaidFines(userId);
        if (hasDebt) {
          throw new UserHasUnpaidFinesException();
        }

        if (!isSelfRegister) {
          const actor = await tx.user.findUnique({ where: { id: registeredById }, select: { role: true } });

          if (actor?.role !== 'admin') {
            const actorRegistered = await tx.gameRegistration.findFirst({
              where: { gameId, userId: registeredById },
            });
            if (!actorRegistered) {
              throw new MustBeRegisteredFirstException();
            }
          }

          const proxyCount = await tx.gameRegistration.count({
            where: { gameId, registeredById, userId: { not: registeredById } },
          });
          if (actor?.role !== 'admin' && proxyCount >= g.maxProxyRegistrations) {
            throw new ProxyLimitExceededException(g.maxProxyRegistrations);
          }
        }

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });

        const beforeCutoff = isBeforeCutoff(g.guestCutoffTime, g.gameDate);
        const eligibleWaitCount = await tx.gameRegistration.count({
          where: {
            gameId,
            isWaitingList: true,
            confirmationDeclined: false,
            ...(beforeCutoff ? { isGuest: false } : {}),
          },
        });

        const waitList = shouldGoToWaitingList(mainCount, eligibleWaitCount, g.maxMainSpots, g.mainListHasBeenFull, false, false);

        this.logger.log(
          `[REGISTER] user=${userId} | mainCount=${mainCount}/${g.maxMainSpots} | eligibleWait=${eligibleWaitCount} | beforeCutoff=${beforeCutoff} | mainListHasBeenFull=${g.mainListHasBeenFull} | -> waitList=${waitList}`,
        );

        if (!waitList && mainCount + 1 >= g.maxMainSpots && !g.mainListHasBeenFull) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }
        if (waitList && !g.mainListHasBeenFull && mainCount >= g.maxMainSpots) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }

        const maxPositionResult = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList: waitList },
          _max: { position: true },
        });
        const nextPosition = (maxPositionResult._max.position ?? 0) + 1;

        // No confirmation flow for proxy registrations: anyone registered (self
        // or by another member) is registered directly. The only confirmation
        // flow lives in auto-promotion from the waiting list.
        return tx.gameRegistration.create({
          data: {
            gameId,
            userId,
            position: nextPosition,
            isWaitingList: waitList,
            registeredAt: new Date(),
            registeredById,
          },
          include: REGISTRATION_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const auditAction = registration.registeredById !== registration.userId ? 'proxy_registered' : 'player_registered';
    await this.audit.log({
      gameId,
      actorId: registeredById,
      targetUserId: userId,
      action: auditAction,
      details: { position: registration.position, isWaitingList: registration.isWaitingList, pendingConfirmation: registration.pendingConfirmation },
    });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    if (!options?.silent) {
      const onBehalf = registration.registeredById !== registration.userId;
      this.notifier.announcePlayerRegistered({
        playerName: registration.user ? userDisplayName(registration.user) : 'Alguien',
        registeredByName:
          onBehalf && registration.registeredBy
            ? userDisplayName(registration.registeredBy)
            : undefined,
        isWaitingList: registration.isWaitingList,
        position: registration.position,
        game: updated,
      });
    }

    return registration;
  }

  async registerGuest(gameId: string, guestName: string, invitedById: string, options?: { silent?: boolean }) {
    const trimmedName = guestName?.trim();
    if (!trimmedName) {
      throw new GameNotOpenException();
    }

    const inviterHasDebt = await this.finances.hasUnpaidFines(invitedById);
    if (inviterHasDebt) {
      throw new UserHasUnpaidFinesException();
    }

    const registration = await this.prisma.$transaction(
      async (tx) => {
        const game = await tx.$queryRaw<Array<{ id: string; status: string; maxMainSpots: number; mainListHasBeenFull: boolean; guestCutoffTime: string; gameDate: Date }>>`
          SELECT id, status, "maxMainSpots", "mainListHasBeenFull", "guestCutoffTime", "gameDate"
          FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (!game.length) throw new GameNotFoundException();

        const g = game[0];
        if (g.status !== 'registration_open' && g.status !== 'in_progress') {
          throw new GameNotOpenException();
        }

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });

        const beforeCutoff = isBeforeCutoff(g.guestCutoffTime, g.gameDate);

        const eligibleWaitCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: true, confirmationDeclined: false },
        });

        const waitList = shouldGoToWaitingList(mainCount, eligibleWaitCount, g.maxMainSpots, g.mainListHasBeenFull, true, beforeCutoff);

        this.logger.log(
          `[REGISTER_GUEST] guest="${trimmedName}" | mainCount=${mainCount}/${g.maxMainSpots} | eligibleWait=${eligibleWaitCount} | beforeCutoff=${beforeCutoff} | mainListHasBeenFull=${g.mainListHasBeenFull} | -> waitList=${waitList}`,
        );

        if (!waitList && mainCount + 1 >= g.maxMainSpots && !g.mainListHasBeenFull) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }

        const maxPositionResult = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList: waitList },
          _max: { position: true },
        });
        const nextPosition = (maxPositionResult._max.position ?? 0) + 1;

        return tx.gameRegistration.create({
          data: {
            gameId,
            userId: null,
            position: nextPosition,
            isWaitingList: waitList,
            registeredAt: new Date(),
            registeredById: invitedById,
            isGuest: true,
            guestName: trimmedName,
          },
          include: REGISTRATION_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId,
      actorId: invitedById,
      action: 'guest_registered',
      details: { guestName: trimmedName, position: registration.position, isWaitingList: registration.isWaitingList },
    });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    if (!options?.silent) {
      this.notifier.announceGuestRegistered({
        guestName,
        inviterName: registration.registeredBy
          ? userDisplayName(registration.registeredBy)
          : undefined,
        isWaitingList: registration.isWaitingList,
        position: registration.position,
        game: updated,
      });
    }

    return registration;
  }

  async removeRegistration(gameId: string, userId: string, actorId: string, actorRole: Role, options?: { silent?: boolean; regId?: string }) {
    const { reg, orphanedGuests, wasMainList, userName } = await withGameLock(this.prisma, gameId, async (tx) => {

      const foundReg = options?.regId
        ? await tx.gameRegistration.findFirst({
            where: { id: options.regId, gameId },
            include: { user: { select: { name: true } }, registeredBy: { select: { name: true } } },
          })
        : await tx.gameRegistration.findFirst({
            where: { gameId, userId },
            include: { user: { select: { name: true } }, registeredBy: { select: { name: true } } },
          });
      if (!foundReg) throw new NotRegisteredException();

      const regOwnerId = foundReg.userId ?? foundReg.registeredById;
      if (!GAME_MANAGERS.includes(actorRole) && actorId !== regOwnerId) {
        throw new CannotRemoveOtherException();
      }

      const orphans = foundReg.userId
        ? await tx.gameRegistration.findMany({
            where: { gameId, isGuest: true, registeredById: foundReg.userId },
            select: { id: true, guestName: true, position: true, isWaitingList: true },
          })
        : [];

      await tx.gameRegistration.delete({ where: { id: foundReg.id } });

      await tx.gameRegistration.updateMany({
        where: { gameId, isWaitingList: foundReg.isWaitingList, position: { gt: foundReg.position } },
        data: { position: { decrement: 1 } },
      });

      if (orphans.length > 0) {
        await tx.gameRegistration.deleteMany({
          where: { id: { in: orphans.map((g) => g.id) } },
        });
        const sorted = [...orphans].sort((a, b) => b.position - a.position);
        for (const guest of sorted) {
          await tx.gameRegistration.updateMany({
            where: { gameId, isWaitingList: guest.isWaitingList, position: { gt: guest.position } },
            data: { position: { decrement: 1 } },
          });
        }
      }

      return {
        reg: foundReg,
        orphanedGuests: orphans,
        wasMainList: !foundReg.isWaitingList,
        userName: displayName(foundReg),
      };
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: reg.userId ?? undefined,
      action: 'player_removed',
      details: {
        position: reg.position,
        wasWaiting: reg.isWaitingList,
        guestName: reg.guestName,
        removedGuests: orphanedGuests.map((g) => g.guestName),
      },
    });

    this.logger.log(
      `[REMOVE] game=${gameId} | player=${userName} | wasWaiting=${reg.isWaitingList} | byAdmin=${actorId !== (reg.userId ?? reg.registeredById)} | removedGuests=${orphanedGuests.length}`,
    );

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    if (!options?.silent) {
      // Awaited so the removal notice lands before any auto-promotion notice
      // that follows; otherwise "X fue promovido" reads before "Y salió".
      await this.notifier.announcePlayerRemoved({
        playerName: userName,
        removedBySelf: actorId === (reg.userId ?? reg.registeredById),
        removedGuestNames: orphanedGuests.map((g) => g.guestName || 'Invitado'),
        game: updated,
      });
    }

    if (wasMainList) {
      await this.waitlist.autoPromoteIfNeeded(gameId);
    }
    if (orphanedGuests.some((g) => !g.isWaitingList)) {
      await this.waitlist.autoPromoteIfNeeded(gameId);
    }

    return updated;
  }

  async updateRegistration(regId: string, dto: UpdateRegistrationDto, actorId: string, gameId: string) {
    const reg = await this.prisma.gameRegistration.findFirst({ where: { id: regId, gameId } });
    if (!reg) throw new NotRegisteredException();

    const attendanceWasAutomatic = dto.paid === true && dto.attended === undefined && !reg.attended;
    const paymentWasAutomatic = dto.attended === false && dto.paid === undefined && reg.paid;
    let updateData: UpdateRegistrationDto = dto;
    if (dto.paid === true) {
      updateData = { ...dto, attended: true };
    } else if (dto.attended === false) {
      updateData = { ...dto, paid: false };
    }

    const updated = await this.prisma.gameRegistration.update({
      where: { id: regId, gameId },
      data: updateData,
      include: REGISTRATION_INCLUDE,
    });

    if (attendanceWasAutomatic) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'attendance_toggled', details: { attended: true, automatic: true } });
    } else if (dto.attended !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'attendance_toggled', details: { attended: updateData.attended } });
    }
    if (paymentWasAutomatic) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'payment_toggled', details: { paid: false, automatic: true } });
    } else if (dto.paid !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'payment_toggled', details: { paid: updateData.paid } });
    }
    if (dto.note !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'note_updated', details: { note: dto.note } });
    }

    const fullGame = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: fullGame });
    return updated;
  }

  // ─── REORDER / CANCEL / COMPLETE ─────────────────────────────────────────

  async reorder(gameId: string, dto: ReorderDto, actorId: string) {
    await withGameLock(this.prisma, gameId, async (tx) => {

      for (let i = 0; i < dto.mainList.length; i++) {
        await tx.gameRegistration.updateMany({
          where: { id: dto.mainList[i], gameId },
          data: { position: i + 1, isWaitingList: false },
        });
      }
      for (let i = 0; i < dto.waitList.length; i++) {
        await tx.gameRegistration.updateMany({
          where: { id: dto.waitList[i], gameId },
          data: { position: i + 1, isWaitingList: true },
        });
      }
    });

    await this.audit.log({
      gameId,
      actorId,
      action: 'player_reordered',
      details: { mainListCount: dto.mainList.length, waitListCount: dto.waitList.length },
    });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  // ─── UTILITY ──────────────────────────────────────────────────────────────

  async getAvailableMembers(gameId: string) {
    const registeredUserIds = await this.prisma.gameRegistration.findMany({
      where: { gameId, userId: { not: null } },
      select: { userId: true },
    });
    const excludeIds = registeredUserIds.map((r) => r.userId).filter(Boolean) as string[];

    return this.prisma.user.findMany({
      where: { status: 'active', id: { notIn: excludeIds } },
      select: { id: true, name: true, phone: true, username: true },
      orderBy: { name: 'asc' },
    });
  }

  shouldGoToWaitingList(
    mainCount: number,
    waitCount: number,
    maxMainSpots: number,
    mainListHasBeenFull: boolean,
    isGuest: boolean,
    beforeCutoff: boolean,
  ): boolean {
    return shouldGoToWaitingList(mainCount, waitCount, maxMainSpots, mainListHasBeenFull, isGuest, beforeCutoff);
  }

  isBeforeCutoff(cutoffTime: string, gameDate?: Date | string): boolean {
    return isBeforeCutoff(cutoffTime, gameDate);
  }

  formatListForWhatsapp(game: ActiveGame) {
    const mainList = game.registrations.filter((r) => !r.isWaitingList);
    const waitList = game.registrations.filter((r) => r.isWaitingList);
    const spotsLeft = Math.max(0, game.maxMainSpots - mainList.length);

    const lines: string[] = [
      `📋 *${game.title}*`,
      `📍 Cupos: ${mainList.length}/${game.maxMainSpots} (${spotsLeft} disponibles)`,
      '',
    ];

    if (mainList.length > 0) {
      lines.push('*Lista Principal:*');
      mainList.forEach((r, i) => {
        const name = r.isGuest
          ? `${r.guestName || 'Invitado'} 👤 _(inv. de ${r.registeredBy ? userDisplayName(r.registeredBy) : '?'})_`
          : displayName(r);
        const pendingTag = r.pendingConfirmation ? ' ⏳' : '';
        lines.push(`${i + 1}. ${name}${pendingTag}`);
      });
    }

    if (waitList.length > 0) {
      lines.push('', `*Lista de Espera (${waitList.length}):*`);
      waitList.forEach((r, i) => {
        const name = r.isGuest
          ? `${r.guestName || 'Invitado'} 👤 _(inv. de ${r.registeredBy ? userDisplayName(r.registeredBy) : '?'})_`
          : displayName(r);
        lines.push(`${i + 1}. ${name}`);
      });
    }

    if (mainList.length === 0) {
      lines.push('_Sin anotados aún_');
    }

    lines.push(buildGameLink(game.id));

    return lines.join('\n');
  }
}
