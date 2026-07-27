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
import { BCRYPT_ROUNDS, DEFAULT_PASSWORD } from './users.constants';

/** A participant as reported by the WhatsApp group metadata. */
export interface WhatsappParticipant {
  phone: string | null;
  lid?: string | null;
}

export interface WhatsappImportResult {
  created: number;
  skipped: number;
  unresolved: number;
  createdUsers: Array<{ phone: string; name: string }>;
}

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  name: true,
  alias: true,
  phone: true,
  role: true,
  position: true,
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

    const rawPassword = dto.password || DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
    const mustChangePassword = !dto.password;

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        name: dto.name,
        alias: dto.alias?.trim() || null,
        phone: normalizedPhone,
        role: dto.role ?? Role.member,
        position: dto.position,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
        bio: dto.bio,
        mustChangePassword,
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

  /**
   * Creates member accounts for WhatsApp group participants that don't have one
   * yet. Existing users are left untouched apart from backfilling their LID,
   * which WhatsApp only exposes through group metadata.
   */
  async importFromWhatsapp(
    participants: WhatsappParticipant[],
    actorId: string,
  ): Promise<WhatsappImportResult> {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

    const result: WhatsappImportResult = {
      created: 0,
      skipped: 0,
      unresolved: 0,
      createdUsers: [],
    };

    for (const participant of participants) {
      if (!participant.phone) {
        result.unresolved++;
        continue;
      }

      const phone = participant.phone;
      const existing = await this.prisma.user.findFirst({
        where: { OR: [{ phone }, { username: phone }] },
      });

      if (existing) {
        if (participant.lid && !existing.whatsappLid) {
          await this.setWhatsappLid(existing.id, participant.lid);
        }
        result.skipped++;
        continue;
      }

      const user = await this.prisma.user.create({
        data: {
          username: phone,
          passwordHash,
          // The group only gives us the number; members rename themselves on
          // first login.
          name: phone,
          phone,
          role: Role.member,
          status: UserStatus.active,
          mustChangePassword: true,
          whatsappLid: participant.lid || null,
        },
        select: { id: true, name: true, phone: true, username: true, role: true },
      });

      await this.audit.log({
        actorId,
        targetUserId: user.id,
        action: 'user_created',
        details: { username: user.username, role: user.role, source: 'whatsapp_import' },
      });

      result.created++;
      result.createdUsers.push({ phone: user.phone, name: user.name });
    }

    return result;
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
        position: dto.position,
        gender: dto.gender,
        heightCm: dto.heightCm,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        photoUrl: dto.photoUrl,
        bio: dto.bio,
        shirtSize: dto.shirtSize,
        shirtNumber: dto.shirtNumber,
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
