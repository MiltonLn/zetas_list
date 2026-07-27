import { Injectable } from '@nestjs/common';
import { GameStatus, Modalidad, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GameNotFoundException } from './exceptions';
import { ACTIVE_GAME_STATUSES, REGISTRATION_INCLUDE } from './games.utils';

/**
 * Read-only access to games. Lives apart from the mutating services so those
 * can share it without depending on each other.
 */
@Injectable()
export class GameQueryService {
  constructor(private prisma: PrismaService) {}

  /**
   * The one game people can currently act on, with its registrations ordered as
   * they appear in the list. Sole owner of this query: the WhatsApp handler used
   * to keep its own copy with a narrower `include`, which is how it silently
   * missed the `alias` field.
   */
  async findActiveGame() {
    return this.prisma.game.findFirst({
      where: { status: { in: [...ACTIVE_GAME_STATUSES] } },
      include: {
        registrations: {
          include: REGISTRATION_INCLUDE,
          orderBy: [{ isWaitingList: 'asc' }, { position: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
      const active = await this.findActiveGame();
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
}
