import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as readline from 'readline';
import { WhatsappProvider, SendOptions } from '../whatsapp.interface';
import { MessageHandlerService } from '../message-handler.service';
import { isProduction } from '../../config/env';

@Injectable()
export class CliSimulatorProvider implements WhatsappProvider, OnModuleInit {
  private readonly logger = new Logger('WhatsApp CLI Simulator');
  private messageHandler?: MessageHandlerService;

  setMessageHandler(handler: MessageHandlerService) {
    this.messageHandler = handler;
  }

  onModuleInit() {
    if (isProduction) {
      this.logger.log('CLI Simulator deshabilitado en producción. Setea WHATSAPP_MODE=baileys para WhatsApp real.');
      return;
    }

    this.logger.log('=== MODO SIMULADOR DE WHATSAPP ACTIVO ===');
    this.logger.log('Escribe mensajes simulando ser un número de teléfono');
    this.logger.log('Formato: <phone>: <mensaje>');
    this.logger.log('Ejemplo: 3001234567: @Z anotame');
    this.logger.log('=========================================');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed || !this.messageHandler) return;

      const match = trimmed.match(/^(\+?\d+):\s*(.+)$/);
      if (!match) {
        this.logger.warn('Formato inválido. Usa: <phone>: <mensaje>');
        return;
      }

      const [, phone, message] = match;
      this.logger.log(`[ENTRADA] ${phone}: ${message}`);

      const mentionedJids: string[] = [];
      const mentionMatches = message.matchAll(/@(\d{10,15})/g);
      for (const m of mentionMatches) {
        mentionedJids.push(`${m[1]}@s.whatsapp.net`);
      }

      this.messageHandler.handleMessage(phone, message, 'cli-group', mentionedJids).catch((e) =>
        this.logger.error('Error procesando mensaje:', e),
      );
    });
  }

  async sendMessage(to: string, message: string, options?: SendOptions): Promise<boolean> {
    const mentions = options?.mentions?.length ? ` (menciona: ${options.mentions.join(', ')})` : '';
    this.logger.log(`[SALIDA → ${to}]${mentions}\n${message}`);
    return true;
  }

  async sendToGroup(message: string, options?: SendOptions): Promise<boolean> {
    const mentions = options?.mentions?.length ? ` (menciona: ${options.mentions.join(', ')})` : '';
    this.logger.log(`[SALIDA → GRUPO]${mentions}\n${message}`);
    return true;
  }

  isConnected(): boolean {
    return true;
  }
}
