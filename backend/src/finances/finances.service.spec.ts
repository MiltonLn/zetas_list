import { Test, TestingModule } from '@nestjs/testing';
import { FinancesService } from './finances.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, FineStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

const mockPrisma = {
  financeTransaction: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  fine: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
};

describe('FinancesService', () => {
  let service: FinancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FinancesService>(FinancesService);
    jest.clearAllMocks();
  });

  // ─── getDashboard ───────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('calcula el balance correctamente: entradas + multas pagadas - gastos', async () => {
      mockPrisma.financeTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // income
        .mockResolvedValueOnce({ _sum: { amount: 200000 } }); // expense
      mockPrisma.fine.aggregate.mockResolvedValueOnce({ _sum: { amount: 50000 } }); // paid fines
      mockPrisma.fine.findMany.mockResolvedValueOnce([]);

      const result = await service.getDashboard(2026);

      expect(result.balance).toBe(350000); // 500k + 50k - 200k
      expect(result.totalIncome).toBe(500000);
      expect(result.totalExpenses).toBe(200000);
      expect(result.totalFinesPaid).toBe(50000);
    });

    it('retorna 0 cuando no hay datos', async () => {
      mockPrisma.financeTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });
      mockPrisma.fine.aggregate.mockResolvedValueOnce({ _sum: { amount: null } });
      mockPrisma.fine.findMany.mockResolvedValueOnce([]);

      const result = await service.getDashboard(2026);

      expect(result.balance).toBe(0);
    });

    it('incluye multas pendientes en el resultado', async () => {
      mockPrisma.financeTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });
      mockPrisma.fine.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      mockPrisma.fine.findMany.mockResolvedValueOnce([
        { id: 'f1', userId: 'u1', amount: 5000, reason: 'Inasistencia', date: new Date(), user: { id: 'u1', name: 'Juan', phone: '123' } },
      ]);

      const result = await service.getDashboard(2026);

      expect(result.pendingFines).toHaveLength(1);
      expect(result.pendingFines[0].userName).toBe('Juan');
    });
  });

  // ─── Transactions CRUD ──────────────────────────────────────────────────────

  describe('createTransaction', () => {
    it('crea una transacción con los datos correctos', async () => {
      const dto = { type: TransactionType.expense, date: '2026-01-18', amount: 12000, description: 'Candado' };
      mockPrisma.financeTransaction.create.mockResolvedValue({ id: 'tx1', ...dto });

      const result = await service.createTransaction(dto, 'actor-1');

      expect(mockPrisma.financeTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'expense', amount: 12000, description: 'Candado', createdById: 'actor-1' }),
      });
      expect(result.id).toBe('tx1');
    });
  });

  describe('updateTransaction', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.financeTransaction.findUnique.mockResolvedValue(null);
      await expect(service.updateTransaction('bad-id', { amount: 100 }, 'a')).rejects.toThrow(NotFoundException);
    });

    it('actualiza campos proporcionados', async () => {
      mockPrisma.financeTransaction.findUnique.mockResolvedValue({ id: 'tx1' });
      mockPrisma.financeTransaction.update.mockResolvedValue({ id: 'tx1', amount: 20000 });

      await service.updateTransaction('tx1', { amount: 20000 }, 'a');

      expect(mockPrisma.financeTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'tx1' },
        data: expect.objectContaining({ amount: 20000 }),
      }));
    });
  });

  describe('deleteTransaction', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.financeTransaction.findUnique.mockResolvedValue(null);
      await expect(service.deleteTransaction('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('elimina la transacción', async () => {
      mockPrisma.financeTransaction.findUnique.mockResolvedValue({ id: 'tx1' });
      mockPrisma.financeTransaction.delete.mockResolvedValue({ id: 'tx1' });

      await service.deleteTransaction('tx1');

      expect(mockPrisma.financeTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx1' } });
    });
  });

  // ─── Fines CRUD ─────────────────────────────────────────────────────────────

  describe('createFine', () => {
    it('crea multa con status pending por defecto', async () => {
      const dto = { userId: 'u1', date: '2026-01-17', amount: 5000, reason: 'Inasistencia' };
      mockPrisma.fine.create.mockResolvedValue({ id: 'f1', ...dto, status: 'pending' });

      await service.createFine(dto, 'actor-1');

      expect(mockPrisma.fine.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', amount: 5000, status: 'pending' }),
      }));
    });

    it('establece paidAt cuando status es paid', async () => {
      const dto = { userId: 'u1', date: '2026-01-17', amount: 5000, reason: 'Inasistencia', status: FineStatus.paid };
      mockPrisma.fine.create.mockResolvedValue({ id: 'f1', ...dto });

      await service.createFine(dto, 'actor-1');

      expect(mockPrisma.fine.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'paid', paidAt: expect.any(Date) }),
      }));
    });
  });

  describe('updateFine', () => {
    it('marca como pagada y establece paidAt', async () => {
      mockPrisma.fine.findUnique.mockResolvedValue({ id: 'f1', status: 'pending' });
      mockPrisma.fine.update.mockResolvedValue({ id: 'f1', status: 'paid' });

      await service.updateFine('f1', { status: FineStatus.paid }, 'a');

      expect(mockPrisma.fine.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'paid', paidAt: expect.any(Date) }),
      }));
    });

    it('limpia paidAt cuando se marca como pending', async () => {
      mockPrisma.fine.findUnique.mockResolvedValue({ id: 'f1', status: 'paid' });
      mockPrisma.fine.update.mockResolvedValue({ id: 'f1', status: 'pending' });

      await service.updateFine('f1', { status: FineStatus.pending }, 'a');

      expect(mockPrisma.fine.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', paidAt: null }),
      }));
    });
  });

  // ─── hasUnpaidFines ─────────────────────────────────────────────────────────

  describe('hasUnpaidFines', () => {
    it('retorna true cuando hay multas pendientes', async () => {
      mockPrisma.fine.count.mockResolvedValue(2);
      expect(await service.hasUnpaidFines('u1')).toBe(true);
    });

    it('retorna false cuando no hay multas pendientes', async () => {
      mockPrisma.fine.count.mockResolvedValue(0);
      expect(await service.hasUnpaidFines('u1')).toBe(false);
    });
  });

  // ─── Game integration ──────────────────────────────────────────────────────

  describe('createGameFines', () => {
    it('crea multas solo para registros con userId', async () => {
      const regs = [
        { id: 'r1', userId: 'u1', guestName: null },
        { id: 'r2', userId: null, guestName: 'Invitado' },
        { id: 'r3', userId: 'u2', guestName: null },
      ];
      mockPrisma.fine.createMany.mockResolvedValue({ count: 2 });

      await service.createGameFines('g1', regs, 5000, 'actor-1');

      expect(mockPrisma.fine.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', amount: 5000, reason: 'Inasistencia' }),
          expect.objectContaining({ userId: 'u2', amount: 5000, reason: 'Inasistencia' }),
        ]),
      });
      const callData = mockPrisma.fine.createMany.mock.calls[0][0].data;
      expect(callData).toHaveLength(2);
    });
  });

  describe('createGameDebts', () => {
    it('crea deudas con monto igual a pricePerPlayer', async () => {
      const regs = [{ id: 'r1', userId: 'u1', guestName: null }];
      mockPrisma.fine.createMany.mockResolvedValue({ count: 1 });

      await service.createGameDebts('g1', regs, 2000, 'actor-1');

      expect(mockPrisma.fine.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ userId: 'u1', amount: 2000, reason: 'No pagó' })],
      });
    });
  });

  describe('createGameIncome', () => {
    it('crea entrada de tipo income vinculada al partido', async () => {
      mockPrisma.financeTransaction.create.mockResolvedValue({ id: 'tx1' });

      await service.createGameIncome('g1', 30000, new Date('2026-05-15'), 'actor-1');

      expect(mockPrisma.financeTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'income',
          amount: 30000,
          gameId: 'g1',
          description: 'Ingreso neto del partido',
        }),
      });
    });
  });

  // ─── Import ─────────────────────────────────────────────────────────────────

  describe('importData', () => {
    it('importa transacciones y multas correctamente', async () => {
      mockPrisma.financeTransaction.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', phone: '573166160159' });
      mockPrisma.fine.create.mockResolvedValue({ id: 'f1' });

      const dto = {
        transactions: [{ type: TransactionType.expense, date: '2026-01-18', amount: 12000, description: 'Test' }],
        fines: [{ userPhone: '573166160159', date: '2026-01-17', amount: 5000, reason: 'Inasistencia', status: FineStatus.paid }],
      };

      const result = await service.importData(dto, 'actor-1');

      expect(result.transactionsCreated).toBe(1);
      expect(result.finesCreated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('reporta errores para usuarios no encontrados', async () => {
      mockPrisma.financeTransaction.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const dto = {
        transactions: [],
        fines: [{ userPhone: '9999999', date: '2026-01-17', amount: 5000, reason: 'Test' }],
      };

      const result = await service.importData(dto, 'actor-1');

      expect(result.finesCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('9999999');
    });
  });
});
