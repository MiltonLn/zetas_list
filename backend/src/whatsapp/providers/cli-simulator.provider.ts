import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as readline from 'readline';
import { WhatsappProvider } from '../whatsapp.interface';
import { MessageHandlerService } from '../message-handler.service';

@Injectable()
export class CliSimulatorProvider implements WhatsappProvider, OnModuleInit {
  private readonly logger = new Logger('WhatsApp CLI Simulator');
  private messageHandler?: MessageHandlerService;

  setMessageHandler(handler: MessageHandlerService) {
    this.messageHandler = handler;
  }

  onModuleInit() {
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
      this.messageHandler.handleMessage(phone, message, 'cli-group').catch((e) =>
        this.logger.error('Error procesando mensaje:', e),
      );
    });
  }

  async sendMessage(to: string, message: string): Promise<void> {
    this.logger.log(`[SALIDA → ${to}]\n${message}`);
  }

  async sendToGroup(message: string): Promise<void> {
    this.logger.log(`[SALIDA → GRUPO]\n${message}`);
  }

  isConnected(): boolean {
    return true;
  }
}
