export interface SendOptions {
  /**
   * Phone numbers to @mention in the message. The message text must include
   * the matching `@<number>` tokens; the provider attaches the WhatsApp
   * mention metadata so those people get notified.
   */
  mentions?: string[];
}

export interface WhatsappProvider {
  sendMessage(to: string, message: string, options?: SendOptions): Promise<void>;
  sendToGroup(message: string, options?: SendOptions): Promise<void>;
  isConnected(): boolean;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
