import * as request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { GamesController } from '../../games/games.controller';
import { GamesService } from '../../games/games.service';
import { GameEventsService } from '../../games/game-events.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createTestApp, makePrismaMock, type TestUser } from './test-app';

function makeUser(id: string, role: Role, overrides: Partial<TestUser> = {}): TestUser {
  return {
    id,
    username: id,
    name: id,
    role,
    status: 'active',
    phone: `31600000${id.length}`,
    position: null,
    gender: null,
    photoUrl: null,
    mustChangePassword: false,
    ...overrides,
  };
}

const USERS = [
  makeUser('admin-1', Role.admin),
  makeUser('ayudante-1', Role.ayudante),
  makeUser('member-1', Role.member),
];

const VALID_GAME = { modalidad: 'seis_x_seis', gameDate: '2026-08-01' };

describe('Games controller access control (HTTP)', () => {
  let app: NestExpressApplication;
  let token: (id: string) => string;
  let games: Record<string, jest.Mock>;

  beforeEach(async () => {
    games = {
      create: jest.fn().mockResolvedValue({ id: 'game-1', title: '6x6' }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      findOne: jest.fn().mockResolvedValue({ id: 'game-1', registrations: [] }),
      register: jest.fn().mockResolvedValue({ id: 'reg-1', position: 1 }),
      updateRegistration: jest.fn().mockResolvedValue({ id: 'reg-1', paid: true }),
      promote: jest.fn().mockResolvedValue({ id: 'reg-1' }),
      getAvailableMembers: jest.fn().mockResolvedValue([{ id: 'member-1', name: 'Member' }]),
      cancel: jest.fn().mockResolvedValue({ id: 'game-1', status: 'cancelled' }),
      complete: jest.fn().mockResolvedValue({ game: {}, report: 'ok' }),
    };

    const created = await createTestApp({
      controllers: [GamesController],
      providers: [
        { provide: GamesService, useValue: games },
        { provide: GameEventsService, useValue: { subscribe: jest.fn(), emit: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn(), findByGame: jest.fn() } },
        { provide: PrismaService, useValue: makePrismaMock(USERS) },
      ],
    });

    app = created.app;
    token = (id) => {
      const user = USERS.find((u) => u.id === id)!;
      return created.tokenFor(user);
    };
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('sin autenticación', () => {
    it('rechaza listar partidos', async () => {
      await request(app.getHttpServer()).get('/api/games').expect(401);
    });

    it('rechaza crear un partido', async () => {
      await request(app.getHttpServer()).post('/api/games').send(VALID_GAME).expect(401);
    });
  });

  describe('crear partido (solo admin)', () => {
    it('permite al admin', async () => {
      await request(app.getHttpServer())
        .post('/api/games')
        .set('Authorization', `Bearer ${token('admin-1')}`)
        .send(VALID_GAME)
        .expect(201);

      expect(games.create).toHaveBeenCalledWith(
        expect.objectContaining({ modalidad: 'seis_x_seis' }),
        'admin-1',
      );
    });

    it('rechaza al ayudante con 403', async () => {
      await request(app.getHttpServer())
        .post('/api/games')
        .set('Authorization', `Bearer ${token('ayudante-1')}`)
        .send(VALID_GAME)
        .expect(403);

      expect(games.create).not.toHaveBeenCalled();
    });

    it('rechaza al member con 403', async () => {
      await request(app.getHttpServer())
        .post('/api/games')
        .set('Authorization', `Bearer ${token('member-1')}`)
        .send(VALID_GAME)
        .expect(403);
    });

    it('valida el body antes de llegar al service', async () => {
      await request(app.getHttpServer())
        .post('/api/games')
        .set('Authorization', `Bearer ${token('admin-1')}`)
        .send({ modalidad: 'inexistente', gameDate: '2026-08-01' })
        .expect(400);

      expect(games.create).not.toHaveBeenCalled();
    });
  });

  describe('gestionar la lista (admin y ayudante)', () => {
    it('restringe los miembros disponibles a gestores', async () => {
      await request(app.getHttpServer())
        .get('/api/games/game-1/available-members')
        .set('Authorization', `Bearer ${token('member-1')}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/games/game-1/available-members')
        .set('Authorization', `Bearer ${token('ayudante-1')}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/games/game-1/available-members')
        .set('Authorization', `Bearer ${token('admin-1')}`)
        .expect(200);

      expect(games.getAvailableMembers).toHaveBeenCalledTimes(2);
      expect(games.getAvailableMembers).toHaveBeenCalledWith('game-1');
    });

    it('permite al ayudante marcar pago', async () => {
      await request(app.getHttpServer())
        .patch('/api/games/game-1/registrations/reg-1')
        .set('Authorization', `Bearer ${token('ayudante-1')}`)
        .send({ paid: true })
        .expect(200);

      expect(games.updateRegistration).toHaveBeenCalledWith(
        'reg-1',
        { paid: true },
        'ayudante-1',
        'game-1',
      );
    });

    it('rechaza al member marcando pago', async () => {
      await request(app.getHttpServer())
        .patch('/api/games/game-1/registrations/reg-1')
        .set('Authorization', `Bearer ${token('member-1')}`)
        .send({ paid: true })
        .expect(403);
    });

    it('permite al ayudante promover desde la espera', async () => {
      await request(app.getHttpServer())
        .post('/api/games/game-1/promote/reg-1')
        .set('Authorization', `Bearer ${token('ayudante-1')}`)
        .expect(201);
    });
  });

  describe('cancelar partido (solo admin)', () => {
    it('rechaza al ayudante', async () => {
      await request(app.getHttpServer())
        .post('/api/games/game-1/cancel')
        .set('Authorization', `Bearer ${token('ayudante-1')}`)
        .send({ reason: 'Lluvia' })
        .expect(403);

      expect(games.cancel).not.toHaveBeenCalled();
    });

    it('permite al admin', async () => {
      await request(app.getHttpServer())
        .post('/api/games/game-1/cancel')
        .set('Authorization', `Bearer ${token('admin-1')}`)
        .send({ reason: 'Lluvia' })
        .expect(201);
    });
  });

  describe('camino feliz de un member', () => {
    it('lista partidos y se anota', async () => {
      await request(app.getHttpServer())
        .get('/api/games')
        .set('Authorization', `Bearer ${token('member-1')}`)
        .expect(200);

      expect(games.findAll).toHaveBeenCalledWith(Role.member, expect.any(Object));

      await request(app.getHttpServer())
        .post('/api/games/game-1/register')
        .set('Authorization', `Bearer ${token('member-1')}`)
        .expect(201);

      expect(games.register).toHaveBeenCalledWith('game-1', 'member-1', 'member-1');
    });
  });
});
