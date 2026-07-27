import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role, GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_MANAGERS } from '../common/constants/roles';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { FinancesService } from '../finances/finances.service';
import { GameNotifier } from './events/game-notifier.service';
import { toNotifiableTarget } from './events/notifiable-target';
import { GameQueryService } from './game-query.service';
import { withGameLock } from './transaction.util';
import { ConfirmationService } from './confirmation.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReorderDto } from './dto/reorder.dto';
import {
  AlreadyRegisteredException,
  GameNotFoundException,
  GameNotOpenException,
  GameFullException,
  GameAlreadyCompletedException,
  GameCancelledException,
  DuplicateGameException,
  InactiveUserException,
  MustBeRegisteredFirstException,
  ProxyLimitExceededException,
  NotRegisteredException,
  CannotRemoveOtherException,
  NoOneInWaitListException,
  UserHasUnpaidFinesException,
} from './exceptions';
import {
  displayName,
  userDisplayName,
  buildCounts,
  buildTitle,
  buildGameLink,
  shouldGoToWaitingList,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
  DEFAULT_SPOTS,
  CONFIRMATION_TIMEOUT_MS,
  DEFAULT_PRICE_PER_PLAYER,
  DEFAULT_VIGILANTE,
  DEFAULT_GUEST_CUTOFF,
  DEFAULT_MAX_PROXY,
  DEFAULT_REGISTRATION_OPEN_TIME,
} from './games.utils';

