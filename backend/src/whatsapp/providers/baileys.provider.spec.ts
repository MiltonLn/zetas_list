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
import { UsersService } from '../../users/users.service';
import { MessageHandlerService } from '../message-handler.service';
import { BaileysProvider } from './baileys.provider';
import { usePrismaAuthState } from './prisma-auth-state';

describe('BaileysProvider', () => {
  const createProvider = (users: UsersService = {} as UsersService): BaileysProvider => {
    const ProviderConstructor = BaileysProvider as unknown as new (
      prisma: PrismaService,
      users: UsersService,
    ) => BaileysProvider;
    return new ProviderConstructor({} as PrismaService, users);
  };

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

    const provider = createProvider();

    await provider.onModuleInit();

    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(1);
    expect(makeWASocket).toHaveBeenCalledWith(
      expect.objectContaining({
        version,
      }),
    );

    await provider.onModuleDestroy();
  });

  it('resuelve por LID en usuarios cuando WhatsApp oculta el teléfono', async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
    const socket = {
      ev: {
        on: jest.fn((event: string, handler: (payload: unknown) => Promise<void> | void) => {
          handlers.set(event, handler);
        }),
        removeAllListeners: jest.fn(),
      },
      end: jest.fn(),
      groupMetadata: jest.fn().mockResolvedValue({ participants: [] }),
      user: {},
    };
    const findByPhoneOrLid = jest.fn().mockResolvedValue({
      phone: '573166160159',
    });
    const users = {
      findByPhoneOrLid,
    } as unknown as UsersService;
    const handleMessage = jest.fn().mockResolvedValue(undefined);

    jest.mocked(fetchLatestBaileysVersion).mockResolvedValue({
      version: [2, 3000, 1035194821],
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

    const provider = createProvider(users);
    provider.setMessageHandler({ handleMessage } as unknown as MessageHandlerService);
    (provider as unknown as { groupId: string }).groupId = '120363000000000000@g.us';
    await provider.onModuleInit();

    await handlers.get('messages.upsert')?.({
      type: 'notify',
      messages: [
        {
          key: {
            remoteJid: '120363000000000000@g.us',
            participant: '136176300236992@lid',
            fromMe: false,
          },
          message: { conversation: '@z ayuda' },
          messageTimestamp: Date.now() / 1000,
        },
      ],
    });

    expect(findByPhoneOrLid).toHaveBeenCalledWith('136176300236992@lid');
    expect(handleMessage).toHaveBeenCalledWith(
      '573166160159',
      '@z ayuda',
      '120363000000000000@g.us',
      [],
    );

    await provider.onModuleDestroy();
  });
});
