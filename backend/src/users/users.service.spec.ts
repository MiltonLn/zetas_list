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
    shirtSize: null,
    shirtNumber: null,
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

    it('deriva username del phone cuando no se envía username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create({ name: 'Test', phone: '573166160159' } as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.username).toBe('573166160159');
    });

    it('usa username explícito si se provee', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create({ username: 'custom', name: 'Test', phone: '573166160159' } as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.username).toBe('custom');
    });

    it('normaliza phone removiendo caracteres no numéricos', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeCreatedUser());

      await service.create({ name: 'Test', phone: '+57-316-6160159' } as any, actorId);

      expect(mockPrisma.user.create.mock.calls[0][0].data.phone).toBe('573166160159');
      expect(mockPrisma.user.create.mock.calls[0][0].data.username).toBe('573166160159');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', {} as any, 'admin-1', Role.admin)).rejects.toThrow(
        'Usuario no encontrado',
      );
    });

    it('lanza ForbiddenException si el miembro intenta editar a otro', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      await expect(
        service.update('user-1', { name: 'Otro' } as any, 'member-99', Role.member),
      ).rejects.toThrow('propio perfil');
    });

    it('permite a un admin editar a cualquier usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      const updated = makeCreatedUser({ name: 'Nuevo Nombre' });
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-1', { name: 'Nuevo Nombre' } as any, 'admin-1', Role.admin);

      expect(result.name).toBe('Nuevo Nombre');
    });

    it('permite a un miembro editar su propio perfil (alias, bio, etc.)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ bio: 'Hola' }));

      await expect(
        service.update('user-1', { bio: 'Hola' } as any, 'user-1', Role.member),
      ).resolves.toBeDefined();
    });

    it('impide a un miembro cambiar su nombre real', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));

      await expect(
        service.update('user-1', { name: 'Nuevo Nombre' } as any, 'user-1', Role.member),
      ).rejects.toThrow('Solo un administrador puede cambiar el nombre real.');
    });

    it('impide a un miembro calificar su propia habilidad', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));

      await expect(
        service.update('user-1', { skillLevel: 5.0 } as any, 'user-1', Role.member),
      ).rejects.toThrow('Solo un administrador puede calificar la habilidad');
    });

    it('impide a un ayudante calificar la habilidad de otro', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));

      await expect(
        service.update('user-1', { skillLevel: 3.0 } as any, 'user-1', Role.ayudante),
      ).rejects.toThrow('Solo un administrador puede calificar la habilidad');
    });

    it('permite a un admin calificar la habilidad de un jugador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ skillLevel: 4.5 }));

      await service.update('user-1', { skillLevel: 4.5 } as any, 'admin-1', Role.admin);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skillLevel: 4.5 }),
        }),
      );
    });

    it('convierte skillLevel Decimal de Prisma a número en la respuesta de admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      // Prisma devuelve Decimal para columnas DECIMAL: simulamos con un objeto convertible.
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ skillLevel: { toString: () => '4.5' } }));

      const result = await service.update('user-1', { skillLevel: 4.5 } as any, 'admin-1', Role.admin);

      expect((result as unknown as { skillLevel: number | null }).skillLevel).toBe(4.5);
    });

    it('guarda posiciones múltiples', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1' }));
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ positions: ['armador', 'central'] }));

      await service.update('user-1', { positions: ['armador', 'central'] } as any, 'user-1', Role.member);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ positions: ['armador', 'central'] }),
        }),
      );
    });

    it('llama a audit.log con "user_updated"', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser());

      await service.update('user-1', { name: 'X' } as any, 'admin-1', Role.admin);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_updated' }),
      );
    });

    it('guarda talla y número de camiseta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1', gender: 'masculino' }));
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ shirtSize: 'L', shirtNumber: 7 }));

      await service.update('user-1', { shirtSize: 'L', shirtNumber: 7 } as any, 'user-1', Role.member);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shirtSize: 'L', shirtNumber: 7 }),
        }),
      );
    });

    it('lanza ConflictException si el número ya está tomado en su categoría', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ id: 'user-1', gender: 'masculino' }));
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'otro', name: 'Pedro' });

      await expect(
        service.update('user-1', { shirtNumber: 7 } as any, 'user-1', Role.member),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('bad-id', { status: 'inactive' } as any, 'admin-1'),
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('lanza BadRequestException si se quiere banear sin razón', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      await expect(
        service.updateStatus('user-1', { status: 'banned' } as any, 'admin-1'),
      ).rejects.toThrow('razón');
    });

    it('banea al usuario con razón', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ status: 'banned', banReason: 'Conducta' }));

      const result = await service.updateStatus(
        'user-1',
        { status: 'banned', reason: 'Conducta' } as any,
        'admin-1',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'banned', banReason: 'Conducta' }),
        }),
      );
      expect(result.banReason).toBe('Conducta');
    });

    it('desbanear limpia el banReason', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser({ status: 'banned' }));
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ status: 'active', banReason: null }));

      await service.updateStatus('user-1', { status: 'active' } as any, 'admin-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ banReason: null }),
        }),
      );
    });

    it('llama a audit.log con "user_status_changed"', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue(makeCreatedUser({ status: 'inactive' }));

      await service.updateStatus('user-1', { status: 'inactive' } as any, 'admin-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_status_changed' }),
      );
    });
  });

  // ─── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('bad-id', 'pass123', 'admin-1')).rejects.toThrow(
        'Usuario no encontrado',
      );
    });

    it('guarda un hash bcrypt de la nueva contraseña', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue({});

      await service.resetPassword('user-1', 'NuevaPass123', 'admin-1');

      const savedHash = mockPrisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(savedHash).not.toBe('NuevaPass123');
      expect(savedHash).toMatch(/^\$2[ab]\$/);
    });

    it('devuelve mensaje de confirmación', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.resetPassword('user-1', 'pass', 'admin-1');
      expect(result.message).toContain('restablecida');
    });

    it('llama a audit.log con "user_updated"', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeCreatedUser());
      mockPrisma.user.update.mockResolvedValue({});

      await service.resetPassword('user-1', 'pass', 'admin-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_updated' }),
      );
    });
  });
});
