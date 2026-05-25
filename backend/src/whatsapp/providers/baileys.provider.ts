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
  private lidToPhone = new Map<string, string>();

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
          await this.buildLidToPhoneMap();
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
          const phone = await this.resolvePhone(participant);
          // Pass either the resolved phone or the raw LID number for DB lookup
          const phoneOrLid = phone || participant.split(':')[0].split('@')[0];

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          const mentionedJids: string[] =
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

          if (!text || !this.messageHandler) continue;

          // Normalize: replace any mention of the bot (by phone or LID) with @z
          let normalizedText = text;
          const botJid = this.sock.user?.id;
          const botLid = this.sock.user?.lid;
          if (botJid || botLid) {
            const botNumber = botJid?.split(':')[0].split('@')[0] || '';
            const botLidNumber = botLid?.split(':')[0].split('@')[0] || '';
            // Replace @botNumber or @botLid with @z
            if (botNumber) {
              normalizedText = normalizedText.replace(new RegExp(`@${botNumber}`, 'g'), '@z');
            }
            if (botLidNumber) {
              normalizedText = normalizedText.replace(new RegExp(`@${botLidNumber}`, 'g'), '@z');
            }
            // Also check mentionedJids for the bot's JID/LID
            for (const jid of mentionedJids) {
              const jidNumber = jid.split(':')[0].split('@')[0];
              if (jid === botJid || jid === botLid ||
                  jidNumber === botNumber || jidNumber === botLidNumber) {
                normalizedText = normalizedText.replace(new RegExp(`@${jidNumber}`, 'g'), '@z');
              }
            }
          }
          // Fallback: any @<digits> at the start that didn't match, check if it's in mentionedJids
          if (/^@\d+/.test(normalizedText) && mentionedJids.length > 0) {
            const mentionNumber = mentionedJids[0].split(':')[0].split('@')[0];
            normalizedText = normalizedText.replace(new RegExp(`^@${mentionNumber}`), '@z');
          }

          // Resolve mentioned JIDs (LIDs) to phone-based JIDs
          const resolvedMentions: string[] = [];
          for (const jid of mentionedJids) {
            const resolvedPhone = await this.resolvePhone(jid);
            if (resolvedPhone) {
              resolvedMentions.push(`${resolvedPhone}@s.whatsapp.net`);
            } else {
              resolvedMentions.push(jid);
            }
          }

          // Pass rawLid for auto-saving LID mapping when user is found
          const rawLid = participant.includes('@lid') ? participant.split(':')[0].split('@')[0] : undefined;
          await this.messageHandler.handleMessage(phoneOrLid, normalizedText, from, resolvedMentions, rawLid).catch((e) =>
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

  private async buildLidToPhoneMap(): Promise<void> {
    if (!this.groupId || !this.sock) return;
    try {
      const metadata = await this.sock.groupMetadata(this.groupId);
      const participants = metadata?.participants || [];
      this.logger.log(`[LID MAP] Grupo tiene ${participants.length} participantes`);

      // Log raw participant data for diagnostics
      for (const p of participants) {
        this.logger.log(`[LID MAP] Participante: id=${p.id} lid=${p.lid || 'N/A'}`);
      }

      for (const p of participants) {
        const id: string = p.id || '';
        const lid: string = p.lid || '';

        if (id.includes('@s.whatsapp.net') && lid) {
          const phoneNum = id.split(':')[0].split('@')[0];
          const lidNum = lid.split(':')[0].split('@')[0];
          this.lidToPhone.set(lidNum, phoneNum);
          this.lidToPhone.set(lid, phoneNum);
        }

        // If participant id is LID-based, try to cross-reference with our DB
        if (id.includes('@lid')) {
          const lidNum = id.split(':')[0].split('@')[0];
          // Will try to match later via onWhatsApp
          this.lidToPhone.set(id, lidNum);
        }
      }

      // Use onWhatsApp() to resolve known phone numbers to their LIDs
      const users = await this.prisma.user.findMany({ select: { phone: true } });
      for (const u of users) {
        if (!u.phone) continue;
        try {
          const [result] = await this.sock.onWhatsApp(u.phone);
          if (result?.exists && result.jid) {
            const jidNum = result.jid.split(':')[0].split('@')[0];
            this.lidToPhone.set(jidNum, u.phone);
            this.lidToPhone.set(result.jid, u.phone);
            this.logger.log(`[LID MAP] onWhatsApp(${u.phone}) -> jid=${result.jid}`);

            // If result also has lid field
            if (result.lid) {
              const lidNum = result.lid.split(':')[0].split('@')[0];
              this.lidToPhone.set(lidNum, u.phone);
              this.lidToPhone.set(result.lid, u.phone);
            }
          }
        } catch (e) {
          this.logger.warn(`[LID MAP] No se pudo resolver ${u.phone}: ${e}`);
        }
      }

      this.logger.log(`[LID MAP] Mapa final con ${this.lidToPhone.size} entradas`);
    } catch (e) {
      this.logger.error('Error construyendo mapa LID->Phone:', e);
    }
  }

  private async resolvePhone(participant: string): Promise<string | null> {
    if (!participant) return null;

    // If it's a regular phone JID (number@s.whatsapp.net or number:device@s.whatsapp.net)
    if (participant.includes('@s.whatsapp.net')) {
      return participant.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    }

    // It's a LID — look up in our map
    const lidNumber = participant.split(':')[0].split('@')[0];

    if (this.lidToPhone.has(lidNumber)) {
      return this.lidToPhone.get(lidNumber)!;
    }
    if (this.lidToPhone.has(participant)) {
      return this.lidToPhone.get(participant)!;
    }

    // Rebuild map in case there's a new participant
    await this.buildLidToPhoneMap();

    if (this.lidToPhone.has(lidNumber)) {
      return this.lidToPhone.get(lidNumber)!;
    }

    return null;
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

  async getGroups(): Promise<Array<{ id: string; name: string; participants: number }>> {
    if (!this.sock || !this.connected) return [];
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      return Object.values(groups).map((g: any) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length || 0,
      }));
    } catch (e) {
      this.logger.error('Error obteniendo grupos:', e);
      return [];
    }
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
