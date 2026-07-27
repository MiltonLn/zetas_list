import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createTestApp, makePrismaMock, type TestUser } from './test-app';

const PASSWORD = 'zetas123';

describe('Auth flow (HTTP)', () => {
  let app: NestExpressApplication;
  let users: TestUser[];

  async function boot(overrides: Partial<TestUser> = {}) {
    users = [
      {
        id: 'user-1',
        username: 'milton',
        name: 'Milton',
        role: Role.admin,
        status: 'active',
        phone: '3160000000',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        banReason: null,
        mustChangePassword: false,
        position: null,
        gender: null,
        photoUrl: null,
        ...overrides,
      },
    ];

    const created = await createTestApp({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: makePrismaMock(users) },
        { provide: WhatsappService, useValue: { sendMessage: jest.fn() } },
      ],
    });
    app = created.app;
    return created;
  }

  afterEach(async () => {
    await app?.close();
  });

  it('devuelve tokens y el usuario con credenciales correctas', async () => {
    await boot();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: PASSWORD })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual(expect.objectContaining({ username: 'milton', role: 'admin' }));
    // El hash nunca debe salir en la respuesta.
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    await boot();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: 'incorrecta' })
      .expect(401);
  });

  it('rechaza una cuenta suspendida con 403', async () => {
    await boot({ status: 'banned', banReason: 'No pagó' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: PASSWORD })
      .expect(403);

    expect(res.body.message).toContain('suspendida');
  });

  it('valida el body con el ValidationPipe global', async () => {
    await boot();

    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);

    // whitelist + forbidNonWhitelisted: propiedades desconocidas se rechazan.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: PASSWORD, isAdmin: true })
      .expect(400);
  });

  it('bloquea /auth/me sin token', async () => {
    await boot();

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('devuelve el usuario en /auth/me con el token del login', async () => {
    await boot();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: PASSWORD });

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body).toEqual(expect.objectContaining({ id: 'user-1', role: 'admin' }));
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const { jwt } = await boot();
    const foreign = jwt.sign({ sub: 'user-1', username: 'milton', role: 'admin' });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${foreign}tampered`)
      .expect(401);
  });

  it('no deja entrar a un usuario desactivado después de emitir el token', async () => {
    const { tokenFor } = await boot();
    const token = tokenFor({ id: 'user-1', username: 'milton', role: Role.admin });

    users[0].status = 'inactive';

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('renueva tokens con un refresh token válido', async () => {
    await boot();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'milton', password: PASSWORD });

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });
});
