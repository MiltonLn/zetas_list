import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { WhatsappProvider } from '../whatsapp.interface';
import { MessageHandlerService } from '../message-handler.service';

/**
 * Baileys WhatsApp provider.
 * Uses dynamic import because @whiskeysockets/baileys is ESM-only.
 *
 * Install: npm install @whiskeysockets/baileys qrcode-terminal
 * (these are optional peer deps, not listed in package.json to avoid
 * install errors in environments where the CLI simulator is used)
 */
@Injectable()
export class BaileysProvider implements WhatsappProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp Baileys');
  private sock: any = null;
  private connected = false;
  private groupId: string;
  private messageHandler?: MessageHandlerService;

  constructor() {
    this.groupId = process.env.WHATSAPP_GROUP_ID || '';
  }

  setMessageHandler(handler: MessageHandlerService) {
    this.messageHandler = handler;
  }

  async onModuleInit() {
    if (!this.groupId) {
      this.logger.warn('WHATSAPP_GROUP_ID no configurado, no se recibirán mensajes del grupo');
    }
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.sock) {
      await this.sock.logout();
    }
  }

  private async connect() {
    try {
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } =
        await import('@whiskeysockets/baileys' as any);

      const { state, saveCreds } = await useMultiFileAuthState('whatsapp-session');

      this.sock = makeWASocket({ auth: state, printQRInTerminal: true });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          this.connected = true;
          this.logger.log('WhatsApp conectado exitosamente');
        } else if (connection === 'close') {
          this.connected = false;
          const code = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          this.logger.warn(`Conexión cerrada (código ${code}). Reconectando: ${shouldReconnect}`);
          if (shouldReconnect) {
            setTimeout(() => this.connect(), 5000);
          }
        }
      });

      this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const from = msg.key.remoteJid;
          const isGroup = from?.endsWith('@g.us');
          if (!isGroup || (this.groupId && from !== this.groupId)) continue;

          const participant = msg.key.participant || '';
          const phone = participant.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          const mentionedJids: string[] =
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

          if (!text || !this.messageHandler) continue;

          await this.messageHandler.handleMessage(phone, text, from, mentionedJids).catch((e) =>
            this.logger.error('Error procesando mensaje:', e),
          );
        }
      });
    } catch (e) {
      this.logger.error('Error inicializando Baileys:', e);
      this.logger.warn('Asegúrate de tener instalado @whiskeysockets/baileys');
    }
  }

  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.sock || !this.connected) {
      this.logger.warn(`No conectado. Mensaje perdido para ${to}`);
      return;
    }
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text: message });
  }

  async sendToGroup(message: string): Promise<void> {
    if (!this.groupId) {
      this.logger.warn('WHATSAPP_GROUP_ID no configurado');
      return;
    }
    await this.sendMessage(this.groupId, message);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
