import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  gameId?: string;
  actorId?: string | null;
  targetUserId?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: AuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        gameId: params.gameId,
        actorId: params.actorId,
        targetUserId: params.targetUserId,
        action: params.action,
        details: (params.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findByGame(gameId: string) {
    return this.prisma.auditLog.findMany({
      where: { gameId },
      include: {
        actor: { select: { id: true, name: true, username: true } },
        targetUser: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