export { displayName, MODALIDAD_LABEL } from './games.utils';

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

  confirmRegistration(...args: Parameters<ConfirmationService['confirmRegistration']>) {
    return this.confirmation.confirmRegistration(...args);
  }

  confirmRegistrationById(...args: Parameters<ConfirmationService['confirmRegistrationById']>) {
    return this.confirmation.confirmRegistrationById(...args);
  }

  handleConfirmationTimeout(regId: string) {
    return this.confirmation.handleConfirmationTimeout(regId);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateGameDto, actorId: string) {
    const gameDate = new Date(dto.gameDate + 'T00:00:00');

    const game = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.game.findFirst({
          where: {
            gameDate,
            status: { notIn: [GameStatus.cancelled, GameStatus.completed] },
          },
        });
        if (existing) {
          throw new DuplicateGameException(dto.gameDate);
        }

        const startTime = dto.startTime ?? '18:50';
        const title = dto.customTitle?.trim() || buildTitle(dto.modalidad, dto.gameDate, startTime);
        const maxMainSpots = dto.maxMainSpots ?? DEFAULT_SPOTS[dto.modalidad];

        const registrationOpenTime = dto.registrationOpenTime ?? DEFAULT_REGISTRATION_OPEN_TIME;
        const registrationOpenAt = new Date(`${dto.gameDate}T${registrationOpenTime}:00-05:00`);

        const now = new Date();
        const initialStatus =
          registrationOpenAt <= now ? GameStatus.registration_open : GameStatus.scheduled;

        return tx.game.create({
          data: {
            title,
            modalidad: dto.modalidad,
            gameDate,
            startTime,
            registrationOpenAt,
            maxMainSpots,
            pricePerPlayer: dto.pricePerPlayer ?? DEFAULT_PRICE_PER_PLAYER,
            vigilante: dto.vigilante ?? DEFAULT_VIGILANTE,
            guestCutoffTime: dto.guestCutoffTime ?? DEFAULT_GUEST_CUTOFF,
            maxProxyRegistrations: dto.maxProxyRegistrations ?? DEFAULT_MAX_PROXY,
            status: initialStatus,
            createdById: actorId,
          },
          include: { createdBy: { select: { id: true, name: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId: game.id,
      actorId,
      action: 'game_created',
      details: { title: game.title, modalidad: dto.modalidad, gameDate: dto.gameDate },
    });

    if (game.status === GameStatus.registration_open) {
      this.notifier.announceRegistrationOpened({ game });
    }

    return game;
  }

  async openRegistration(gameId: string, actorId?: string) {
    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.registration_open },
    });

    await this.audit.log({
      gameId,
      actorId: actorId ?? null,
      action: 'game_status_changed',
      details: { newStatus: 'registration_open' },
    });

    this.events.emit({
      gameId,
      type: 'status_change',
      data: { status: GameStatus.registration_open },
    });

    return updated;
  }

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
      await this.autoPromoteIfNeeded(gameId);
    }
    if (orphanedGuests.some((g) => !g.isWaitingList)) {
      await this.autoPromoteIfNeeded(gameId);
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

  // ─── PROMOTION ────────────────────────────────────────────────────────────

  async promote(gameId: string, regId: string, actorId: string | null, options?: { silent?: boolean }) {
    const promoted = await withGameLock(this.prisma, gameId, async (tx) => {

      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, isWaitingList: true },
      });
      if (!reg) throw new NotRegisteredException();

      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      if (mainCount >= game.maxMainSpots) {
        throw new GameFullException();
      }

      const maxPos = await tx.gameRegistration.aggregate({
        where: { gameId, isWaitingList: false },
        _max: { position: true },
      });

      return tx.gameRegistration.update({
        where: { id: regId },
        data: {
          isWaitingList: false,
          position: (maxPos._max.position ?? 0) + 1,
          fromWaitList: true,
        },
        include: REGISTRATION_INCLUDE,
      });
    });

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
    const firstInWait = await withGameLock(this.prisma, gameId, async (tx) => {

      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      if (mainCount >= game.maxMainSpots) {
        throw new GameFullException();
      }

      const first = await tx.gameRegistration.findFirst({
        where: { gameId, isWaitingList: true },
        orderBy: { position: 'asc' },
        include: REGISTRATION_INCLUDE,
      });
      if (!first) {
        throw new NoOneInWaitListException();
      }
      return first;
    });

    const updated = await this.promote(gameId, firstInWait.id, actorId, { silent: true });
    const promotedName = displayName(firstInWait);
    return { updated, promotedName };
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

  async autoPromoteIfNeeded(gameId: string, options?: { skipMainListFullCheck?: boolean }) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game || (game.status !== 'registration_open' && game.status !== 'in_progress')) return;
    if (!options?.skipMainListFullCheck && !game.mainListHasBeenFull) return;

    const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);

    // Promote all eligible waiters that fit in the available spots atomically.
    // Using a single serializable transaction guarantees no two concurrent
    // calls double-fill the same spots (the FOR UPDATE row-lock on the game
    // row serializes concurrent calls).
    const promotedList = await withGameLock(this.prisma, gameId, async (tx) => {

      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      const spotsAvailable = game.maxMainSpots - mainCount;
      if (spotsAvailable <= 0) {
        this.logger.log(`[AUTO_PROMOTE] game=${gameId} | mainCount=${mainCount}/${game.maxMainSpots} | FULL, no promotion`);
        return [];
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
        return [];
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

      return results;
    });

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

  async cancel(gameId: string, dto: CancelGameDto, actorId: string) {
    const game = await this.query.findOne(gameId);
    if (game.status === GameStatus.completed || game.status === GameStatus.cancelled) {
      throw new GameAlreadyCompletedException();
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.cancelled, cancellationReason: dto.reason },
    });

    await this.audit.log({ gameId, actorId, action: 'game_cancelled', details: { reason: dto.reason } });
    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.cancelled } });

    this.notifier.announceGameCancelled({ gameTitle: game.title, reason: dto.reason });

    return updated;
  }

  async complete(gameId: string, actorId: string, options?: { silent?: boolean }) {
    const game = await this.query.findOne(gameId);

    if (game.status === GameStatus.completed) throw new GameAlreadyCompletedException();
    if (game.status === GameStatus.cancelled) throw new GameCancelledException();

    const report = this.generateReport(game);

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.completed, completionReport: report },
    });

    await this.audit.log({ gameId, actorId, action: 'game_completed', details: {} });
    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.completed } });

    // Auto-create fines for no-shows (main list, not attended, not exempt)
    const fined = game.registrations.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      await this.finances.createGameFines(gameId, fined, game.fineAmountNoShow, actorId);
    }

    // Auto-create debts for non-payers (attended but didn't pay)
    const debts = game.registrations.filter((r) => r.attended && !r.paid);
    if (debts.length > 0) {
      await this.finances.createGameDebts(gameId, debts, game.pricePerPlayer, actorId);
    }

    // Auto-create income entry for net game revenue
    const totalPaid = game.registrations.filter((r) => r.paid).length;
    const recaudado = totalPaid * game.pricePerPlayer;
    const neto = recaudado - (game.vigilante ?? 0);
    if (neto > 0) {
      await this.finances.createGameIncome(gameId, neto, game.gameDate, actorId);
    }

    if (!options?.silent) {
      this.notifier.announceGameCompleted({ report });
    }

    return { game: updated, report };
  }

  // ─── REPORTING ────────────────────────────────────────────────────────────

  async previewReport(gameId: string) {
    const game = await this.query.findOne(gameId);
    const report = this.generateReport(game);
    const fineable = game.registrations
      .filter((r) => !r.attended && !r.isWaitingList)
      .map((r) => ({
        regId: r.id,
        userId: r.userId,
        name: displayName(r),
        fineExempt: r.fineExempt,
      }));
    return { report, fineable };
  }

  async setFineExempt(gameId: string, regId: string, exempt: boolean, actorId: string) {
    const reg = await this.prisma.gameRegistration.findFirst({ where: { id: regId, gameId } });
    if (!reg) throw new NotRegisteredException();

    await this.prisma.gameRegistration.update({ where: { id: regId }, data: { fineExempt: exempt } });
    await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'fine_exemption_toggled', details: { fineExempt: exempt } });

    const updated = await this.query.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async getStoredReport(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { completionReport: true, status: true },
    });
    if (!game) throw new GameNotFoundException();

    if (game.completionReport) return { report: game.completionReport };
    const full = await this.query.findOne(gameId);
    return { report: this.generateReport(full) };
  }

  generateReport(game: Awaited<ReturnType<typeof this.findOne>>) {
    const allRegs = game.registrations;
    const mainList = allRegs.filter((r) => !r.isWaitingList);
    const attended = mainList.filter((r) => r.attended);
    const totalPaid = allRegs.filter((r) => r.paid).length;
    const recaudado = totalPaid * game.pricePerPlayer;

    const attendedNotPaid = allRegs.filter((r) => r.attended && !r.paid);
    const noShowPaid = allRegs.filter((r) => !r.attended && r.paid);

    const dateStr = new Date(game.gameDate).toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const vigilante = game.vigilante ?? 0;
    const neto = recaudado - vigilante;

    const lines: string[] = [
      `✅ *${game.title}*`,
      dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
      '',
      `✅ *Asistentes:* ${attended.length}/${mainList.length}`,
      `💰 *Recaudado:* $${recaudado.toLocaleString('es-CO')}`,
    ];

    if (vigilante > 0) {
      lines.push(`🛡️ *Vigilante:* -$${vigilante.toLocaleString('es-CO')}`);
      lines.push(`💵 *Neto:* $${neto.toLocaleString('es-CO')}`);
    }

    if (attendedNotPaid.length > 0) {
      lines.push('', `⚠️ *Asistieron sin pagar:* ${attendedNotPaid.length}`);
      attendedNotPaid.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    if (noShowPaid.length > 0) {
      lines.push('', `📌 *Pagaron pero no asistieron:* ${noShowPaid.length}`);
      noShowPaid.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    const fined = allRegs.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      lines.push('', `❌ *Multados:* ${fined.length}`);
      fined.forEach((r) => lines.push(`  • ${displayName(r)}`));
    }

    return lines.join('\n');
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

  formatListForWhatsapp(game: Awaited<ReturnType<typeof this.findOne>>) {
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
