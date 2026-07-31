import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import pino from 'pino';
import { WhatsappProvider, SendOptions } from '../whatsapp.interface';
import { MessageHandlerService } from '../message-handler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { usePrismaAuthState } from './prisma-auth-state';
import {
  extractPhoneFromJid,
  isLidJid,
  isPhoneJid,
  normalizeBotMentions,
  resolveNonBotMentions,
  phoneToJid,
} from '../utils/jid-utils';
import { env, isProduction } from '../../config/env';
import { UsersService } from '../../users/users.service';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 5_000;
// When a send arrives while the socket is down, wait up to this long for the
// automatic reconnection (backoff starts at 5s) before giving up. Avoids
// dropping messages during the brief reconnect window after a routine close.
const SEND_WAIT_MS = 12_000;
const SEND_WAIT_POLL_MS = 250;

@Injectable()
export class BaileysProvider implements WhatsappProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp Baileys');
  // Dedicated, quiet logger for Baileys internals. Override with WA_LOG_LEVEL
  // (e.g. 'debug') only when troubleshooting the WhatsApp connection itself.
  private readonly baileysLogger = pino({
    level: env.WA_LOG_LEVEL,
  });
  private sock: any = null;
  private connected = false;
  private groupId: string;
  private messageHandler?: MessageHandlerService;
  private currentQR: string | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private lidToPhone = new Map<string, string>();
  private connectionOpenedAt = 0;
  private reconnectBackoff = INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shuttingDown = false;
  private connectInProgress = false;
  private lidMapBuilding = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {
    this.groupId = env.WHATSAPP_GROUP_ID;
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
      this.logger.warn('WHATSAPP_GROUP_ID no configurado — el bot NO procesará mensajes');
    }
    await this.connect();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    this.teardown();
  }

  private teardown() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end();
      } catch {
        // Socket may already be closed
      }
      this.sock = null;
    }
    this.connected = false;
    this.connectInProgress = false;
  }

  private scheduleReconnect() {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.connectionStatus = 'reconnecting';
    this.logger.log(`Reconectando en ${this.reconnectBackoff / 1000}s...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.shuttingDown) {
        await this.connect();
      }
    }, this.reconnectBackoff);
    this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, MAX_BACKOFF_MS);
  }

  private async connect() {
    if (this.shuttingDown || this.connectInProgress) return;
    this.connectInProgress = true;
    this.teardown();
    this.connectionStatus = 'connecting';

    try {
      const baileys = await import('@whiskeysockets/baileys' as any);
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { DisconnectReason, fetchLatestBaileysVersion } = baileys;

      const { state, saveCreds } = await usePrismaAuthState(this.prisma);
      const { version, isLatest, error: versionError } = await fetchLatestBaileysVersion({
        signal: AbortSignal.timeout(10_000),
      });
      if (versionError) {
        this.logger.warn(
          `No se pudo consultar la versión más reciente de WhatsApp; usando ${version.join('.')}`,
        );
      } else {
        this.logger.log(
          `Versión de WhatsApp seleccionada: ${version.join('.')} (actual: ${isLatest})`,
        );
      }

      this.sock = makeWASocket({
        auth: state,
        // WhatsApp periodically rejects stale protocol versions with code 405
        // before emitting a QR. Resolve it at connection time instead of relying
        // on the version bundled when Baileys was published.
        version,
        printQRInTerminal: !isProduction,
        // Baileys' default logger dumps Signal session internals (including
        // private keys). We pin it to warn to keep our logs clean and avoid
        // leaking key material.
        logger: this.baileysLogger,
        // Don't generate link previews: it dynamically imports the optional
        // 'link-preview-js' package (not installed), which fails on every
        // message containing a URL with "url generation failed"
        // (ERR_MODULE_NOT_FOUND). We don't need previews; this removes the noise.
        generateHighQualityLinkPreview: false,
      });

      this.sock.ev.on('creds.update', () => {
        saveCreds().catch((e: unknown) => this.logger.error('Error guardando credenciales:', e));
      });

      this.sock.ev.on('connection.update', async (update: any) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.currentQR = qr;
            this.logger.log('Nuevo QR generado — escanéalo en /api/whatsapp/qr');
          }

          if (connection === 'open') {
            this.connected = true;
            this.connectionStatus = 'connected';
            this.currentQR = null;
            this.connectionOpenedAt = Date.now();
            this.reconnectBackoff = INITIAL_BACKOFF_MS;
            this.logger.log('WhatsApp conectado exitosamente');
            await this.buildLidToPhoneMap();
          } else if (connection === 'close') {
            this.connected = false;
            if (this.shuttingDown) {
              this.connectionStatus = 'disconnected';
              return;
            }
            const code = lastDisconnect?.error?.output?.statusCode;
            // Code 440 (connectionReplaced): another connection took over this
            // WhatsApp session. Reconnecting would just kick the other one off
            // and trigger an endless replace ping-pong, so we stay down and ask
            // the operator to remove the duplicate before restarting.
            const replaced = code === DisconnectReason.connectionReplaced;
            const shouldReconnect = code !== DisconnectReason.loggedOut && !replaced;
            this.logger.warn(`Conexión cerrada (código ${code}). Reconectando: ${shouldReconnect}`);
            if (replaced) {
              this.connectionStatus = 'disconnected';
              this.logger.error(
                'Sesión de WhatsApp reemplazada por otra conexión (código 440). NO se reconectará ' +
                  'para evitar un ciclo de reemplazos. Verifica que solo UNA instancia del backend use ' +
                  'esta sesión (la sesión vive en Postgres) y que el número no esté vinculado en otro ' +
                  'dispositivo/WhatsApp Web. Reinicia el backend tras eliminar el duplicado.',
              );
            } else if (shouldReconnect) {
              this.scheduleReconnect();
            } else {
              this.connectionStatus = 'disconnected';
              this.logger.warn('Sesión cerrada por logout. Borra la sesión de DB y re-escanea el QR.');
            }
          }
        } catch (e) {
          this.logger.error('Error en connection.update handler:', e);
        }
      });

      this.sock.ev.on('messages.upsert', async (upsert: any) => {
        try {
          if (upsert.type !== 'notify') return;
          for (const msg of upsert.messages) {
            await this.processMessage(msg);
          }
        } catch (e) {
          this.logger.error('Error en messages.upsert handler:', e);
        }
      });
    } catch (e) {
      this.connectionStatus = 'disconnected';
      this.logger.error('Error inicializando Baileys:', e);
      if (!this.shuttingDown) {
        this.scheduleReconnect();
      }
    } finally {
      this.connectInProgress = false;
    }
  }

  private async processMessage(msg: any): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;

    const rawTs = msg.messageTimestamp;
    const timestamp = typeof rawTs === 'number'
      ? rawTs * 1000
      : typeof rawTs?.low === 'number'
        ? rawTs.low * 1000
        : Date.now();
    if (timestamp < this.connectionOpenedAt) return;

    const from = msg.key.remoteJid;
    const isGroup = from?.endsWith('@g.us');

    // Reject all messages if groupId not configured; only process target group
    if (!this.groupId || !isGroup || from !== this.groupId) return;

    const participant = msg.key.participant || '';
    let phone = await this.resolvePhone(participant);

    // WhatsApp may hide the phone number for accounts using usernames and send
    // only their stable LID. Use the mapping already persisted on our user
    // record instead of discarding commands from those accounts.
    if (!phone && isLidJid(participant)) {
      const user = await this.users.findByPhoneOrLid(participant);
      phone = user?.phone ?? null;
      if (phone) {
        this.logger.log('[MSG] Remitente resuelto mediante LID almacenado');
      }
    }

    if (!phone) {
      this.logger.warn(`[MSG] No se pudo resolver teléfono para participant=${participant}`);
      return;
    }

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    const mentionedJids: string[] =
      msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (!text || !this.messageHandler) return;

    const botJid = this.sock?.user?.id;
    const botLid = this.sock?.user?.lid;
    const normalizedText = normalizeBotMentions(text, botJid, botLid, mentionedJids);

    const resolvedMentions = await resolveNonBotMentions(
      mentionedJids,
      botJid,
      botLid,
      (jid) => this.resolvePhone(jid),
    );

    await this.messageHandler.handleMessage(phone, normalizedText, from, resolvedMentions).catch((e) =>
      this.logger.error('Error procesando mensaje:', e),
    );
  }

  private async buildLidToPhoneMap(): Promise<void> {
    if (!this.groupId || !this.sock || this.lidMapBuilding) return;
    this.lidMapBuilding = true;
    try {
      const metadata = await this.sock.groupMetadata(this.groupId);
      const participants = metadata?.participants || [];
      this.logger.log(`[LID MAP] Grupo tiene ${participants.length} participantes`);

      const newMap = new Map<string, string>();
      for (const p of participants) {
        const lid: string = p.id || '';
        const phoneJid: string = p.phoneNumber || p.phone || '';

        if (lid.includes('@lid') && phoneJid) {
          const lidNum = extractPhoneFromJid(lid);
          const phoneNum = extractPhoneFromJid(phoneJid);
          newMap.set(lidNum, phoneNum);
          newMap.set(lid, phoneNum);
        }
      }

      this.lidToPhone = newMap;
      this.logger.log(`[LID MAP] Mapa construido con ${this.lidToPhone.size} entradas`);
    } catch (e) {
      this.logger.error('Error construyendo mapa LID->Phone:', e);
    } finally {
      this.lidMapBuilding = false;
    }
  }

  async resolvePhone(participant: string): Promise<string | null> {
    if (!participant) return null;

    if (isPhoneJid(participant)) {
      return extractPhoneFromJid(participant);
    }

    const lidNumber = extractPhoneFromJid(participant);

    if (this.lidToPhone.has(lidNumber)) {
      return this.lidToPhone.get(lidNumber)!;
    }
    if (this.lidToPhone.has(participant)) {
      return this.lidToPhone.get(participant)!;
    }

    await this.buildLidToPhoneMap();

    return this.lidToPhone.get(lidNumber) ?? this.lidToPhone.get(participant) ?? null;
  }

  /**
   * Waits up to `timeoutMs` for the socket to (re)connect. Returns true as soon
   * as the connection is up, false if the timeout elapses or we're shutting down.
   */
  private async waitForConnection(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (!this.connected && !this.shuttingDown && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SEND_WAIT_POLL_MS));
    }
    return this.connected;
  }

  async sendMessage(to: string, message: string, options?: SendOptions): Promise<boolean> {
    if (!this.connected) {
      // Routine WebSocket drops trigger an automatic reconnect; give it a short
      // window instead of dropping the message immediately.
      this.logger.warn(`No conectado. Esperando reconexión para enviar a ${to}...`);
      const reconnected = await this.waitForConnection(SEND_WAIT_MS);
      if (!reconnected) {
        this.logger.error(`No se pudo reconectar a tiempo. Mensaje NO enviado para ${to}`);
        return false;
      }
    }
    if (!this.sock) {
      this.logger.error(`Socket no disponible. Mensaje NO enviado para ${to}`);
      return false;
    }
    try {
      const jid = phoneToJid(to);
      const mentions = options?.mentions?.map((p) => phoneToJid(p));
      await this.sock.sendMessage(jid, {
        text: message,
        ...(mentions && mentions.length > 0 ? { mentions } : {}),
      });
      return true;
    } catch (e) {
      this.logger.error(`Error enviando mensaje a ${to}:`, e);
      return false;
    }
  }

  async sendToGroup(message: string, options?: SendOptions): Promise<boolean> {
    if (!this.groupId) {
      this.logger.warn('WHATSAPP_GROUP_ID no configurado');
      return false;
    }
    return this.sendMessage(this.groupId, message, options);
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

  async getGroupParticipants(): Promise<Array<{ lid: string; phone: string | null }>> {
    if (!this.sock || !this.connected || !this.groupId) return [];
    try {
      const metadata = await this.sock.groupMetadata(this.groupId);
      const participants = metadata?.participants || [];
      return participants.map((p: any) => {
        const lid: string = p.id || '';
        const phoneJid: string = p.phoneNumber || p.phone || '';
        const phone = phoneJid
          ? phoneJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
          : null;
        return { lid, phone };
      });
    } catch (e) {
      this.logger.error('Error obteniendo participantes:', e);
      return [];
    }
  }

  async logout(): Promise<void> {
    this.shuttingDown = true;
    await this.prisma.whatsappSession.deleteMany();
    this.teardown();
    this.connectionStatus = 'disconnected';
    this.currentQR = null;
    this.logger.log('Sesión eliminada. Reinicia para generar nuevo QR.');
  }
}
