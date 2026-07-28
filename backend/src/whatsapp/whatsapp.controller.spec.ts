import * as QRCode from 'qrcode';
import { Response } from 'express';
import { WhatsappController } from './whatsapp.controller';
import { BaileysProvider } from './providers/baileys.provider';
import { UsersService } from '../users/users.service';
import { JwtUser } from '../auth/jwt-user.interface';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
  toBuffer: jest.fn(),
}));
jest.mock('./providers/baileys.provider', () => ({
  BaileysProvider: class BaileysProvider {},
}));

describe('WhatsappController', () => {
  const provider = {
    isConnected: jest.fn(),
    getStatus: jest.fn(),
    getQR: jest.fn(),
    getGroups: jest.fn(),
    logout: jest.fn(),
    getGroupParticipants: jest.fn(),
  };
  const users = { importFromWhatsapp: jest.fn() };
  let controller: WhatsappController;
  let response: Pick<Response, 'json' | 'status' | 'send' | 'setHeader'>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WhatsappController(
      provider as unknown as BaileysProvider,
      users as unknown as UsersService,
    );
    response = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    };
  });

  it('reporta el estado del proveedor', () => {
    provider.isConnected.mockReturnValue(true);
    provider.getStatus.mockReturnValue('connected');
    provider.getQR.mockReturnValue('qr');
    expect(controller.getStatus()).toEqual({ connected: true, status: 'connected', hasQR: true });
  });

  it('responde los estados sin QR', async () => {
    provider.getQR.mockReturnValue(null);
    provider.getStatus.mockReturnValue('connected');
    await controller.getQR(response as Response);
    expect(response.json).toHaveBeenCalledWith({ message: 'Ya conectado, no se necesita QR.' });

    provider.getStatus.mockReturnValue('disconnected');
    await controller.getQR(response as Response);
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('genera QR en JSON e imagen', async () => {
    provider.getQR.mockReturnValue('raw-qr');
    (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,qr');
    (QRCode.toBuffer as jest.Mock).mockResolvedValue(Buffer.from('qr'));

    await controller.getQR(response as Response);
    await controller.getQRImage(response as Response);

    expect(response.json).toHaveBeenCalledWith({
      qr: 'data:image/png;base64,qr',
      raw: 'raw-qr',
    });
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('responde 404 para imagen sin QR', async () => {
    provider.getQR.mockReturnValue(null);
    await controller.getQRImage(response as Response);
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('lista grupos y cierra sesión', async () => {
    provider.getGroups.mockResolvedValue([{ id: 'g1' }]);
    await expect(controller.getGroups()).resolves.toEqual({ groups: [{ id: 'g1' }] });
    await expect(controller.logout()).resolves.toMatchObject({ message: expect.any(String) });
    expect(provider.logout).toHaveBeenCalled();
  });

  it('valida conexión y participantes antes de importar', async () => {
    provider.isConnected.mockReturnValue(false);
    await expect(controller.importGroupMembers({ id: 'admin' } as JwtUser)).resolves.toEqual({
      error: 'WhatsApp no está conectado.',
    });

    provider.isConnected.mockReturnValue(true);
    provider.getGroupParticipants.mockResolvedValue([]);
    await expect(controller.importGroupMembers({ id: 'admin' } as JwtUser)).resolves.toEqual({
      error: 'No se pudieron obtener participantes del grupo.',
    });
  });

  it('importa participantes y devuelve el resumen', async () => {
    provider.isConnected.mockReturnValue(true);
    provider.getGroupParticipants.mockResolvedValue([{ id: 'p1' }]);
    users.importFromWhatsapp.mockResolvedValue({ created: 1, skipped: 0, unresolved: 0 });

    await expect(controller.importGroupMembers({ id: 'admin' } as JwtUser)).resolves.toMatchObject({
      total: 1,
      created: 1,
      defaultPassword: expect.any(String),
    });
    expect(users.importFromWhatsapp).toHaveBeenCalledWith([{ id: 'p1' }], 'admin');
  });
});
