import { ModuleMetadata } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GameNotifier } from '../events/game-notifier.service';
import { GameNotificationsListener } from '../../whatsapp/listeners/game-notifications.listener';
import { WhatsappService } from '../../whatsapp/whatsapp.service';

/**
 * Wires the real notifier, event bus and WhatsApp listener into a test module.
 *
 * The games module only emits domain events now, but what the group actually
 * reads is still a contract worth testing. Running the specs through the real
 * listener keeps the message assertions meaningful end to end, instead of
 * freezing a payload shape that could drift from the copy.
 *
 * Requires `await module.init()` so `@OnEvent` handlers get registered.
 */
export function notificationHarness(whatsapp: {
  sendToGroup: jest.Mock;
}): Required<Pick<ModuleMetadata, 'imports' | 'providers'>> {
  return {
    imports: [EventEmitterModule.forRoot()],
    providers: [
      GameNotifier,
      GameNotificationsListener,
      { provide: WhatsappService, useValue: whatsapp },
    ],
  };
}
