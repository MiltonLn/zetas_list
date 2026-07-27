import { Controller, Get, Post, UseGuards, Inject, Res, Logger, forwardRef } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { Role } from '@prisma/client';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { BaileysProvider } from './providers/baileys.provider';
import { UsersService } from '../users/users.service';
import { DEFAULT_PASSWORD } from '../users/users.constants';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class WhatsappController {
  private readonly logger = new Logger('WhatsApp Import');

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: BaileysProvider,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
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
  async importGroupMembers(@CurrentUser() user: JwtUser) {
    if (!this.provider.isConnected()) {
      return { error: 'WhatsApp no está conectado.' };
    }

    const participants = await this.provider.getGroupParticipants();
    if (participants.length === 0) {
      return { error: 'No se pudieron obtener participantes del grupo.' };
    }

    const result = await this.users.importFromWhatsapp(participants, user.id);

    this.logger.log(
      `Import completado: ${result.created} creados, ${result.skipped} existentes, ${result.unresolved} sin teléfono`,
    );

    return {
      total: participants.length,
      ...result,
      defaultPassword: DEFAULT_PASSWORD,
      note: 'Los usuarios creados deben cambiar su contraseña en el primer login.',
    };
  }
}
