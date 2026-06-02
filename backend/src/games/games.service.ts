import {
  Injectable,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { Prisma, Role, GameStatus, Modalidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FinancesService } from '../finances/finances.service';
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
  NoPendingConfirmationException,
  CannotRemoveOtherException,
  NoOneInWaitListException,
  UserHasUnpaidFinesException,
} from './exceptions';
import {
  displayName,
  buildCounts,
  buildTitle,
  buildGameLink,
  buildRegistrationOpenMessage,
  shouldGoToWaitingList,
  isBeforeCutoff,
  REGISTRATION_INCLUDE,
  DEFAULT_SPOTS,
  CONFIRMATION_TIMEOUT_MS,
  NEXT_CONFIRM_TIMEOUT_MS,
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
    @Inject(forwardRef(() => WhatsappService))
    private whatsapp: WhatsappService,
    private finances: FinancesService,
  ) {}

  private readonly logger = new Logger(GamesService.name);

  buildCounts(game: { maxMainSpots: number; registrations: Array<{ isWaitingList: boolean }> }): string {
    return buildCounts(game);
  }

  buildGameLink(gameId: string): string {
    return buildGameLink(gameId);
  }

  buildRegistrationOpenMessage(game: { id: string; title: string }): string {
    return buildRegistrationOpenMessage(game);
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
      const message = buildRegistrationOpenMessage(game);
      this.whatsapp.sendToGroup(message).catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return game;
  }

  async findAll(
    role: Role,
    filters?: {
      status?: GameStatus;
      excludeStatus?: GameStatus[];
      modalidad?: Modalidad;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    if (role !== Role.admin) {
      const active = await this.prisma.game.findFirst({
        where: {
          status: { in: [GameStatus.registration_open, GameStatus.in_progress] },
        },
        include: { registrations: { include: REGISTRATION_INCLUDE, orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return { data: active ? [active] : [], total: active ? 1 : 0, page: 1, limit: 1 };
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.GameWhereInput = {};
    if (filters?.status) where.status = filters.status;
    else if (filters?.excludeStatus?.length) where.status = { notIn: filters.excludeStatus };
    if (filters?.modalidad) where.modalidad = filters.modalidad;
    if (filters?.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.gameDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom + 'T00:00:00') } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo + 'T23:59:59') } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.game.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { registrations: true } },
        },
        orderBy: { gameDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.game.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        registrations: {
          include: REGISTRATION_INCLUDE,
          orderBy: [{ isWaitingList: 'asc' }, { position: 'asc' }],
        },
      },
    });
    if (!game) throw new GameNotFoundException();
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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = registration.user?.name || 'Alguien';
    const spot = registration.isWaitingList
      ? `en la *lista de espera* (puesto ${registration.position})`
      : `en la *lista principal*`;
    if (!options?.silent) {
      const msg = `✅ *${userName}* se anotó ${spot}! 🏐\n${buildCounts(updated)}${buildGameLink(gameId)}`;
      this.whatsapp.sendToGroup(msg).catch((e) => this.logger.warn('WhatsApp send failed', e));
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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const spot = registration.isWaitingList
      ? `en la *lista de espera* (puesto ${registration.position})`
      : `en la *lista principal*`;
    if (!options?.silent) {
      this.whatsapp
        .sendToGroup(`✅ Invitado *${guestName}* fue anotado ${spot} 🏐\n${buildCounts(updated)}${buildGameLink(gameId)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return registration;
  }

  async confirmRegistration(gameId: string, userId: string, actorId: string = userId): Promise<{ game: any; confirmedOwn: boolean; confirmedGuests: string[] }> {
    const confirmed = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

        const ownReg = await tx.gameRegistration.findFirst({
          where: { gameId, userId, pendingConfirmation: true },
        });

        const guestRegs = await tx.gameRegistration.findMany({
          where: { gameId, registeredById: userId, isGuest: true, pendingConfirmation: true },
          include: { registeredBy: { select: { name: true } } },
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
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: userId,
      action: 'confirmation_received',
      details: { confirmedOwn: confirmed.confirmedOwn, confirmedGuests: confirmed.confirmedGuests, onBehalf: actorId !== userId },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return { game: updated, ...confirmed };
  }

  /**
   * Confirma un registro puntual por su id. Pensado para la acción de admin desde
   * la UI: funciona tanto para miembros (autopromoción) como para invitados, que
   * no tienen `userId` propio y por eso no pueden confirmarse por usuario.
   */
  async confirmRegistrationById(gameId: string, regId: string, actorId: string): Promise<{ game: any; name: string }> {
    const confirmed = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

        const reg = await tx.gameRegistration.findFirst({
          where: { id: regId, gameId, pendingConfirmation: true },
          include: { user: { select: { name: true } } },
        });
        if (!reg) throw new NoPendingConfirmationException();

        await tx.gameRegistration.update({
          where: { id: reg.id },
          data: { pendingConfirmation: false, confirmationDeadline: null },
        });

        return {
          name: reg.isGuest ? reg.guestName || 'Invitado' : reg.user?.name || 'Jugador',
          userId: reg.userId as string | null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: confirmed.userId ?? undefined,
      action: 'confirmation_received',
      details: { confirmedRegId: regId, onBehalf: true },
    });

    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    this.whatsapp
      .sendToGroup(`✅ *${actor?.name || 'Un admin'}* confirmó la asistencia de *${confirmed.name}* 🏐`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return { game: updated, name: confirmed.name };
  }

  async retryFromWaitingList(gameId: string, userId: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return { promoted: result.promoted, game: updated };
  }

  async removeRegistration(gameId: string, userId: string, actorId: string, actorRole: Role, options?: { silent?: boolean; regId?: string }) {
    const { reg, orphanedGuests, wasMainList, userName } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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
        if (actorRole !== Role.admin && actorId !== regOwnerId) {
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    if (!options?.silent) {
      const removedBySelf = actorId === (reg.userId ?? reg.registeredById);
      let msg = removedBySelf
        ? `👋 *${userName}* salió de la lista.`
        : `🚫 *${userName}* fue sacado de la lista por un admin.`;
      if (orphanedGuests.length > 0) {
        const guestNames = orphanedGuests.map((g) => g.guestName || 'Invitado').join(', ');
        msg += `\n🚫 ${orphanedGuests.length === 1 ? 'Su invitado también fue removido' : 'Sus invitados también fueron removidos'}: ${guestNames}`;
      }
      msg += `\n${buildCounts(updated)}${buildGameLink(gameId)}`;
      this.whatsapp
        .sendToGroup(msg)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
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

    const updated = await this.prisma.gameRegistration.update({
      where: { id: regId, gameId },
      data: dto,
      include: REGISTRATION_INCLUDE,
    });

    if (dto.attended !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'attendance_toggled', details: { attended: dto.attended } });
    }
    if (dto.paid !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'payment_toggled', details: { paid: dto.paid } });
    }
    if (dto.note !== undefined) {
      await this.audit.log({ gameId, actorId, targetUserId: reg.userId ?? undefined, action: 'note_updated', details: { note: dto.note } });
    }

    const fullGame = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: fullGame });
    return updated;
  }

  // ─── PROMOTION ────────────────────────────────────────────────────────────

  async promote(gameId: string, regId: string, actorId: string | null, options?: { silent?: boolean }) {
    const promoted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = displayName(promoted);
    if (!options?.silent) {
      const byAdmin = actorId ? ' por un admin' : '';
      this.whatsapp
        .sendToGroup(`⬆️ *${userName}* fue promovido a la *lista principal*${byAdmin} 🏐\n${buildCounts(updated)}${buildGameLink(gameId)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return updated;
  }

  async promoteNext(gameId: string, actorId: string) {
    const firstInWait = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const updated = await this.promote(gameId, firstInWait.id, actorId, { silent: true });
    const promotedName = displayName(firstInWait);
    return { updated, promotedName };
  }

  async demote(gameId: string, regId: string, actorId: string) {
    const demoted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: demoted.userId ?? undefined,
      action: 'player_demoted',
      details: { newPosition: demoted.position },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = displayName(demoted);
    const adminNote = actorId !== demoted.userId ? ' (por un admin)' : '';
    this.whatsapp
      .sendToGroup(`⬇️ *${userName}* fue movido a la *lista de espera*${adminNote} (puesto ${demoted.position})\n${buildCounts(updated)}${buildGameLink(gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return updated;
  }

  async autoPromoteIfNeeded(gameId: string, options?: { skipMainListFullCheck?: boolean }) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game || (game.status !== 'registration_open' && game.status !== 'in_progress')) return;
    if (!options?.skipMainListFullCheck && !game.mainListHasBeenFull) return;

    const beforeCutoff = isBeforeCutoff(game.guestCutoffTime, game.gameDate);

    // Entire selection + promotion + confirmation marking in a single serializable tx
    const promoted = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });
        if (mainCount >= game.maxMainSpots) {
          this.logger.log(`[AUTO_PROMOTE] game=${gameId} | mainCount=${mainCount}/${game.maxMainSpots} | FULL, no promotion`);
          return null;
        }

        const firstInWait = await tx.gameRegistration.findFirst({
          where: {
            gameId,
            isWaitingList: true,
            confirmationDeclined: false,
            ...(beforeCutoff ? { isGuest: false } : {}),
          },
          orderBy: { position: 'asc' },
          include: REGISTRATION_INCLUDE,
        });
        if (!firstInWait) {
          this.logger.log(`[AUTO_PROMOTE] game=${gameId} | mainCount=${mainCount}/${game.maxMainSpots} | beforeCutoff=${beforeCutoff} | No eligible waiter found`);
          return null;
        }

        const originalPos = firstInWait.position;

        // Inline promotion within the same transaction
        const maxPos = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList: false },
          _max: { position: true },
        });

        const confirmDeadline = new Date(Date.now() + CONFIRMATION_TIMEOUT_MS);

        const updatedReg = await tx.gameRegistration.update({
          where: { id: firstInWait.id },
          data: {
            isWaitingList: false,
            position: (maxPos._max.position ?? 0) + 1,
            fromWaitList: true,
            pendingConfirmation: true,
            confirmationDeadline: confirmDeadline,
            originalWaitPosition: originalPos,
          },
          include: REGISTRATION_INCLUDE,
        });

        return { reg: updatedReg, originalPos, confirmDeadline };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!promoted) return;

    await this.audit.log({
      gameId,
      actorId: null,
      targetUserId: promoted.reg.userId ?? undefined,
      action: 'confirmation_requested',
      details: { deadline: promoted.confirmDeadline.toISOString(), originalWaitPosition: promoted.originalPos },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const name = displayName(promoted.reg);
    const confirmTarget = promoted.reg.isGuest
      ? `*${promoted.reg.registeredBy?.name || 'Responsable'}*`
      : `*${promoted.reg.user?.name || 'Alguien'}*`;

    this.whatsapp
      .sendToGroup(`⬆️ *${name}* fue promovido a la *lista principal* 🏐\n${confirmTarget}, confirma con *@Z confirmar* en los próximos 15 min.\n${buildCounts(updated)}${buildGameLink(gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));
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

    // Demotion and next-promote in a single serializable transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${reg.gameId} FOR UPDATE`;

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

        // Find and promote next waiter within the same transaction
        const nextInWait = await tx.gameRegistration.findFirst({
          where: { gameId: reg.gameId, isWaitingList: true, confirmationDeclined: false, id: { not: regId } },
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!result) return;

    await this.audit.log({
      gameId: reg.gameId,
      actorId: null,
      targetUserId: reg.userId ?? undefined,
      action: 'confirmation_expired',
      details: { returnedToPosition: result.returnPos },
    });

    const name = displayName(reg);
    const updated = await this.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: updated });

    this.whatsapp
      .sendToGroup(`⏰ *${name}* no confirmó a tiempo y volvió a la lista de espera (puesto ${result.returnPos}).\n${buildCounts(updated)}${buildGameLink(reg.gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    if (!result.nextInWait) {
      this.whatsapp
        .sendToGroup(`ℹ️ Nadie en lista de espera confirmó. El cupo queda disponible para quien se anote.`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
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
    const nextConfirmTarget = result.nextInWait.isGuest
      ? `*${result.nextInWait.registeredBy?.name || 'Responsable'}*`
      : `*${result.nextInWait.user?.name || 'Alguien'}*`;

    const finalUpdated = await this.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: finalUpdated });

    this.whatsapp
      .sendToGroup(`⬆️ *${nextName}* fue promovido a la *lista principal* 🏐\n${nextConfirmTarget}, confirma con *@Z confirmar* en los próximos 5 min.\n${buildCounts(finalUpdated)}${buildGameLink(reg.gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));
  }

  // ─── REORDER / CANCEL / COMPLETE ─────────────────────────────────────────

  async reorder(gameId: string, dto: ReorderDto, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.audit.log({
      gameId,
      actorId,
      action: 'player_reordered',
      details: { mainListCount: dto.mainList.length, waitListCount: dto.waitList.length },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async cancel(gameId: string, dto: CancelGameDto, actorId: string) {
    const game = await this.findOne(gameId);
    if (game.status === GameStatus.completed || game.status === GameStatus.cancelled) {
      throw new GameAlreadyCompletedException();
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.cancelled, cancellationReason: dto.reason },
    });

    await this.audit.log({ gameId, actorId, action: 'game_cancelled', details: { reason: dto.reason } });
    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.cancelled } });

    const reasonText = dto.reason ? `\nMotivo: ${dto.reason}` : '';
    this.whatsapp
      .sendToGroup(`❌ *${game.title}* ha sido cancelado.${reasonText}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return updated;
  }

  async complete(gameId: string, actorId: string, options?: { silent?: boolean }) {
    const game = await this.findOne(gameId);

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
      this.whatsapp
        .sendToGroup(report)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return { game: updated, report };
  }

  // ─── REPORTING ────────────────────────────────────────────────────────────

  async previewReport(gameId: string) {
    const game = await this.findOne(gameId);
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

    const updated = await this.findOne(gameId);
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
    const full = await this.findOne(gameId);
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
          ? `${r.guestName || 'Invitado'} 👤 _(inv. de ${r.registeredBy?.name || '?'})_`
          : r.user?.name || 'Desconocido';
        const pendingTag = r.pendingConfirmation ? ' ⏳' : '';
        lines.push(`${i + 1}. ${name}${pendingTag}`);
      });
    }

    if (waitList.length > 0) {
      lines.push('', `*Lista de Espera (${waitList.length}):*`);
      waitList.forEach((r, i) => {
        const name = r.isGuest
          ? `${r.guestName || 'Invitado'} 👤 _(inv. de ${r.registeredBy?.name || '?'})_`
          : r.user?.name || 'Desconocido';
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
