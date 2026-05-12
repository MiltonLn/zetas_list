import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockAudit = { log: jest.fn() };

function makeCreatedUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    username: 'jperez',
    name: 'Juan Pérez',
    phone: '3001234567',
    role: Role.member,
    position: null,
    gender: null,
    heightCm: null,
    birthDate: null,
    photoUrl: null,
    bio: null,
    status: 'active',
    banReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAudit.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      username: 'jperez',
      name: 'Juan Pérez',
      phone: '3001234567',
    };
    const actorId = 'admin-1';

    it('lanza ConflictException si el username ya existe', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing', username: 'jperez', phone: '999' });
      await expect(service.create(baseDto as any, actorId)).rejects.toThrow(ConflictException);
    });

    it('el mensaje de conflicto de username es específico', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'x', username: 'jperez', phone: '999' });
      await expect(service.create(baseDto as any, actorId)).rejects.toThrow('nombre de usuario');
    });

    it('lanza ConflictException si el teléfono ya existe', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'x', username: 'otherone', phone: '3001234567' });
      await expect(service.create(baseDto as any, actorId)).rejects.toThrow(ConflictException);
    });

    it('el mensaje de conflicto de teléfono es específico', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'x', username: 'otherone', phone: '3001234567' });
      await expect(service.create(baseDto as any, actorId)).rejects.toThrow('teléfono');
    });

    it('usa zetas123 como contraseña por defecto cuando no se provee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create(baseDto as any, actorId);

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      const isDefault = await bcrypt.compare('zetas123', createCall.data.passwordHash);
      expect(isDefault).toBe(true);
    });

    it('establece mustChangePassword = true cuando no se provee contraseña', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create(baseDto as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.mustChangePassword).toBe(true);
    });

    it('usa la contraseña explícita cuando se provee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create({ ...baseDto, password: 'MiPass123!' } as any, actorId);

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      const isCustom = await bcrypt.compare('MiPass123!', createCall.data.passwordHash);
      expect(isCustom).toBe(true);
    });

    it('establece mustChangePassword = false cuando se provee contraseña explícita', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create({ ...baseDto, password: 'MiPass123!' } as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.mustChangePassword).toBe(false);
    });

    it('aplica el rol member por defecto', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create(baseDto as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe(Role.member);
    });

    it('respeta el rol explícito cuando se provee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser({ role: Role.admin }));

      await service.create({ ...baseDto, role: Role.admin } as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe(Role.admin);
    });

    it('guarda un hash bcrypt (no texto plano)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create(baseDto as any, actorId);

      const hash = mockPrisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(hash).not.toBe('zetas123');
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it('llama a audit.log con "user_created"', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create(baseDto as any, actorId);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_created', actorId }),
      );
    });
  });
});
