import * as request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { FineStatus, OrderStatus, Role, TransactionType, UserStatus } from '@prisma/client';
import { FinancesController } from '../../finances/finances.controller';
import { FinancesService } from '../../finances/finances.service';
import { HealthController } from '../../health.controller';
import { OrdersController } from '../../orders/orders.controller';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersController } from '../../users/users.controller';
import { UsersService } from '../../users/users.service';
import { createTestApp, makePrismaMock, type TestUser } from './test-app';

function makeUser(id: string, role: Role): TestUser {
  return {
    id,
    username: id,
    name: id,
    role,
    status: 'active',
    phone: role === Role.admin ? '573000000001' : '573000000002',
    position: null,
    gender: null,
    photoUrl: null,
    mustChangePassword: false,
  };
}

const USERS = [makeUser('admin-1', Role.admin), makeUser('member-1', Role.member)];
const VALID_ORDER = {
  shirtNumber: 7,
  items: [{ productId: 'camiseta', variantId: 'local', size: 'M', quantity: 1 }],
};
const VALID_USER = { name: 'Nueva Jugadora', phone: '573001234567' };
const VALID_TRANSACTION = {
  type: TransactionType.income,
  date: '2026-07-27',
  amount: 12000,
  description: 'Cuota',
};
const VALID_FINE = {
  userId: 'member-1',
  date: '2026-07-27',
  amount: 5000,
  reason: 'Inasistencia',
};

