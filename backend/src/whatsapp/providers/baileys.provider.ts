import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { WhatsappProvider } from '../whatsapp.interface';
import { MessageHandlerService } from '../message-handler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { usePrismaAuthState } from './prisma-auth-state';

@Injectable()
export class BaileysProvider implements WhatsappProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp Baileys');
  private sock: any = null;
  private connected = false;
  private groupId: string;
  private messageHandler?: MessageHandlerService;
  private currentQR: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(private readonly prisma: PrismaService) {
    this.groupId = process.env.WHATSAPP_GROUP_ID || '';
  }

  setMessageHandler(handler: MessageHandlerService) {
    this.messageHandler = handler;
  }

  getQR(): string | null {
    return this.currentQR;
  }

  getStatus(): string {
    return this.connectionStatus;
  }

  async onModuleInit() {
    if (!this.groupId) {
      this.logger.warn('WHATSAPP_GROUP_ID no configurado, no se recibirán mensajes del grupo');
    }
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.sock) {
      this.sock.end();
    }
  }

  private async connect() {
    this.connectionStatus = 'connecting';
    try {
      const baileys = await import('@whiskeysockets/baileys' as any);
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { DisconnectReason } = baileys;

      const { state, saveCreds } = await usePrismaAuthState(this.prisma);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.currentQR = qr;
          this.logger.log('Nuevo QR generado — escanéalo en /api/whatsapp/qr');
        }

        if (connection === 'open') {
          this.connected = true;
          this.connectionStatus = 'connected';
          this.currentQR = null;
          this.logger.log('WhatsApp conectado exitosamente');
        } else if (connection === 'close') {
          this.connected = false;
          this.connectionStatus = 'disconnected';
          const code = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          this.logger.warn(`Conexión cerrada (código ${code}). Reconectando: ${shouldReconnect}`);
          if (shouldReconnect) {
            setTimeout(() => this.connect(), 5000);
          } else {
            this.logger.warn('Sesión cerrada por logout. Borra la sesión de DB y re-escanea el QR.');
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
      this.connectionStatus = 'disconnected';
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

  async logout(): Promise<void> {
    await this.prisma.whatsappSession.deleteMany();
    if (this.sock) {
      this.sock.end();
      this.sock = null;
    }
    this.connected = false;
    this.connectionStatus = 'disconnected';
    this.currentQR = null;
    this.logger.log('Sesión eliminada. Reinicia para generar nuevo QR.');
  }
}
