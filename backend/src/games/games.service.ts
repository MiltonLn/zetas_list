import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, Role, GameStatus, Modalidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GameEventsService } from './game-events.service';
import { CreateGameDto } from './dto/create-game.dto';
import { CancelGameDto } from './dto/cancel-game.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReorderDto } from './dto/reorder.dto';

const DEFAULT_SPOTS: Record<Modalidad, number> = {
  seis_x_seis: 18,
  cuatro_x_cuatro: 12,
  torneo: 18,
};

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
      photoUrl: true,
    },
  },
  registeredBy: {
    select: { id: true, name: true, username: true },
  },
} as const;

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: GameEventsService,
  ) {}

  buildTitle(modalidad: Modalidad, gameDate: string, startTime: string): string {
    const date = new Date(gameDate + 'T00:00:00');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `Volley Ingenio ${MODALIDAD_LABEL[modalidad]} ${day}/${month}/${year} ${startTime}pm`;
  }

  async create(dto: CreateGameDto, actorId: string) {
    const startTime = dto.startTime ?? '19:50';
    const title = dto.customTitle?.trim() || this.buildTitle(dto.modalidad, dto.gameDate, startTime);
    const maxMainSpots = dto.maxMainSpots ?? DEFAULT_SPOTS[dto.modalidad];

    const registrationOpenTime = dto.registrationOpenTime ?? '10:00';
    const registrationOpenAt = new Date(`${dto.gameDate}T${registrationOpenTime}:00-05:00`);

    const now = new Date();
    const initialStatus =
      registrationOpenAt <= now ? GameStatus.registration_open : GameStatus.scheduled;

    const game = await this.prisma.game.create({
      data: {
        title,
        modalidad: dto.modalidad,
        gameDate: new Date(dto.gameDate + 'T00:00:00'),
        startTime,
        registrationOpenAt,
        maxMainSpots,
        pricePerPlayer: dto.pricePerPlayer ?? 2000,
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

    return game;
  }

  async findAll(role: Role, filters?: { status?: GameStatus; modalidad?: Modalidad }) {
    if (role !== Role.admin) {
      const active = await this.prisma.game.findFirst({
        where: {
          status: { in: [GameStatus.registration_open, GameStatus.in_progress] },
        },
        include: { registrations: { include: REGISTRATION_INCLUDE, orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return active ? [active] : [];
    }

    return this.prisma.game.findMany({
      where: {
        status: filters?.status,
        modalidad: filters?.modalidad,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { registrations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  async register(gameId: string, userId: string, registeredById: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const game = await tx.$queryRaw<Array<{ id: string; status: string; maxMainSpots: number }>>`
          SELECT id, status, "maxMainSpots" FROM games WHERE id = ${gameId} FOR UPDATE
        `;

        if (!game.length) throw new NotFoundException('Partido no encontrado');

        const g = game[0];
        if (g.status !== 'registration_open' && g.status !== 'in_progress') {
          throw new BadRequestException('El registro para este partido no está abierto');
        }

        const existing = await tx.gameRegistration.findUnique({
          where: { gameId_userId: { gameId, userId } },
        });
        if (existing) {
          throw new ConflictException('Ya estás anotado en este partido');
        }

        const mainCount = await tx.gameRegistration.count({
          where: { gameId, isWaitingList: false },
        });
        const isWaitingList = mainCount >= g.maxMainSpots;

        const maxPositionResult = await tx.gameRegistration.aggregate({
          where: { gameId, isWaitingList },
          _max: { position: true },
        });
        const nextPosition = (maxPositionResult._max.position ?? 0) + 1;

        const registration = await tx.gameRegistration.create({
          data: {
            gameId,
            userId,
            position: nextPosition,
            isWaitingList,
            registeredAt: new Date(),
            registeredById,
          },
          include: REGISTRATION_INCLUDE,
        });

        return registration;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async removeRegistration(gameId: string, userId: string, actorId: string, actorRole: Role) {
    const reg = await this.prisma.gameRegistration.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    if (!reg) throw new NotFoundException('Registro no encontrado');

    if (actorRole !== Role.admin && actorId !== userId) {
      throw new ForbiddenException('No puedes eliminar a otro jugador');
    }

    await this.prisma.gameRegistration.delete({
      where: { id: reg.id },
    });

    await this.audit.log({
      gameId,
      actorId,
      targetUserId: userId,
      action: 'player_removed',
      details: { position: reg.position, wasWaiting: reg.isWaitingList },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });
    return updated;
  }

  async updateRegistration(regId: string, dto: UpdateRegistrationDto, actorId: string, gameId: string) {
    const reg = await this.prisma.gameRegistration.findUnique({ where: { id: regId } });
    if (!reg) throw new NotFoundException('Registro no encontrado');

    const updated = await this.prisma.gameRegistration.update({
      where: { id: regId },
      data: dto,
      include: REGISTRATION_INCLUDE,
    });

    if (dto.attended !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId,
        action: 'attendance_toggled',
        details: { attended: dto.attended },
      });
    }
    if (dto.paid !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId,
        action: 'payment_toggled',
        details: { paid: dto.paid },
      });
    }
    if (dto.note !== undefined) {
      await this.audit.log({
        gameId,
        actorId,
        targetUserId: reg.userId,
        action: 'note_updated',
        details: { note: dto.note },
      });
    }

    const fullGame = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: fullGame });
    return updated;
  }

  async promote(gameId: string, regId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
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

      const promoted = await tx.gameRegistration.update({
        where: { id: regId },
        data: {
          isWaitingList: false,
          position: (maxPos._max.position ?? 0) + 1,
          fromWaitList: true,
        },
        include: REGISTRATION_INCLUDE,
      });

      await this.audit.log({
        gameId,
        actorId,
        targetUserId: promoted.userId,
        action: 'player_promoted',
        details: { newPosition: promoted.position },
      });

      return promoted;
    });
  }

  async reorder(gameId: string, dto: ReorderDto, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;

      for (let i = 0; i < dto.mainList.length; i++) {
        await tx.gameRegistration.update({
          where: { id: dto.mainList[i] },
          data: { position: i + 1, isWaitingList: false },
        });
      }
      for (let i = 0; i < dto.waitList.length; i++) {
        await tx.gameRegistration.update({
          where: { id: dto.waitList[i] },
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
    return updated;
  }

  async complete(gameId: string, actorId: string) {
    const game = await this.findOne(gameId);

    if (game.status === GameStatus.completed) {
      throw new BadRequestException('Este partido ya está completado');
    }
    if (game.status === GameStatus.cancelled) {
      throw new BadRequestException('No se puede completar un partido cancelado');
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: { status: GameStatus.completed },
    });

    await this.audit.log({
      gameId,
      actorId,
      action: 'game_completed',
      details: {},
    });

    this.events.emit({ gameId, type: 'status_change', data: { status: GameStatus.completed } });
    return { game: updated, report: this.generateReport(game) };
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
    const mainList = game.registrations.filter((r) => !r.isWaitingList);
    const waitList = game.registrations.filter((r) => r.isWaitingList);

    const attended = mainList.filter((r) => r.attended);
    const paidMain = mainList.filter((r) => r.paid);
    const paidWait = waitList.filter((r) => r.paid);
    const totalPaid = paidMain.length + paidWait.length;
    const recaudado = totalPaid * game.pricePerPlayer;

    const lines: string[] = [`📋 *${game.title}*`, ''];

    if (mainList.length > 0) {
      lines.push('*Lista Principal:*');
      mainList.forEach((r, i) => {
        const check = r.attended ? '✅' : '❌';
        const paid = r.paid ? '💰' : '';
        lines.push(`${i + 1}. ${r.user.name} ${check}${paid}`);
      });
    }

    if (waitList.length > 0) {
      lines.push('', '*Lista de Espera:*');
      waitList.forEach((r, i) => {
        const check = r.attended ? '✅' : '❌';
        const paid = r.paid ? '💰' : '';
        lines.push(`${i + 1}. ${r.user.name} ${check}${paid}`);
      });
    }

    lines.push('');
    lines.push(`*Asistencia:* ${attended.length}/${mainList.length}`);
    lines.push(`*Pagaron:* ${totalPaid} jugadores`);
    lines.push(`*Recaudado:* $${recaudado.toLocaleString('es-CO')}`);

    return lines.join('\n');
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
        lines.push(`${i + 1}. ${r.user.name}`);
      });
    }

    if (waitList.length > 0) {
      lines.push('', `*Lista de Espera (${waitList.length}):*`);
      waitList.forEach((r, i) => {
        lines.push(`${i + 1}. ${r.user.name}`);
      });
    }

    if (mainList.length === 0) {
      lines.push('_Sin anotados aún_');
    }

    return lines.join('\n');
  }
}
