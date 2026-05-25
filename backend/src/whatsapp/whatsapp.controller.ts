import { Controller, Get, Post, UseGuards, Inject, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { Role, UserStatus } from '@prisma/client';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { BaileysProvider } from './providers/baileys.provider';
import { PrismaService } from '../prisma/prisma.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class WhatsappController {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: BaileysProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  getStatus() {
    return {
      connected: this.provider.isConnected(),
      status: this.provider.getStatus(),
      hasQR: !!this.provider.getQR(),
    };
  }

  @Get('qr')
  async getQR(@Res() res: Response) {
    const qr = this.provider.getQR();
    if (!qr) {
      const status = this.provider.getStatus();
      if (status === 'connected') {
        return res.json({ message: 'Ya conectado, no se necesita QR.' });
      }
      return res.status(404).json({
        message: 'No hay QR disponible. Espera unos segundos y reintenta.',
        status,
      });
    }

    const qrImage = await QRCode.toDataURL(qr, { width: 400 });
    return res.json({ qr: qrImage, raw: qr });
  }

  @Get('qr/image')
  async getQRImage(@Res() res: Response) {
    const qr = this.provider.getQR();
    if (!qr) {
      return res.status(404).send('No QR disponible. Espera unos segundos y reintenta.');
    }

    res.setHeader('Content-Type', 'image/png');
    const buffer = await QRCode.toBuffer(qr, { width: 400 });
    return res.send(buffer);
  }

  @Get('groups')
  async getGroups() {
    const groups = await this.provider.getGroups();
    return { groups };
  }

  @Post('logout')
  async logout() {
    await this.provider.logout();
    return { message: 'Sesión de WhatsApp eliminada. Reinicia el servicio para reconectar.' };
  }

  @Post('import-group-members')
  async importGroupMembers(@CurrentUser() _user: JwtUser) {
    const logger = new Logger('WhatsApp Import');

    if (!this.provider.isConnected()) {
      return { error: 'WhatsApp no está conectado.' };
    }

    const participants = await this.provider.getGroupParticipants();
    if (participants.length === 0) {
      return { error: 'No se pudieron obtener participantes del grupo.' };
    }

    const DEFAULT_PASSWORD = 'zetas123';
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

    let created = 0;
    let skipped = 0;
    let unresolved = 0;
    const createdUsers: Array<{ phone: string; name: string }> = [];

    for (const p of participants) {
      if (!p.phone) {
        unresolved++;
        continue;
      }

      const existing = await this.prisma.user.findUnique({ where: { phone: p.phone } });
      if (existing) {
        if (p.lid && !existing.whatsappLid) {
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { whatsappLid: p.lid },
          });
        }
        skipped++;
        continue;
      }

      const username = p.phone;
      const existingUsername = await this.prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        skipped++;
        continue;
      }

      await this.prisma.user.create({
        data: {
          username,
          passwordHash,
          name: p.phone,
          phone: p.phone,
          role: Role.member,
          status: UserStatus.active,
          mustChangePassword: true,
          whatsappLid: p.lid || null,
        },
      });

      created++;
      createdUsers.push({ phone: p.phone, name: p.phone });
    }

    logger.log(`Import completado: ${created} creados, ${skipped} existentes, ${unresolved} sin teléfono`);

    return {
      total: participants.length,
      created,
      skipped,
      unresolved,
      createdUsers,
      defaultPassword: DEFAULT_PASSWORD,
      note: 'Los usuarios creados deben cambiar su contraseña en el primer login.',
    };
  }
}
