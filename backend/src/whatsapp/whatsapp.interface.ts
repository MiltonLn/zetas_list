export interface SendOptions {
  /**
   * Phone numbers to @mention in the message. The message text must include
   * the matching `@<number>` tokens; the provider attaches the WhatsApp
   * mention metadata so those people get notified.
   */
  mentions?: string[];
}

export interface WhatsappProvider {
  /** Resolves to true if the message was actually sent, false if it was dropped. */
  sendMessage(to: string, message: string, options?: SendOptions): Promise<boolean>;
  /** Resolves to true if the message was actually sent, false if it was dropped. */
  sendToGroup(message: string, options?: SendOptions): Promise<boolean>;
  isConnected(): boolean;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
