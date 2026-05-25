import { Controller, Get, Post, UseGuards, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { BaileysProvider } from './providers/baileys.provider';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class WhatsappController {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: BaileysProvider,
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
      return res.status(404).send('No QR disponible');
    }

    res.setHeader('Content-Type', 'image/png');
    const buffer = await QRCode.toBuffer(qr, { width: 400 });
    return res.send(buffer);
  }

  @Post('logout')
  async logout() {
    await this.provider.logout();
    return { message: 'Sesión de WhatsApp eliminada. Reinicia el servicio para reconectar.' };
  }
}
