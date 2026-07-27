import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private whatsapp: WhatsappService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.status === 'banned') {
      throw new ForbiddenException(
        `Tu cuenta ha sido suspendida${user.banReason ? ': ' + user.banReason : ''}`,
      );
    }

    if (user.status === 'inactive') {
      throw new ForbiddenException('Tu cuenta está inactiva. Contacta a un administrador.');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        phone: user.phone,
        positions: user.positions,
        gender: user.gender,
        photoUrl: user.photoUrl,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('Token inválido');
      }

      const newPayload = {
        sub: user.id,
        username: user.username,
        role: user.role,
      };

      return {
        accessToken: this.jwtService.sign(newPayload, { expiresIn: '15m' }),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      };
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async recoverPassword(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user || user.status !== 'active') {
      return { message: 'Si el usuario existe, se envió una contraseña temporal a su WhatsApp' };
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, mustChangePassword: true },
    });

    const message = [
      `🔑 *Recuperación de contraseña*`,
      ``,
      `Hola ${user.name}, tu nueva contraseña temporal es:`,
      ``,
      `*${tempPassword}*`,
      ``,
      `Ingresa con esta contraseña y el sistema te pedirá cambiarla.`,
    ].join('\n');

    await this.whatsapp.sendMessage(user.phone, message);

    return { message: 'Si el usuario existe, se envió una contraseña temporal a su WhatsApp' };
  }
}
