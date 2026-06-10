import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto } from './dto/create-order.dto';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  order: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };

function camisetaItem(overrides: Partial<CreateOrderDto['items'][number]> = {}) {
  return { productId: 'camiseta', variantId: 'local', size: 'M', quantity: 1, ...overrides } as CreateOrderDto['items'][number];
}

function pantalonetaItem(overrides: Partial<CreateOrderDto['items'][number]> = {}) {
  return { productId: 'pantaloneta', variantId: 'estandar', size: 'L', quantity: 1, ...overrides } as CreateOrderDto['items'][number];
}

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAudit.log.mockResolvedValue(undefined);
    mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Juan', gender: Gender.masculino });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.order.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: 'o1', items: [], ...(data as object) }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ─── getCatalog ──────────────────────────────────────────────────────────

  describe('getCatalog', () => {
    it('devuelve productos camiseta y pantaloneta', () => {
      const ids = service.getCatalog().map((p) => p.id);
      expect(ids).toContain('camiseta');
      expect(ids).toContain('pantaloneta');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create('bad', { shirtNumber: 7, items: [camisetaItem()] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si pide camiseta sin número', async () => {
      await expect(
        service.create('u1', { items: [camisetaItem()] }),
      ).rejects.toThrow('número de camiseta');
    });

    it('lanza BadRequestException con producto inválido', async () => {
      await expect(
        service.create('u1', { shirtNumber: 7, items: [camisetaItem({ productId: 'gorra' })] }),
      ).rejects.toThrow('Producto inválido');
    });

    it('lanza BadRequestException con variante inválida', async () => {
      await expect(
        service.create('u1', { shirtNumber: 7, items: [camisetaItem({ variantId: 'dorada' })] }),
      ).rejects.toThrow('Variante inválida');
    });

    it('lanza BadRequestException si falta la talla', async () => {
      await expect(
        service.create('u1', { shirtNumber: 7, items: [camisetaItem({ size: undefined })] }),
      ).rejects.toThrow('talla');
    });

    it('calcula el total sumando los items', async () => {
      await service.create('u1', {
        shirtNumber: 7,
        items: [camisetaItem(), pantalonetaItem({ quantity: 2 })],
      });
      // camiseta 55000 * 1 + pantaloneta 40000 * 2 = 135000
      expect(mockPrisma.order.create.mock.calls[0][0].data.totalAmount).toBe(135000);
    });

    it('snapshotea el número en todos los items que lo requieren', async () => {
      await service.create('u1', {
        shirtNumber: 7,
        items: [camisetaItem(), pantalonetaItem()],
      });
      const items = mockPrisma.order.create.mock.calls[0][0].data.items.create;
      const camiseta = items.find((i: { productId: string }) => i.productId === 'camiseta');
      const pantaloneta = items.find((i: { productId: string }) => i.productId === 'pantaloneta');
      expect(camiseta.customNumber).toBe(7);
      expect(pantaloneta.customNumber).toBe(7);
    });

    it('usa el nombre del usuario como nombre impreso por defecto', async () => {
      await service.create('u1', { shirtNumber: 7, items: [camisetaItem()] });
      const item = mockPrisma.order.create.mock.calls[0][0].data.items.create[0];
      expect(item.customName).toBe('Juan');
    });

    it('respeta el nombre personalizado', async () => {
      await service.create('u1', { shirtNumber: 7, items: [camisetaItem({ customName: 'ZURDO' })] });
      const item = mockPrisma.order.create.mock.calls[0][0].data.items.create[0];
      expect(item.customName).toBe('ZURDO');
    });

    it('guarda talla y número en el perfil', async () => {
      await service.create('u1', { shirtNumber: 9, items: [camisetaItem({ size: 'L' })] });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { shirtSize: 'L', shirtNumber: 9 } }),
      );
    });

    it('lanza BadRequestException si pide pantaloneta sin número', async () => {
      await expect(
        service.create('u1', { items: [pantalonetaItem()] }),
      ).rejects.toThrow('número de camiseta');
    });

    it('actualiza el número en el perfil al pedir pantaloneta', async () => {
      await service.create('u1', { shirtNumber: 5, items: [pantalonetaItem({ size: 'L' })] });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shirtNumber: 5 }) }),
      );
    });

    it('llama a audit.log con "order_created"', async () => {
      await service.create('u1', { shirtNumber: 7, items: [camisetaItem()] });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order_created' }),
      );
    });

    // ─── unicidad de número por sexo ───────────────────────────────────────

    it('lanza ConflictException si el número está tomado en su categoría', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other', name: 'Pedro' });
      await expect(
        service.create('u1', { shirtNumber: 7, items: [camisetaItem()] }),
      ).rejects.toThrow(ConflictException);
    });

    it('agrupa "otro" con masculino al validar unicidad', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Alex', gender: Gender.otro });
      await service.create('u1', { shirtNumber: 7, items: [camisetaItem()] });
      const where = mockPrisma.user.findFirst.mock.calls[0][0].where;
      expect(where.gender.in).toEqual(expect.arrayContaining([Gender.masculino, Gender.otro]));
      expect(where.gender.in).not.toContain(Gender.femenino);
    });

    it('usa solo femenino para usuarias', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', gender: Gender.femenino });
      await service.create('u1', { shirtNumber: 7, items: [camisetaItem()] });
      const where = mockPrisma.user.findFirst.mock.calls[0][0].where;
      expect(where.gender.in).toEqual([Gender.femenino]);
    });

    it('permite el mismo número en distinto sexo (no consulta colisión cruzada)', async () => {
      // El número 7 de un hombre no debe bloquear el 7 de una mujer:
      // la consulta de la mujer filtra solo por femenino.
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'ana', name: 'Ana', gender: Gender.femenino });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.create('ana', { shirtNumber: 7, items: [camisetaItem()] }),
      ).resolves.toBeDefined();
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('lanza NotFoundException si el pedido no existe', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('bad', { status: 'paid' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('actualiza el estado y audita', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1' });
      mockPrisma.order.update.mockResolvedValue({ id: 'o1', status: 'paid' });

      await service.updateStatus('o1', { status: 'paid' }, 'admin-1');

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1' }, data: { status: 'paid' } }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order_status_changed' }),
      );
    });
  });

  // ─── findMine / findAll ──────────────────────────────────────────────────

  describe('findMine', () => {
    it('filtra por el usuario actual', () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      service.findMine('u1');
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });
  });

  describe('findAll', () => {
    it('filtra por estado cuando se provee', () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      service.findAll('pending');
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' } }),
      );
    });

    it('sin estado devuelve todos', () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      service.findAll();
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });
});
