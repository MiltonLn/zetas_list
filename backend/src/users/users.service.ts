import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { assertShirtNumberAvailable } from './shirt-number.util';

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  name: true,
  alias: true,
  phone: true,
  role: true,
  positions: true,
  gender: true,
  heightCm: true,
  birthDate: true,
  photoUrl: true,
  bio: true,
  shirtSize: true,
  shirtNumber: true,
  status: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
};

// skillLevel is deliberately excluded from USER_PUBLIC_SELECT: only admins may
// see it. Admin-only queries use this extended select and convert the Prisma
// Decimal to a plain number for JSON.
const USER_ADMIN_SELECT = {
  ...USER_PUBLIC_SELECT,
  skillLevel: true,
};

function toAdminUser<T extends { skillLevel: unknown }>(user: T): Omit<T, 'skillLevel'> & { skillLevel: number | null } {
  return { ...user, skillLevel: user.skillLevel != null ? Number(user.skillLevel) : null };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string) {
    const normalizedPhone = dto.phone.replace(/[^0-9]/g, '');
    const username = dto.username || normalizedPhone;

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { phone: normalizedPhone }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === username
          ? 'El nombre de usuario ya existe'
          : 'El número de teléfono ya está registrado',
      );
    }

    const DEFAULT_PASSWORD = 'zetas123';
    const rawPassword = dto.password || DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const mustChangePassword = !dto.password;

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        name: dto.name,
        alias: dto.alias?.trim() || null,
        phone: normalizedPhone,
        role: dto.role ?? Role.member,
        positions: dto.positions,
        skillLevel: dto.skillLevel,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
        bio: dto.bio,
        mustChangePassword,
      },
      // Create is an admin-only route, so returning skillLevel is safe.
      select: USER_ADMIN_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: user.id,
      action: 'user_created',
      details: { username: user.username, role: user.role },
    });

    return toAdminUser(user);
  }

  async findAll(search?: string) {
    // Admin-only route: includes skillLevel.
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      select: USER_ADMIN_SELECT,
      orderBy: { name: 'asc' },
    });
    return users.map(toAdminUser);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true, alias: true, phone: true, role: true, status: true },
    });
  }

  async findByPhoneOrLid(phoneOrLid: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ phone: phoneOrLid }, { whatsappLid: phoneOrLid }],
      },
      select: { id: true, name: true, alias: true, phone: true, role: true, status: true },
    });
  }

  async setWhatsappLid(userId: string, lid: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { whatsappLid: lid },
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    actorRole: Role,
  ) {
    const existing = await this.findOne(id);

    if (actorRole !== Role.admin && actorId !== id) {
      throw new ForbiddenException('Solo puedes editar tu propio perfil');
    }

    if (dto.name !== undefined && actorRole !== Role.admin) {
      throw new ForbiddenException('Solo un administrador puede cambiar el nombre real.');
    }

    if (dto.skillLevel !== undefined && actorRole !== Role.admin) {
      throw new ForbiddenException('Solo un administrador puede calificar la habilidad de un jugador.');
    }

    if (typeof dto.shirtNumber === 'number') {
      await assertShirtNumberAvailable(this.prisma, {
        number: dto.shirtNumber,
        gender: dto.gender ?? existing.gender,
        excludeUserId: id,
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        alias: dto.alias !== undefined ? (dto.alias.trim() || null) : undefined,
        positions: dto.positions,
        skillLevel: dto.skillLevel,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
        bio: dto.bio,
        shirtSize: dto.shirtSize,
        shirtNumber: dto.shirtNumber,
      },
      select: actorRole === Role.admin ? USER_ADMIN_SELECT : USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: id,
      action: 'user_updated',
      details: dto as Record<string, unknown>,
    });

    return 'skillLevel' in updated ? toAdminUser(updated as typeof updated & { skillLevel: unknown }) : updated;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, actorId: string) {
    await this.findOne(id);

    if (dto.status === UserStatus.banned && !dto.reason) {
      throw new BadRequestException('Se requiere una razón para banear al usuario');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        banReason: dto.status === UserStatus.banned ? dto.reason : null,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: id,
      action: 'user_status_changed',
      details: { status: dto.status, reason: dto.reason },
    });

    return updated;
  }

  async resetPassword(id: string, newPassword: string, actorId: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await this.audit.log({
      actorId,
      targetUserId: id,
      action: 'user_updated',
      details: { action: 'password_reset' },
    });

    return { message: 'Contraseña restablecida correctamente' };
  }

  async updateRole(id: string, newRole: Role, actorId: string) {
    const user = await this.findOne(id);

    if (user.id === actorId) {
      throw new BadRequestException('No puedes cambiar tu propio rol');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: id,
      action: 'user_updated',
      details: { action: 'role_changed', newRole },
    });

    return updated;
  }
}
