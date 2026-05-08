import { Module, forwardRef, Inject } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MessageHandlerService } from './message-handler.service';
import { CliSimulatorProvider } from './providers/cli-simulator.provider';
import { BaileysProvider } from './providers/baileys.provider';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesModule } from '../games/games.module';
import { UsersModule } from '../users/users.module';

const isCli = process.env.WHATSAPP_MODE !== 'baileys';
const providerClass = isCli ? CliSimulatorProvider : BaileysProvider;

@Module({
  imports: [forwardRef(() => GamesModule), UsersModule],
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      useClass: providerClass,
    },
    WhatsappService,
    MessageHandlerService,
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
