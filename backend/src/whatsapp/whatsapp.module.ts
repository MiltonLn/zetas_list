import { Module, Inject } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { MessageHandlerService } from './message-handler.service';
import { InfoCommandsService } from './commands/info-commands.service';
import { MutatingCommandsService } from './commands/mutating-commands.service';
import { CliSimulatorProvider } from './providers/cli-simulator.provider';
import { BaileysProvider } from './providers/baileys.provider';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GameNotificationsListener } from './listeners/game-notifications.listener';
import { BirthdayNotificationsListener } from './listeners/birthday-notifications.listener';
import { GamesModule } from '../games/games.module';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancesModule } from '../finances/finances.module';
import { env } from '../config/env';

const isBaileys = env.WHATSAPP_MODE === 'baileys';
const providerClass = isBaileys ? BaileysProvider : CliSimulatorProvider;

@Module({
  imports: [
    GamesModule,
    UsersModule,
    PrismaModule,
    FinancesModule,
  ],
  controllers: isBaileys ? [WhatsappController] : [],
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      useClass: providerClass,
    },
    WhatsappService,
    InfoCommandsService,
    MutatingCommandsService,
    MessageHandlerService,
    GameNotificationsListener,
    BirthdayNotificationsListener,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {
  constructor(
    private messageHandler: MessageHandlerService,
    @Inject(WHATSAPP_PROVIDER) private provider: { setMessageHandler?: (h: MessageHandlerService) => void },
  ) {
    if (provider.setMessageHandler) {
      provider.setMessageHandler(messageHandler);
    }
  }
}
