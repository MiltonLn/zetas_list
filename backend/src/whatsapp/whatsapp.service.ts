import { Injectable, Inject } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER, SendOptions } from './whatsapp.interface';

@Injectable()
export class WhatsappService {
  constructor(@Inject(WHATSAPP_PROVIDER) private provider: WhatsappProvider) {}

  async sendToGroup(message: string, options?: SendOptions) {
    return this.provider.sendToGroup(message, options);
  }

  async sendMessage(to: string, message: string, options?: SendOptions) {
    return this.provider.sendMessage(to, message, options);
  }

  isConnected() {
    return this.provider.isConnected();
  }
}
