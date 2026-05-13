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

    const registrationOpenTime = dto.registrationOpenTime ?? '10:00';
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
        pricePerPlayer: dto.pricePerPlayer ?? 2000,
        vigilante: dto.vigilante ?? 10000,
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

        return tx.gameRegistration.create({
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.audit.log({
      gameId,
      actorId: registeredById,
      targetUserId: userId,
      action: 'player_registered',
      details: { position: registration.position, isWaitingList: registration.isWaitingList },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = registration.user?.name || 'Alguien';
    const spot = registration.isWaitingList
      ? `en la *lista de espera* (puesto ${registration.position})`
      : `en la *lista principal* (puesto ${registration.position})`;
    if (!options?.silent) {
      this.whatsapp
        .sendToGroup(`✅ *${userName}* se anotó ${spot}! 🏐\n${this.buildCounts(updated)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

    return registration;
  }

  async removeRegistration(gameId: string, userId: string, actorId: string, actorRole: Role, options?: { silent?: boolean }) {
    const reg = await this.prisma.gameRegistration.findUnique({
      where: { gameId_userId: { gameId, userId } },
      include: { user: { select: { name: true } } },
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

    const userName = reg.user?.name || 'Alguien';
    if (!options?.silent) {
      this.whatsapp
        .sendToGroup(`👋 *${userName}* salió de la lista.\n${this.buildCounts(updated)}`)
        .catch((e) => this.logger.warn('WhatsApp send failed', e));
    }

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

  async promote(gameId: string, regId: string, actorId: string, options?: { silent?: boolean }) {
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
      targetUserId: promoted.userId,
      action: 'player_promoted',
      details: { newPosition: promoted.position },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = promoted.user?.name || 'Alguien';
    if (!options?.silent) {
      this.whatsapp
        .sendToGroup(`⬆️ *${userName}* fue promovido a la *lista principal* 🏐\n${this.buildCounts(updated)}`)
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
    return { updated: updated as any, promotedName: firstInWait.user?.name || 'Alguien' };
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
      targetUserId: demoted.userId,
      action: 'player_demoted',
      details: { newPosition: demoted.position },
    });

    const updated = await this.findOne(gameId);
    this.events.emit({ gameId, type: 'update', data: updated });

    const userName = demoted.user?.name || 'Alguien';
    this.whatsapp
      .sendToGroup(`⬇️ *${userName}* fue movido a la *lista de espera* (puesto ${demoted.position})\n${this.buildCounts(updated)}`)
      .catch((e) => this.logger.warn('WhatsApp send failed', e));

    return updated;
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
        name: r.user.name,
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
      targetUserId: reg.userId,
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
        lines.push(`  • ${r.user.name}`);
      });
    }

    if (noShowPaid.length > 0) {
      lines.push('');
      lines.push(`📌 *Pagaron pero no asistieron:* ${noShowPaid.length}`);
      noShowPaid.forEach((r) => {
        lines.push(`  • ${r.user.name}`);
      });
    }

    const fined = allRegs.filter((r) => !r.attended && !r.isWaitingList && !r.fineExempt);
    if (fined.length > 0) {
      lines.push('');
      lines.push(`❌ *Multados:* ${fined.length}`);
      fined.forEach((r) => {
        lines.push(`  • ${r.user.name}`);
      });
    }

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
