import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mocked-token'),
  verify: jest.fn(),
};

const mockWhatsapp = {
  sendMessage: jest.fn(),
  sendToGroup: jest.fn(),
};

async function hashPassword(raw: string) {
  return bcrypt.hash(raw, 10);
}

function makeDbUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    passwordHash: '$2b$10$placeholder',
    role: 'member',
    status: 'active',
    phone: '3001234567',
    position: null,
    gender: null,
    photoUrl: null,
    banReason: null,
    mustChangePassword: false,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWhatsapp.sendMessage.mockResolvedValue(undefined);
    mockJwt.sign.mockReturnValue('mocked-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ username: 'noone', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza ForbiddenException si la cuenta está baneada', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'banned', banReason: 'Conducta' }));
      await expect(service.login({ username: 'testuser', password: 'any' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza ForbiddenException si la cuenta está inactiva', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'inactive' }));
      await expect(service.login({ username: 'testuser', password: 'any' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const hash = await hashPassword('correct');
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ passwordHash: hash }));
      await expect(service.login({ username: 'testuser', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('devuelve tokens y datos del usuario con credenciales válidas', async () => {
      const hash = await hashPassword('secret123');
      const user = makeDbUser({ passwordHash: hash, mustChangePassword: false });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login({ username: 'testuser', password: 'secret123' });

      expect(result.accessToken).toBe('mocked-token');
      expect(result.refreshToken).toBe('mocked-token');
      expect(result.user.username).toBe('testuser');
      expect(result.user.mustChangePassword).toBe(false);
    });

    it('devuelve mustChangePassword: true cuando aplica', async () => {
      const hash = await hashPassword('zetas123');
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ passwordHash: hash, mustChangePassword: true }));

      const result = await service.login({ username: 'testuser', password: 'zetas123' });
      expect(result.user.mustChangePassword).toBe(true);
    });

    it('firma el JWT con payload correcto', async () => {
      const hash = await hashPassword('pass');
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ passwordHash: hash }));

      await service.login({ username: 'testuser', password: 'pass' });
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { sub: 'user-1', username: 'testuser', role: 'member' },
        expect.objectContaining({ expiresIn: '15m' }),
      );
    });
  });

  // ─── changePassword ────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('lanza UnauthorizedException si la contraseña actual es incorrecta', async () => {
      const hash = await hashPassword('correct');
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeDbUser({ passwordHash: hash }));

      await expect(
        service.changePassword('user-1', { currentPassword: 'wrong', newPassword: 'newpass123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('actualiza el hash y limpia mustChangePassword', async () => {
      const hash = await hashPassword('oldpass');
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeDbUser({ passwordHash: hash }));
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('user-1', {
        currentPassword: 'oldpass',
        newPassword: 'newpass123',
      });

      expect(result.message).toBe('Contraseña actualizada correctamente');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
    });

    it('guarda un hash bcrypt nuevo (no el texto plano)', async () => {
      const hash = await hashPassword('oldpass');
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeDbUser({ passwordHash: hash }));
      mockPrisma.user.update.mockResolvedValue({});

      await service.changePassword('user-1', { currentPassword: 'oldpass', newPassword: 'mynewpass' });

      const savedHash = mockPrisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(savedHash).not.toBe('mynewpass');
      expect(await bcrypt.compare('mynewpass', savedHash)).toBe(true);
    });
  });

  // ─── recoverPassword ───────────────────────────────────────────────────────

  describe('recoverPassword', () => {
    it('devuelve mensaje genérico si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.recoverPassword('noone');
      expect(result.message).toBe('Si el usuario existe, se envió una contraseña temporal a su WhatsApp');
    });

    it('devuelve mensaje genérico si el usuario no está activo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'banned' }));
      const result = await service.recoverPassword('testuser');
      expect(result.message).toBe('Si el usuario existe, se envió una contraseña temporal a su WhatsApp');
    });

    it('actualiza la contraseña y establece mustChangePassword a true', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.user.update.mockResolvedValue({});

      await service.recoverPassword('testuser');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mustChangePassword: true }),
        }),
      );
    });

    it('envía la contraseña temporal al número de WhatsApp del usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ phone: '3001234567' }));
      mockPrisma.user.update.mockResolvedValue({});

      await service.recoverPassword('testuser');

      expect(mockWhatsapp.sendMessage).toHaveBeenCalledWith(
        '3001234567',
        expect.stringContaining('contraseña temporal'),
      );
    });

    it('devuelve mensaje de confirmación', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.recoverPassword('testuser');
      expect(result.message).toContain('WhatsApp');
    });

    it('guarda un hash válido de la contraseña temporal', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.user.update.mockResolvedValue({});

      await service.recoverPassword('testuser');

      const savedHash = mockPrisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(savedHash).toBeDefined();
      expect(savedHash).toMatch(/^\$2[ab]\$/);
    });
  });
});
