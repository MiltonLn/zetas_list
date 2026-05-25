import { Controller, Get, Post, UseGuards, Inject, Res, Req, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import * as QRCode from 'qrcode';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { BaileysProvider } from './providers/baileys.provider';
import { PrismaService } from '../prisma/prisma.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: BaileysProvider,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async verifyAdmin(req: Request, tokenParam?: string): Promise<boolean> {
    const token = tokenParam || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      return user?.role === 'admin';
    } catch {
      return false;
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  getStatus() {
    return {
      connected: this.provider.isConnected(),
      status: this.provider.getStatus(),
      hasQR: !!this.provider.getQR(),
    };
  }

  @Get('qr')
  async getQR(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    if (!(await this.verifyAdmin(req, token))) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

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
  async getQRImage(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    if (!(await this.verifyAdmin(req, token))) {
      return res.status(401).send('Unauthorized');
    }

    const qr = this.provider.getQR();
    if (!qr) {
      return res.status(404).send('No QR disponible. Espera unos segundos y reintenta.');
    }

    res.setHeader('Content-Type', 'image/png');
    const buffer = await QRCode.toBuffer(qr, { width: 400 });
    return res.send(buffer);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  async logout() {
    await this.provider.logout();
    return { message: 'Sesión de WhatsApp eliminada. Reinicia el servicio para reconectar.' };
  }
}
