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

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  name: true,
  phone: true,
  role: true,
  position: true,
  gender: true,
  heightCm: true,
  birthDate: true,
  photoUrl: true,
  status: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { phone: dto.phone }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === dto.username
          ? 'El nombre de usuario ya existe'
          : 'El número de teléfono ya está registrado',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: dto.role ?? Role.member,
        position: dto.position,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: user.id,
      action: 'user_created',
      details: { username: user.username, role: user.role },
    });

    return user;
  }

  async findAll(search?: string) {
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      select: USER_PUBLIC_SELECT,
      orderBy: { name: 'asc' },
    });
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
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    actorRole: Role,
  ) {
    await this.findOne(id);

    if (actorRole !== Role.admin && actorId !== id) {
      throw new ForbiddenException('Solo puedes editar tu propio perfil');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        position: dto.position,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      actorId,
      targetUserId: id,
      action: 'user_updated',
      details: dto as Record<string, unknown>,
    });

    return updated;
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
}
