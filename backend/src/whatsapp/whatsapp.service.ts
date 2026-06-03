import { Injectable, Inject } from '@nestjs/common';
import { WhatsappProvider, WHATSAPP_PROVIDER } from './whatsapp.interface';

@Injectable()
export class WhatsappService {
  constructor(@Inject(WHATSAPP_PROVIDER) private provider: WhatsappProvider) {}

  async sendToGroup(message: string): Promise<boolean> {
    return this.provider.sendToGroup(message);
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    return this.provider.sendMessage(to, message);
  }

  isConnected() {
    return this.provider.isConnected();
  }
}
