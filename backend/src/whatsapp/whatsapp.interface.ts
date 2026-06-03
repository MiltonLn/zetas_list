export interface WhatsappProvider {
  /** Resolves to true if the message was actually sent, false if it was dropped. */
  sendMessage(to: string, message: string): Promise<boolean>;
  /** Resolves to true if the message was actually sent, false if it was dropped. */
  sendToGroup(message: string): Promise<boolean>;
  isConnected(): boolean;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
