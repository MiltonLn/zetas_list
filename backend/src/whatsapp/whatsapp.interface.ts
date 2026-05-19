export interface WhatsappProvider {
  sendMessage(to: string, message: string): Promise<void>;
  sendToGroup(message: string): Promise<void>;
  isConnected(): boolean;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
