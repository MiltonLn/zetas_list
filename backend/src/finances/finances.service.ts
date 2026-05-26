import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TransactionType, FineStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, UpdateTransactionDto, CreateFineDto, UpdateFineDto, ImportFinancesDto } from './dto';

@Injectable()
export class FinancesService {
  private readonly logger = new Logger(FinancesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── DASHBOARD ──────────────────────────────────────────────────────────────

  async getDashboard(year: number) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year + 1}-01-01`);
    const dateFilter = { gte: startDate, lt: endDate };

    const [incomeAgg, expenseAgg, finesPaidAgg, pendingFines] = await Promise.all([
      this.prisma.financeTransaction.aggregate({
        where: { type: TransactionType.income, date: dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.financeTransaction.aggregate({
        where: { type: TransactionType.expense, date: dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.fine.aggregate({
        where: { status: FineStatus.paid, date: dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.fine.findMany({
        where: { status: FineStatus.pending },
        include: { user: { select: { id: true, name: true, phone: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const totalIncome = incomeAgg._sum.amount ?? 0;
    const totalExpenses = expenseAgg._sum.amount ?? 0;
    const totalFinesPaid = finesPaidAgg._sum.amount ?? 0;
    const balance = totalIncome + totalFinesPaid - totalExpenses;

    return {
      year,
      balance,
      totalIncome,
      totalExpenses,
      totalFinesPaid,
      pendingFines: pendingFines.map((f) => ({
        id: f.id,
        userId: f.userId,
        userName: f.user?.name ?? f.userName ?? 'Sin asignar',
        amount: f.amount,
        reason: f.reason,
        date: f.date,
      })),
    };
  }

  // ─── TRANSACTIONS CRUD ──────────────────────────────────────────────────────

  async getTransactions(year: number, type?: TransactionType) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year + 1}-01-01`);

    return this.prisma.financeTransaction.findMany({
      where: {
        date: { gte: startDate, lt: endDate },
        ...(type ? { type } : {}),
      },
      orderBy: { date: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async createTransaction(dto: CreateTransactionDto, actorId: string) {
    return this.prisma.financeTransaction.create({
      data: {
        type: dto.type,
        date: new Date(dto.date),
        amount: dto.amount,
        description: dto.description,
        gameId: dto.gameId ?? null,
        createdById: actorId,
      },
    });
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto, _actorId: string) {
    const existing = await this.prisma.financeTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Transacción no encontrada');

    return this.prisma.financeTransaction.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async deleteTransaction(id: string) {
    const existing = await this.prisma.financeTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Transacción no encontrada');

    return this.prisma.financeTransaction.delete({ where: { id } });
  }

  // ─── FINES CRUD ─────────────────────────────────────────────────────────────

  async getFines(year: number, status?: FineStatus) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year + 1}-01-01`);

    return this.prisma.fine.findMany({
      where: {
        date: { gte: startDate, lt: endDate },
        ...(status ? { status } : {}),
      },
      orderBy: { date: 'desc' },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async createFine(dto: CreateFineDto, actorId: string) {
    return this.prisma.fine.create({
      data: {
        userId: dto.userId,
        date: new Date(dto.date),
        amount: dto.amount,
        reason: dto.reason,
        status: dto.status ?? FineStatus.pending,
        gameId: dto.gameId ?? null,
        gameRegistrationId: dto.gameRegistrationId ?? null,
        createdById: actorId,
        ...(dto.status === FineStatus.paid ? { paidAt: new Date() } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async updateFine(id: string, dto: UpdateFineDto, _actorId: string) {
    const existing = await this.prisma.fine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Multa no encontrada');

    const data: Record<string, unknown> = {};
    if (dto.userId !== undefined) data.userId = dto.userId;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === FineStatus.paid && existing.status !== FineStatus.paid) {
        data.paidAt = new Date();
      }
      if (dto.status === FineStatus.pending) {
        data.paidAt = null;
      }
    }

    return this.prisma.fine.update({
      where: { id },
      data,
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async deleteFine(id: string) {
    const existing = await this.prisma.fine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Multa no encontrada');

    return this.prisma.fine.delete({ where: { id } });
  }

  // ─── GAME INTEGRATION ──────────────────────────────────────────────────────

  async createGameFines(
    gameId: string,
    registrations: { id: string; userId: string | null; guestName?: string | null }[],
    fineAmount: number,
    actorId: string,
  ) {
    const fines = registrations
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId!,
        date: new Date(),
        amount: fineAmount,
        reason: 'Inasistencia',
        status: FineStatus.pending,
        gameId,
        gameRegistrationId: r.id,
        createdById: actorId,
        updatedAt: new Date(),
      }));

    if (fines.length > 0) {
      await this.prisma.fine.createMany({ data: fines });
      this.logger.log(`[GAME_FINES] Created ${fines.length} fines for game ${gameId}`);
    }
  }

  async createGameDebts(
    gameId: string,
    registrations: { id: string; userId: string | null; guestName?: string | null }[],
    pricePerPlayer: number,
    actorId: string,
  ) {
    const debts = registrations
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId!,
        date: new Date(),
        amount: pricePerPlayer,
        reason: 'No pagó',
        status: FineStatus.pending,
        gameId,
        gameRegistrationId: r.id,
        createdById: actorId,
        updatedAt: new Date(),
      }));

    if (debts.length > 0) {
      await this.prisma.fine.createMany({ data: debts });
      this.logger.log(`[GAME_DEBTS] Created ${debts.length} debts for game ${gameId}`);
    }
  }

  async createGameIncome(gameId: string, netAmount: number, gameDate: Date | string, actorId: string) {
    await this.prisma.financeTransaction.create({
      data: {
        type: TransactionType.income,
        date: new Date(gameDate),
        amount: netAmount,
        description: 'Ingreso neto del partido',
        gameId,
        createdById: actorId,
      },
    });
    this.logger.log(`[GAME_INCOME] Created income of $${netAmount} for game ${gameId}`);
  }

  // ─── REGISTRATION BLOCKING ─────────────────────────────────────────────────

  async hasUnpaidFines(userId: string): Promise<boolean> {
    const count = await this.prisma.fine.count({
      where: { userId, status: FineStatus.pending },
    });
    return count > 0;
  }

  // ─── PENDING FINES (for bot command) ───────────────────────────────────────

  async getPendingFines() {
    return this.prisma.fine.findMany({
      where: { status: FineStatus.pending },
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { date: 'asc' },
    });
  }

  async getUserPendingFines(userId: string) {
    const fines = await this.prisma.fine.findMany({
      where: { userId, status: FineStatus.pending },
    });
    const total = fines.reduce((sum, f) => sum + f.amount, 0);
    return { fines, total };
  }

  // ─── IMPORT ────────────────────────────────────────────────────────────────

  async importData(dto: ImportFinancesDto, actorId: string) {
    const errors: string[] = [];
    let transactionsCreated = 0;
    let finesCreated = 0;

    if (dto.transactions.length > 0) {
      const txData = dto.transactions.map((t) => ({
        type: t.type,
        date: new Date(t.date),
        amount: t.amount,
        description: t.description,
        createdById: actorId,
        updatedAt: new Date(),
      }));
      const result = await this.prisma.financeTransaction.createMany({ data: txData });
      transactionsCreated = result.count;
    }

    for (const fineItem of dto.fines) {
      let userId: string | null = null;
      let displayName: string | null = fineItem.userName ?? null;

      if (fineItem.userPhone) {
        const user = await this.prisma.user.findFirst({
          where: {
            OR: [{ phone: fineItem.userPhone }, { username: fineItem.userPhone }],
          },
        });

        if (user) {
          userId = user.id;
          displayName = displayName ?? user.name;
        } else {
          errors.push(`Usuario no encontrado: ${fineItem.userPhone} (multa creada sin vincular)`);
        }
      }

      await this.prisma.fine.create({
        data: {
          userId: userId ?? undefined,
          userName: displayName ?? undefined,
          date: new Date(fineItem.date),
          amount: fineItem.amount,
          reason: fineItem.reason,
          status: fineItem.status ?? FineStatus.pending,
          paidAt: fineItem.status === FineStatus.paid ? new Date(fineItem.date) : null,
          createdById: actorId,
        },
      });
      finesCreated++;
    }

    this.logger.log(`[IMPORT] transactions=${transactionsCreated} fines=${finesCreated} errors=${errors.length}`);
    return { transactionsCreated, finesCreated, errors };
  }
}
