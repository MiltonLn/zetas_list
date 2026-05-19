import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { Prisma, Role, GameStatus, Modalidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReorderDto } from './dto/reorder.dto';

const DEFAULT_SPOTS: Record<Modalidad, number> = {
  seis_x_seis: 18,
  cuatro_x_cuatro: 12,
  torneo: 18,
};

const COLOMBIA_OFFSET_MIN = -5 * 60;
const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;
const NEXT_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PRICE_PER_PLAYER = 2000;
const DEFAULT_VIGILANTE = 10000;
const DEFAULT_GUEST_CUTOFF = '13:30';
const DEFAULT_MAX_PROXY = 1;
const DEFAULT_REGISTRATION_OPEN_TIME = '10:00';

export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  seis_x_seis: '6x6',
  cuatro_x_cuatro: '4x4',
  torneo: 'Torneo',
};

const REGISTRATION_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      phone: true,
      position: true,
      gender: true,
      heightCm: true,
      birthDate: true,
      photoUrl: true,
      bio: true,
    },
  },
  registeredBy: {
    select: { id: true, name: true, username: true },
  },
} as const;

export function displayName(r: { isGuest: boolean; guestName?: string | null; user?: { name: string } | null; registeredBy?: { name: string } | null }): string {
  if (r.isGuest) {
    const inviter = r.registeredBy?.name || '?';
    return `${r.guestName || 'Invitado'} (inv. de ${inviter})`;
  }
  return r.user?.name || 'Desconocido';
}

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsapp: WhatsappService,
  ) {}

  private readonly logger = new Logger(GamesService.name);

  buildCounts(game: { maxMainSpots: number; registrations: Array<{ isWaitingList: boolean }> }): string {
    const mainCount = game.registrations.filter((r) => !r.isWaitingList).length;
    const waitCount = game.registrations.filter((r) => r.isWaitingList).length;
    const max = game.maxMainSpots;

    if (mainCount >= max) {
      let msg = `📊 Lista principal *llena* (${mainCount}/${max})`;
      if (waitCount > 0) msg += ` · ${waitCount} en espera`;
      return msg;
    }
    return `📊 *${mainCount}/${max}* cupos ocupados (${max - mainCount} disponibles)`;
  }

  buildTitle(modalidad: Modalidad, gameDate: string, startTime: string): string {
    const date = new Date(gameDate + 'T00:00:00');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `Volley Ingenio ${MODALIDAD_LABEL[modalidad]} ${day}/${month}/${year} ${startTime}pm`;
  }

  buildGameLink(gameId: string): string {
    const appUrl = process.env.APP_URL || 'https://zetas.miltonln.site';
    return `\n🔗 ${appUrl}/game/${gameId}`;
  }

  buildRegistrationOpenMessage(game: { id: string; title: string }): string {
    const appUrl = process.env.APP_URL || 'https://zetas.miltonln.site';
    const gameUrl = `${appUrl}/game/${game.id}`;
    return (
      `🏐 *${game.title}*\n\n` +
      `¡La inscripción está abierta! 🎉\n\n` +
      `Anótate aquí: ${gameUrl}\n\n` +
      `O escríbeme aquí: *@Z anotame*`
    );
  }

  async create(dto: CreateGameDto, actorId: string) {
    const gameDate = new Date(dto.gameDate + 'T00:00:00');

    const existing = await this.prisma.game.findFirst({
      where: {
        gameDate,
        status: { notIn: [GameStatus.cancelled, GameStatus.completed] },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un partido programado para el ${dto.gameDate}. Solo se permite uno por día.`,
      );
    }

    const startTime = dto.startTime ?? '19:50';
    const title = dto.customTitle?.trim() || this.buildTitle(dto.modalidad, dto.gameDate, startTime);
    const maxMainSpots = dto.maxMainSpots ?? DEFAULT_SPOTS[dto.modalidad];

    const registrationOpenTime = dto.registrationOpenTime ?? DEFAULT_REGISTRATION_OPEN_TIME;
    const registrationOpenAt = new Date(`${dto.gameDate}T${registrationOpenTime}:00-05:00`);

    const now = new Date();
    const initialStatus =
      registrationOpenAt <= now ? GameStatus.registration_open : GameStatus.scheduled;

    const game = await this.prisma.game.create({
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

    await this.audit.log({
      gameId: game.id,
      actorId,
      action: 'game_created',
      details: { title, modalidad: dto.modalidad, gameDate: dto.gameDate },
    });

    if (initialStatus === GameStatus.registration_open) {
      const message = this.buildRegistrationOpenMessage(game);
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
    if (filters?.excludeStatus?.length) where.status = { notIn: filters.excludeStatus };
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
    if (!game) throw new NotFoundException('Partido no encontrado');
    return game;
  }

  async register(gameId: string, userId: string, registeredById: string, options?: { silent?: boolean }) {
    const registration = await this.prisma.$transaction(
      async (tx) => {
        const game = await tx.$queryRaw<Array<{ id: string; status: string; maxMainSpots: number; mainListHasBeenFull: boolean; guestCutoffTime: string; maxProxyRegistrations: number; gameDate: Date }>>`
          SELECT id, status, "maxMainSpots", "mainListHasBeenFull", "guestCutoffTime", "maxProxyRegistrations", "gameDate"
          FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (!game.length) throw new NotFoundException('Partido no encontrado');

        const g = game[0];
        if (g.status !== 'registration_open' && g.status !== 'in_progress') {
          throw new BadRequestException('El registro para este partido no está abierto');
        }

        const existing = await tx.gameRegistration.findFirst({
          where: { gameId, userId },
        });
        if (existing) {
          throw new ConflictException('Ya estás anotado en este partido');
        }

        const isSelfRegister = userId === registeredById;

        if (!isSelfRegister) {
          const actor = await tx.user.findUnique({ where: { id: registeredById }, select: { role: true } });

          const targetUser = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
          if (targetUser && targetUser.status !== 'active') {
            throw new BadRequestException('El usuario que intentas anotar no tiene una cuenta activa');
          }

          if (actor?.role !== 'admin') {
            const actorRegistered = await tx.gameRegistration.findFirst({
              where: { gameId, userId: registeredById },
            });
            if (!actorRegistered) {
              throw new BadRequestException('Debes estar anotado en la lista antes de poder anotar a otra persona');
            }
          }

          const proxyCount = await tx.gameRegistration.count({
            where: { gameId, registeredById, userId: { not: registeredById } },
          });
          if (actor?.role !== 'admin' && proxyCount >= g.maxProxyRegistrations) {
            throw new BadRequestException(`Ya anotaste el máximo de ${g.maxProxyRegistrations} persona(s) en este partido`);
          }
        }

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });
        const activeWaitCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: true, confirmationDeclined: false },
        });

        const isWaitingList = this.shouldGoToWaitingList(mainCount, activeWaitCount, g.maxMainSpots, g.mainListHasBeenFull, false, false);

        if (!isWaitingList && mainCount + 1 >= g.maxMainSpots && !g.mainListHasBeenFull) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }
        if (isWaitingList && !g.mainListHasBeenFull && mainCount >= g.maxMainSpots) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }

        const maxPositionResult = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList },
          _max: { position: true },
        });
        const nextPosition = (maxPositionResult._max.position ?? 0) + 1;

        const needsConfirmation = !isSelfRegister && this.isBeforeCutoff(g.guestCutoffTime, g.gameDate);
        const confirmationDeadline = needsConfirmation ? this.buildCutoffDateTime(gameId, g.guestCutoffTime, g.gameDate) : null;

        return tx.gameRegistration.create({
          data: {
            gameId,
            userId,
            position: nextPosition,
            isWaitingList,
            registeredAt: new Date(),
            registeredById,
            pendingConfirmation: needsConfirmation,
            confirmationDeadline: needsConfirmation ? confirmationDeadline : undefined,
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
      let msg = `✅ *${userName}* se anotó ${spot}! 🏐\n${this.buildCounts(updated)}`;
      if (registration.pendingConfirmation) {
        msg += `\n⏳ *${userName}* debe confirmar con *@Z confirmar* antes de la ${this.formatCutoffTime(updated.guestCutoffTime)}.`;
      }
      msg += this.buildGameLink(gameId);
      this.whatsapp.sendToGroup(msg).catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return registration;
  }

  async registerGuest(gameId: string, guestName: string, invitedById: string, options?: { silent?: boolean }) {
    const trimmedName = guestName?.trim();
    if (!trimmedName) {
      throw new BadRequestException('El nombre del invitado es obligatorio');
    }

    const registration = await this.prisma.$transaction(
      async (tx) => {
        const game = await tx.$queryRaw<Array<{ id: string; status: string; maxMainSpots: number; mainListHasBeenFull: boolean; guestCutoffTime: string; gameDate: Date }>>`
          SELECT id, status, "maxMainSpots", "mainListHasBeenFull", "guestCutoffTime", "gameDate"
          FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (!game.length) throw new NotFoundException('Partido no encontrado');

        const g = game[0];
        if (g.status !== 'registration_open' && g.status !== 'in_progress') {
          throw new BadRequestException('El registro para este partido no está abierto');
        }

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });
        const activeWaitCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: true, confirmationDeclined: false },
        });

        const beforeCutoff = this.isBeforeCutoff(g.guestCutoffTime, g.gameDate);
        const isWaitingList = this.shouldGoToWaitingList(mainCount, activeWaitCount, g.maxMainSpots, g.mainListHasBeenFull, true, beforeCutoff);

        if (!isWaitingList && mainCount + 1 >= g.maxMainSpots && !g.mainListHasBeenFull) {
          await tx.game.update({ where: { id: gameId }, data: { mainListHasBeenFull: true } });
        }

        const maxPositionResult = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList },
          _max: { position: true },
        });
        const nextPosition = (maxPositionResult._max.position ?? 0) + 1;

        return tx.gameRegistration.create({
          data: {
            gameId,
            userId: null,
            position: nextPosition,
            isWaitingList,
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
        .sendToGroup(`✅ Invitado *${guestName}* fue anotado ${spot} 🏐\n${this.buildCounts(updated)}${this.buildGameLink(gameId)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return registration;
  }

  async confirmRegistration(gameId: string, userId: string) {
    const reg = await this.prisma.gameRegistration.findFirst({
      where: { gameId, userId, pendingConfirmation: true },
      include: REGISTRATION_INCLUDE,
    });
    if (!reg) throw new NotFoundException('No tienes una confirmación pendiente');

    await this.prisma.gameRegistration.update({
      where: { id: reg.id },
      data: { pendingConfirmation: false, confirmationDeadline: null },
    });

    await this.audit.log({
      gameId,
      actorId: userId,
      targetUserId: userId,
      action: 'confirmation_received',
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async retryFromWaitingList(gameId: string, userId: string): Promise<{ promoted: boolean; game: any }> {
    const reg = await this.prisma.gameRegistration.findFirst({
      where: { gameId, userId, isWaitingList: true, confirmationDeclined: true },
    });
    if (!reg) return { promoted: false, game: null };

    await this.prisma.gameRegistration.update({
      where: { id: reg.id },
      data: { confirmationDeclined: false },
    });

    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return { promoted: false, game: null };

    const mainCount = await this.prisma.gameRegistration.count({
      where: { gameId, isWaitingList: false },
    });

    if (mainCount < game.maxMainSpots) {
      await this.promote(gameId, reg.id, userId, { silent: true });
      const updated = await this.findOne(gameId);
      this.events.emit({ gameId, type: 'update', data: updated });
      return { promoted: true, game: updated };
    }

    const updated = await this.findOne(gameId);
    return { promoted: false, game: updated };
  }

  shouldGoToWaitingList(
    mainCount: number,
    waitCount: number,
    maxMainSpots: number,
    mainListHasBeenFull: boolean,
    isGuest: boolean,
    beforeCutoff: boolean,
  ): boolean {
    if (isGuest && beforeCutoff) return true;
    if (mainCount >= maxMainSpots) return true;
    if (mainListHasBeenFull && waitCount > 0) return true;
    return false;
  }

  isBeforeCutoff(cutoffTime: string, gameDate?: Date | string): boolean {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const colombiaMs = utcMs + COLOMBIA_OFFSET_MIN * 60000;
    const colombiaNow = new Date(colombiaMs);

    if (gameDate) {
      const gd = new Date(gameDate);
      const gameDateOnly = new Date(gd.getFullYear(), gd.getMonth(), gd.getDate());
      const todayOnly = new Date(colombiaNow.getFullYear(), colombiaNow.getMonth(), colombiaNow.getDate());
      if (todayOnly < gameDateOnly) return true;
      if (todayOnly > gameDateOnly) return false;
    }

    const [cutH, cutM] = cutoffTime.split(':').map(Number);
    const cutoffMinutes = cutH * 60 + cutM;
    const nowMinutes = colombiaNow.getHours() * 60 + colombiaNow.getMinutes();
    return nowMinutes < cutoffMinutes;
  }

  private buildCutoffDateTime(_gameId: string, cutoffTime: string, gameDate?: Date | string): Date {
    if (gameDate) {
      const gd = new Date(gameDate);
      const dateStr = `${gd.getFullYear()}-${String(gd.getMonth() + 1).padStart(2, '0')}-${String(gd.getDate()).padStart(2, '0')}`;
      return new Date(`${dateStr}T${cutoffTime}:00-05:00`);
    }
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const colombiaMs = utcMs + COLOMBIA_OFFSET_MIN * 60000;
    const colombiaDate = new Date(colombiaMs);
    const dateStr = `${colombiaDate.getFullYear()}-${String(colombiaDate.getMonth() + 1).padStart(2, '0')}-${String(colombiaDate.getDate()).padStart(2, '0')}`;
    return new Date(`${dateStr}T${cutoffTime}:00-05:00`);
  }

  private formatCutoffTime(cutoffTime: string): string {
    const [h, m] = cutoffTime.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12}:00 ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  async removeRegistration(gameId: string, userId: string, actorId: string, actorRole: Role, options?: { silent?: boolean; regId?: string }) {
    const reg = options?.regId
      ? await this.prisma.gameRegistration.findFirst({
          where: { id: options.regId, gameId },
          include: { user: { select: { name: true } } },
        })
      : await this.prisma.gameRegistration.findFirst({
          where: { gameId, userId },
          include: { user: { select: { name: true } } },
        });
    if (!reg) throw new NotFoundException('Registro no encontrado');

    if (actorRole !== Role.admin && actorId !== userId) {
      throw new ForbiddenException('No puedes eliminar a otro jugador');
    }

    const wasMainList = !reg.isWaitingList;

    const orphanedGuests = reg.userId
      ? await this.prisma.gameRegistration.findMany({
          where: { gameId, isGuest: true, registeredById: reg.userId },
          select: { id: true, guestName: true, position: true, isWaitingList: true },
        })
      : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.gameRegistration.delete({ where: { id: reg.id } });

      await tx.gameRegistration.updateMany({
        where: { gameId, isWaitingList: reg.isWaitingList, position: { gt: reg.position } },
        data: { position: { decrement: 1 } },
      });

      if (orphanedGuests.length > 0) {
        await tx.gameRegistration.deleteMany({
          where: { id: { in: orphanedGuests.map((g) => g.id) } },
        });
        const sorted = [...orphanedGuests].sort((a, b) => b.position - a.position);
        for (const guest of sorted) {
          await tx.gameRegistration.updateMany({
            where: { gameId, isWaitingList: guest.isWaitingList, position: { gt: guest.position } },
            data: { position: { decrement: 1 } },
          });
        }
      }
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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = displayName(reg);
    if (!options?.silent) {
      let msg = `👋 *${userName}* salió de la lista.`;
      if (orphanedGuests.length > 0) {
        const guestNames = orphanedGuests.map((g) => g.guestName || 'Invitado').join(', ');
        msg += `\n🚫 ${orphanedGuests.length === 1 ? 'Su invitado también fue removido' : 'Sus invitados también fueron removidos'}: ${guestNames}`;
      }
      msg += `\n${this.buildCounts(updated)}${this.buildGameLink(gameId)}`;
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
    if (!reg) throw new NotFoundException('Registro no encontrado');

    const updated = await this.prisma.gameRegistration.update({
      where: { id: regId, gameId },
      data: dto,
      include: REGISTRATION_INCLUDE,
    });

    if (dto.attended !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'attendance_toggled',
        details: { attended: dto.attended },
      });
    }
    if (dto.paid !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'payment_toggled',
        details: { paid: dto.paid },
      });
    }
    if (dto.note !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId ?? undefined,
        action: 'note_updated',
        details: { note: dto.note },
      });
    }

    const fullGame = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: fullGame });
    return updated;
  }

  async promote(gameId: string, regId: string, actorId: string | null, options?: { silent?: boolean }) {
    const promoted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, isWaitingList: true },
      });
      if (!reg) throw new NotFoundException('Registro en lista de espera no encontrado');

      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      const mainCount = await tx.gameRegistration.count({
        where: { gameId, isWaitingList: false },
      });
      if (mainCount >= game.maxMainSpots) {
        throw new BadRequestException('La lista principal está llena');
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
      this.whatsapp
        .sendToGroup(`⬆️ *${userName}* fue promovido a la *lista principal* 🏐\n${this.buildCounts(updated)}${this.buildGameLink(gameId)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return updated;
  }

  async promoteNext(gameId: string, actorId: string) {
    const game = await this.prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    const mainCount = await this.prisma.gameRegistration.count({
      where: { gameId, isWaitingList: false },
    });
    if (mainCount >= game.maxMainSpots) {
      throw new BadRequestException('La lista principal ya está llena');
    }

    const firstInWait = await this.prisma.gameRegistration.findFirst({
      where: { gameId, isWaitingList: true },
      orderBy: { position: 'asc' },
      include: REGISTRATION_INCLUDE,
    });
    if (!firstInWait) {
      throw new NotFoundException('No hay nadie en la lista de espera');
    }

    const updated = await this.promote(gameId, firstInWait.id, actorId, { silent: true });
    const promotedName = displayName(firstInWait);
    return { updated: updated as any, promotedName };
  }

  async demote(gameId: string, regId: string, actorId: string) {
    const demoted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

      const reg = await tx.gameRegistration.findFirst({
        where: { id: regId, gameId, isWaitingList: false },
      });
      if (!reg) throw new NotFoundException('Registro en lista principal no encontrado');

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

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = displayName(demoted);
    this.whatsapp
      .sendToGroup(`⬇️ *${userName}* fue movido a la *lista de espera* (puesto ${demoted.position})\n${this.buildCounts(updated)}${this.buildGameLink(gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return updated;
  }

  async autoPromoteIfNeeded(gameId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game || (game.status !== 'registration_open' && game.status !== 'in_progress')) return;

    const promoted = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });
        if (mainCount >= game.maxMainSpots) return null;

        await tx.gameRegistration.updateMany({
          where: { gameId, isWaitingList: true, confirmationDeclined: true },
          data: { confirmationDeclined: false },
        });

        const firstInWait = await tx.gameRegistration.findFirst({
          where: { gameId, isWaitingList: true, confirmationDeclined: false },
          orderBy: { position: 'asc' },
          include: REGISTRATION_INCLUDE,
        });
        if (!firstInWait) return null;

        return firstInWait;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!promoted) return;

    const originalPos = promoted.position;

    await this.promote(gameId, promoted.id, null, { silent: true });

    const confirmDeadline = new Date(Date.now() + CONFIRMATION_TIMEOUT_MS);
    await this.prisma.gameRegistration.update({
      where: { id: promoted.id },
      data: {
        pendingConfirmation: true,
        confirmationDeadline: confirmDeadline,
        originalWaitPosition: originalPos,
      },
    });

    await this.audit.log({
      gameId,
      actorId: null,
      targetUserId: promoted.userId ?? undefined,
      action: 'confirmation_requested',
      details: { deadline: confirmDeadline.toISOString(), originalWaitPosition: originalPos },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const name = displayName(promoted);
    const confirmTarget = promoted.isGuest
      ? `*${promoted.registeredBy?.name || 'Responsable'}*`
      : `*${promoted.user?.name || 'Alguien'}*`;

    this.whatsapp
      .sendToGroup(`⬆️ *${name}* fue promovido a la *lista principal* 🏐\n${confirmTarget}, confirma con *@Z confirmar* en los próximos 15 min.\n${this.buildCounts(updated)}${this.buildGameLink(gameId)}`)
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

    const currentMaxResult = await this.prisma.gameRegistration.aggregate({
      where: { gameId: reg.gameId, isWaitingList: true },
      _max: { position: true },
    });
    const maxPos = currentMaxResult._max.position ?? 0;
    const returnPos = Math.min(reg.originalWaitPosition ?? 1, maxPos + 1);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${reg.gameId} FOR UPDATE`;

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
    });

    await this.audit.log({
      gameId: reg.gameId,
      actorId: null,
      targetUserId: reg.userId ?? undefined,
      action: 'confirmation_expired',
      details: { returnedToPosition: returnPos },
    });

    const name = displayName(reg);
    const updated = await this.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: updated });

    this.whatsapp
      .sendToGroup(`⏰ *${name}* no confirmó a tiempo y volvió a la lista de espera (puesto ${returnPos}).\n${this.buildCounts(updated)}${this.buildGameLink(reg.gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    const nextInWait = await this.prisma.gameRegistration.findFirst({
      where: { gameId: reg.gameId, isWaitingList: true, confirmationDeclined: false },
      orderBy: { position: 'asc' },
      include: REGISTRATION_INCLUDE,
    });

    if (!nextInWait) {
      this.whatsapp
        .sendToGroup(`ℹ️ Nadie en lista de espera confirmó. El cupo queda disponible para quien se anote.`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
      return;
    }

    const nextOriginalPos = nextInWait.position;
    const nextDeadline = new Date(Date.now() + NEXT_CONFIRM_TIMEOUT_MS);

    await this.promote(reg.gameId, nextInWait.id, null, { silent: true });

    await this.prisma.gameRegistration.update({
      where: { id: nextInWait.id },
      data: {
        pendingConfirmation: true,
        confirmationDeadline: nextDeadline,
        originalWaitPosition: nextOriginalPos,
      },
    });

    await this.audit.log({
      gameId: reg.gameId,
      actorId: null,
      targetUserId: nextInWait.userId ?? undefined,
      action: 'confirmation_requested',
      details: { deadline: nextDeadline.toISOString() },
    });

    const nextName = displayName(nextInWait);
    const nextConfirmTarget = nextInWait.isGuest
      ? `*${nextInWait.registeredBy?.name || 'Responsable'}*`
      : `*${nextInWait.user?.name || 'Alguien'}*`;

    const finalUpdated = await this.findOne(reg.gameId);
    this.events.emit({ gameId: reg.gameId, type: 'update', data: finalUpdated });

    this.whatsapp
      .sendToGroup(`⬆️ *${nextName}* fue promovido a la *lista principal* 🏐\n${nextConfirmTarget}, confirma con *@Z confirmar* en los próximos 5 min.\n${this.buildCounts(finalUpdated)}${this.buildGameLink(reg.gameId)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));
  }

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
    });

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
      throw new BadRequestException('Este partido ya está finalizado o cancelado');
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.cancelled, cancellationReason: dto.reason },
    });

    await this.audit.log({
      gameId,
      actorId,
      action: 'game_cancelled',
      details: { reason: dto.reason },
    });

    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.cancelled } });

    const reasonText = dto.reason ? `\nMotivo: ${dto.reason}` : '';
    this.whatsapp
      .sendToGroup(`❌ *${game.title}* ha sido cancelado.${reasonText}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return updated;
  }

  async complete(gameId: string, actorId: string, options?: { silent?: boolean }) {
    const game = await this.findOne(gameId);

    if (game.status === GameStatus.completed) {
      throw new BadRequestException('Este partido ya está completado');
    }
    if (game.status === GameStatus.cancelled) {
      throw new BadRequestException('No se puede completar un partido cancelado');
    }

    const report = this.generateReport(game);

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.completed, completionReport: report },
    });

    await this.audit.log({
      gameId,
      actorId,
      action: 'game_completed',
      details: {},
    });

    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.completed } });

    if (!options?.silent) {
      this.whatsapp
        .sendToGroup(report)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return { game: updated, report };
  }

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
    const reg = await this.prisma.gameRegistration.findFirst({
      where: { id: regId, gameId },
    });
    if (!reg) throw new NotFoundException('Registro no encontrado');

    await this.prisma.gameRegistration.update({
      where: { id: regId },
      data: { fineExempt: exempt },
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: reg.userId ?? undefined,
      action: 'fine_exemption_toggled',
      details: { fineExempt: exempt },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async getStoredReport(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { completionReport: true, status: true },
    });
    if (!game) throw new NotFoundException('Partido no encontrado');

    if (game.completionReport) {
      return { report: game.completionReport };
    }

    const full = await this.findOne(gameId);
    return { report: this.generateReport(full) };
  }

  async openRegistration(gameId: string) {
    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.registration_open },
    });

    this.events.emit({
      gameId,
      type: 'status_change',
      data: { status: GameStatus.registration_open },
    });

    return updated;
  }

  generateReport(game: Awaited<ReturnType<typeof this.findOne>>) {
    const allRegs = game.registrations;
    const mainList = allRegs.filter((r) => !r.isWaitingList);

    const attended = allRegs.filter((r) => r.attended);
    const totalPaid = allRegs.filter((r) => r.paid).length;
    const recaudado = totalPaid * game.pricePerPlayer;

    const attendedNotPaid = allRegs.filter((r) => r.attended && !r.paid);
    const noShowPaid = allRegs.filter((r) => !r.attended && r.paid);

    const dateStr = new Date(game.gameDate).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
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
      lines.push('');
      lines.push(`⚠️ *Asistieron sin pagar:* ${attendedNotPaid.length}`);
      attendedNotPaid.forEach((r) => {
        lines.push(`  • ${displayName(r)}`);
      });
    }

    if (noShowPaid.length > 0) {
      lines.push('');
      lines.push(`📌 *Pagaron pero no asistieron:* ${noShowPaid.length}`);
      noShowPaid.forEach((r) => {
        lines.push(`  • ${displayName(r)}`);
      });
    }

    const fined = allRegs.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      lines.push('');
      lines.push(`❌ *Multados:* ${fined.length}`);
      fined.forEach((r) => {
        lines.push(`  • ${displayName(r)}`);
      });
    }

    return lines.join('\n');
  }

  async getAvailableMembers(gameId: string) {
    const registeredUserIds = await this.prisma.gameRegistration.findMany({
      where: { gameId, userId: { not: null } },
      select: { userId: true },
    });
    const excludeIds = registeredUserIds.map((r) => r.userId).filter(Boolean) as string[];

    return this.prisma.user.findMany({
      where: {
        status: 'active',
        id: { notIn: excludeIds },
      },
      select: { id: true, name: true, phone: true, username: true },
      orderBy: { name: 'asc' },
    });
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

    lines.push(this.buildGameLink(game.id));

    return lines.join('\n');
  }
}
