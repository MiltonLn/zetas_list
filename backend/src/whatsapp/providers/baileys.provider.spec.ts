jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: {
    loggedOut: 401,
    connectionReplaced: 440,
  },
  fetchLatestBaileysVersion: jest.fn(),
}));

jest.mock('./prisma-auth-state', () => ({
  usePrismaAuthState: jest.fn(),
}));

import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { PrismaService } from '../../prisma/prisma.service';
import { BaileysProvider } from './baileys.provider';
import { usePrismaAuthState } from './prisma-auth-state';

describe('BaileysProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa la versión más reciente de WhatsApp al crear el socket', async () => {
    const version: [number, number, number] = [2, 3000, 1035194821];
    const socket = {
      ev: {
        on: jest.fn(),
        removeAllListeners: jest.fn(),
      },
      end: jest.fn(),
    };

    jest.mocked(fetchLatestBaileysVersion).mockResolvedValue({
      version,
      isLatest: true,
      error: undefined,
    });
    jest.mocked(usePrismaAuthState).mockResolvedValue({
      state: {
        creds: {},
        keys: {},
      },
      saveCreds: jest.fn(),
    } as never);
    jest.mocked(makeWASocket).mockReturnValue(socket as never);

    const provider = new BaileysProvider({} as PrismaService);

    await provider.onModuleInit();

    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(1);
    expect(makeWASocket).toHaveBeenCalledWith(
      expect.objectContaining({
        version,
      }),
    );

    await provider.onModuleDestroy();
  });
});
