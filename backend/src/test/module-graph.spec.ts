// Baileys ships ESM only, which Jest can't load. The DI graph doesn't need the
// real client, and the CLI provider is the one selected under test anyway.
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  initAuthCreds: jest.fn(),
  proto: {},
  BufferJSON: { replacer: jest.fn(), reviver: jest.fn() },
  DisconnectReason: {},
  makeCacheableSignalKeyStore: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GamesModule } from '../games/games.module';
import { UsersModule } from '../users/users.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Games↔WhatsApp and Users↔WhatsApp used to be circular and needed `forwardRef`
 * on both sides. Domain events removed those cycles; this compiles the real
 * modules so a reintroduced direct dependency fails here instead of at boot.
 */
describe('module graph', () => {
  it('resuelve Games, Users y WhatsApp sin forwardRef', async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), GamesModule, UsersModule, WhatsappModule],
    })
      // Only the DI graph is under test; nothing should touch the database.
      .overrideProvider(PrismaService)
      .useValue({ $on: jest.fn(), $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    expect(module).toBeDefined();
  });
});