describe('Core controllers (HTTP)', () => {
  let app: NestExpressApplication;
  let token: (id: string) => string;
  let orders: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let finances: Record<string, jest.Mock>;

  beforeEach(async () => {
    orders = {
      getCatalog: jest.fn().mockReturnValue([{ id: 'camiseta' }]),
      findMine: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      create: jest.fn().mockResolvedValue({ id: 'order-1' }),
      findAll: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      adminCreate: jest.fn().mockResolvedValue({ id: 'order-2' }),
      update: jest.fn().mockResolvedValue({ id: 'order-1', notes: 'Actualizada' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'order-1', status: OrderStatus.deposit_paid }),
    };
    users = {
      findAll: jest.fn().mockResolvedValue(USERS),
      create: jest.fn().mockResolvedValue({ id: 'user-2', ...VALID_USER }),
      findOne: jest.fn().mockImplementation((id: string) =>
        Promise.resolve(USERS.find((user) => user.id === id)),
      ),
      update: jest.fn().mockResolvedValue({ id: 'member-1', name: 'Actualizada' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'member-1', status: UserStatus.inactive }),
      resetPassword: jest.fn().mockResolvedValue({ message: 'Contraseña restablecida' }),
      updateRole: jest.fn().mockResolvedValue({ id: 'member-1', role: Role.ayudante }),
    };
    finances = {
      getDashboard: jest.fn().mockResolvedValue({ year: 2025, balance: 12000 }),
      getTransactions: jest.fn().mockResolvedValue([]),
      getFines: jest.fn().mockResolvedValue([]),
      getUserPendingFines: jest.fn().mockResolvedValue({ fines: [], total: 0 }),
      createTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      updateTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      deleteTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      createFine: jest.fn().mockResolvedValue({ id: 'fine-1' }),
      updateFine: jest.fn().mockResolvedValue({ id: 'fine-1' }),
      deleteFine: jest.fn().mockResolvedValue({ id: 'fine-1' }),
      importData: jest.fn().mockResolvedValue({
        transactionsCreated: 0,
        finesCreated: 0,
        errors: [],
      }),
    };

    const created = await createTestApp({
      controllers: [HealthController, OrdersController, UsersController, FinancesController],
      providers: [
        { provide: OrdersService, useValue: orders },
        { provide: UsersService, useValue: users },
        { provide: FinancesService, useValue: finances },
        { provide: PrismaService, useValue: makePrismaMock(USERS) },
      ],
    });
    app = created.app;
    token = (id) => created.tokenFor(USERS.find((user) => user.id === id)!);
  });

  afterEach(async () => {
    await app?.close();
  });

  const authenticated = (method: 'get' | 'post' | 'patch' | 'delete', path: string, id: string) =>
    request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token(id)}`);

  it('expone el health check fuera del prefijo /api', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it.each(['/api/orders/catalog', '/api/users/me', '/api/finances/dashboard'])(
    'protege %s sin token',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );

  it('permite consultar catálogo, pedidos propios y crear un pedido', async () => {
    await authenticated('get', '/api/orders/catalog', 'member-1').expect(200);
    await authenticated('get', '/api/orders/me', 'member-1').expect(200);
    await authenticated('post', '/api/orders', 'member-1').send(VALID_ORDER).expect(201);

    expect(orders.getCatalog).toHaveBeenCalled();
    expect(orders.findMine).toHaveBeenCalledWith('member-1');
    expect(orders.create).toHaveBeenCalledWith('member-1', expect.objectContaining(VALID_ORDER));
  });

  it('rechaza pedidos inválidos antes de llamar al servicio', async () => {
    await authenticated('post', '/api/orders', 'member-1')
      .send({ items: [{ productId: 'camiseta', variantId: 'local', quantity: 0 }] })
      .expect(400);

    expect(orders.create).not.toHaveBeenCalled();
  });

  it('impide que un miembro use endpoints administrativos de pedidos', async () => {
    await authenticated('get', '/api/orders', 'member-1').expect(403);
    await authenticated('patch', '/api/orders/order-1/status', 'member-1')
      .send({ status: OrderStatus.deposit_paid })
      .expect(403);

    expect(orders.findAll).not.toHaveBeenCalled();
    expect(orders.updateStatus).not.toHaveBeenCalled();
  });

  it('permite al admin listar, crear y actualizar pedidos', async () => {
    await authenticated('get', `/api/orders?status=${OrderStatus.pending}`, 'admin-1').expect(200);
    await authenticated('post', '/api/orders/admin/member-1', 'admin-1')
      .send(VALID_ORDER)
      .expect(201);
    await authenticated('patch', '/api/orders/order-1', 'admin-1')
      .send({ ...VALID_ORDER, notes: 'Actualizada' })
      .expect(200);
    await authenticated('patch', '/api/orders/order-1/status', 'admin-1')
      .send({ status: OrderStatus.deposit_paid })
      .expect(200);

    expect(orders.findAll).toHaveBeenCalledWith(OrderStatus.pending);
    expect(orders.adminCreate).toHaveBeenCalledWith(
      'admin-1',
      'member-1',
      expect.objectContaining(VALID_ORDER),
    );
    expect(orders.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ notes: 'Actualizada' }),
      'admin-1',
    );
    expect(orders.updateStatus).toHaveBeenCalledWith(
      'order-1',
      { status: OrderStatus.deposit_paid },
      'admin-1',
    );
  });

  it('permite a un miembro consultar y actualizar perfiles', async () => {
    await authenticated('get', '/api/users/me', 'member-1').expect(200);
    await authenticated('get', '/api/users/admin-1', 'member-1').expect(200);
    await authenticated('patch', '/api/users/member-1', 'member-1')
      .send({ name: 'Actualizada' })
      .expect(200);

    expect(users.findOne).toHaveBeenCalledWith('member-1');
    expect(users.findOne).toHaveBeenCalledWith('admin-1');
    expect(users.update).toHaveBeenCalledWith(
      'member-1',
      { name: 'Actualizada' },
      'member-1',
      Role.member,
    );
  });

  it('rechaza operaciones administrativas de usuarios para miembros', async () => {
    await authenticated('get', '/api/users', 'member-1').expect(403);
    await authenticated('post', '/api/users', 'member-1').send(VALID_USER).expect(403);

    expect(users.findAll).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('valida la creación de usuarios', async () => {
    await authenticated('post', '/api/users', 'admin-1')
      .send({ name: '', phone: 'abc' })
      .expect(400);

    expect(users.create).not.toHaveBeenCalled();
  });

  it('permite al admin gestionar usuarios', async () => {
    await authenticated('get', '/api/users?search=nueva', 'admin-1').expect(200);
    await authenticated('post', '/api/users', 'admin-1').send(VALID_USER).expect(201);
    await authenticated('patch', '/api/users/member-1/status', 'admin-1')
      .send({ status: UserStatus.inactive })
      .expect(200);
    await authenticated('patch', '/api/users/member-1/reset-password', 'admin-1')
      .send({ newPassword: 'Segura123!' })
      .expect(200);
    await authenticated('patch', '/api/users/member-1/role', 'admin-1')
      .send({ role: Role.ayudante })
      .expect(200);

    expect(users.findAll).toHaveBeenCalledWith('nueva');
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining(VALID_USER), 'admin-1');
    expect(users.updateStatus).toHaveBeenCalledWith(
      'member-1',
      { status: UserStatus.inactive },
      'admin-1',
    );
    expect(users.resetPassword).toHaveBeenCalledWith('member-1', 'Segura123!', 'admin-1');
    expect(users.updateRole).toHaveBeenCalledWith('member-1', Role.ayudante, 'admin-1');
  });

  it('rechaza una foto ausente o que no sea imagen', async () => {
    await authenticated('post', '/api/users/member-1/photo', 'member-1').expect(400);
    await authenticated('post', '/api/users/member-1/photo', 'member-1')
      .attach('file', Buffer.from('texto'), {
        filename: 'archivo.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(users.update).not.toHaveBeenCalled();
  });

  it('permite consultar finanzas y propaga filtros al servicio', async () => {
    await authenticated('get', '/api/finances/dashboard?year=2025', 'member-1').expect(200);
    await authenticated(
      'get',
      `/api/finances/transactions?year=2024&type=${TransactionType.expense}`,
      'member-1',
    ).expect(200);
    await authenticated(
      'get',
      `/api/finances/fines?year=2023&status=${FineStatus.pending}`,
      'member-1',
    ).expect(200);
    await authenticated('get', '/api/finances/my-fines', 'member-1').expect(200);

    expect(finances.getDashboard).toHaveBeenCalledWith(2025);
    expect(finances.getTransactions).toHaveBeenCalledWith(2024, TransactionType.expense);
    expect(finances.getFines).toHaveBeenCalledWith(2023, FineStatus.pending);
    expect(finances.getUserPendingFines).toHaveBeenCalledWith('member-1');
  });

  it('usa el año actual cuando no se especifica en finanzas', async () => {
    await authenticated('get', '/api/finances/dashboard', 'member-1').expect(200);
    await authenticated('get', '/api/finances/transactions', 'member-1').expect(200);
    await authenticated('get', '/api/finances/fines', 'member-1').expect(200);

    const year = new Date().getFullYear();
    expect(finances.getDashboard).toHaveBeenCalledWith(year);
    expect(finances.getTransactions).toHaveBeenCalledWith(year, undefined);
    expect(finances.getFines).toHaveBeenCalledWith(year, undefined);
  });

  it('impide que un miembro modifique finanzas', async () => {
    await authenticated('post', '/api/finances/transactions', 'member-1')
      .send(VALID_TRANSACTION)
      .expect(403);
    await authenticated('delete', '/api/finances/fines/fine-1', 'member-1').expect(403);

    expect(finances.createTransaction).not.toHaveBeenCalled();
    expect(finances.deleteFine).not.toHaveBeenCalled();
  });

  it('valida transacciones antes de llamar al servicio', async () => {
    await authenticated('post', '/api/finances/transactions', 'admin-1')
      .send({ ...VALID_TRANSACTION, amount: 0 })
      .expect(400);

    expect(finances.createTransaction).not.toHaveBeenCalled();
  });

  it('permite al admin gestionar transacciones, multas e importaciones', async () => {
    await authenticated('post', '/api/finances/transactions', 'admin-1')
      .send(VALID_TRANSACTION)
      .expect(201);
    await authenticated('patch', '/api/finances/transactions/tx-1', 'admin-1')
      .send({ description: 'Cuota actualizada' })
      .expect(200);
    await authenticated('delete', '/api/finances/transactions/tx-1', 'admin-1').expect(200);
    await authenticated('post', '/api/finances/fines', 'admin-1').send(VALID_FINE).expect(201);
    await authenticated('patch', '/api/finances/fines/fine-1', 'admin-1')
      .send({ status: FineStatus.paid })
      .expect(200);
    await authenticated('delete', '/api/finances/fines/fine-1', 'admin-1').expect(200);
    await authenticated('post', '/api/finances/import', 'admin-1')
      .send({ transactions: [VALID_TRANSACTION], fines: [] })
      .expect(201);

    expect(finances.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining(VALID_TRANSACTION),
      'admin-1',
    );
    expect(finances.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      { description: 'Cuota actualizada' },
      'admin-1',
    );
    expect(finances.deleteTransaction).toHaveBeenCalledWith('tx-1');
    expect(finances.createFine).toHaveBeenCalledWith(
      expect.objectContaining(VALID_FINE),
      'admin-1',
    );
    expect(finances.updateFine).toHaveBeenCalledWith(
      'fine-1',
      { status: FineStatus.paid },
      'admin-1',
    );
    expect(finances.deleteFine).toHaveBeenCalledWith('fine-1');
    expect(finances.importData).toHaveBeenCalledWith(
      { transactions: [expect.objectContaining(VALID_TRANSACTION)], fines: [] },
      'admin-1',
    );
  });
});
