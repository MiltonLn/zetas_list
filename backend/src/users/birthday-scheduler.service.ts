import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/** Each template receives the mention string (e.g. "@573001234567" or "@573001234567, @573009876543"). */
const TEMPLATES: Array<(mentions: string) => string> = [
  (m) => `🎂 ¡Hoy es el cumpleaños de ${m}! El equipo Zetas te desea un día increíble, que lo celebres con todo 🎉🏐`,
  (m) => `🏐 Equipo, hoy cumple años ${m}! Que sea un día lleno de aces y muchas felicidades 🎉🎂`,
  (m) => `🎉 ${m} hoy sopla velitas! El equipo te manda un abrazo enorme y desea lo mejor en este nuevo año 🏐🎂`,
  (m) => `✨ Un día especial para ${m} — ¡feliz cumpleaños! Que este año venga cargado de victorias dentro y fuera de la cancha 🏐🎊`,
  (m) => `🎊 ¡Felicitaciones ${m}! Hoy es tu día, que lo disfrutes al máximo con familia y amigos 🎂🏐`,
  (m) => `🏐 Hoy el equipo Zetas celebra el cumpleaños de ${m}! Que cada punto de este año sea un ace 🎂🎉`,
  (m) => `🎂 Atención equipo: hoy cumple ${m}! Muchas felicidades, que este año sea tan increíble como tus bloqueos 🏐✨`,
  (m) => `🎉 ¡Feliz cumple ${m}! El equipo te desea salud, alegría y muchos sets ganados este año 🏐🎊`,
  (m) => `🏐 ${m} hoy es tu día especial! El equipo Zetas te manda todo el cariño y las mejores vibras 🎂🎉`,
  (m) => `🎊 ¡Que viva el cumpleañero! Hoy celebramos a ${m} — que este año te traiga mil motivos para festejar 🏐🎂`,
];

export function pickTemplate(rand: number): (mentions: string) => string {
  return TEMPLATES[Math.floor(rand * TEMPLATES.length)];
}

@Injectable()
export class BirthdaySchedulerService {
  private readonly logger = new Logger(BirthdaySchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'America/Bogota' })
  async sendBirthdayGreetings() {
    const now = new Date();

    const candidates = await this.prisma.user.findMany({
      where: { status: UserStatus.active, birthDate: { not: null } },
      select: { id: true, name: true, phone: true, birthDate: true },
    });

    const users = candidates.filter((u) => {
      const bd = new Date(u.birthDate!);
      return bd.getMonth() === now.getMonth() && bd.getDate() === now.getDate();
    });

    if (users.length === 0) return;

    const mentionStr = users.map((u) => `@${u.phone}`).join(', ');
    const template = pickTemplate(Math.random());
    const message = template(mentionStr);
    const phones = users.map((u) => u.phone);

    try {
      await this.whatsapp.sendToGroup(message, { mentions: phones });
      this.logger.log(`Felicitaciones de cumpleaños enviadas a: ${users.map((u) => u.name).join(', ')}`);
    } catch (e) {
      this.logger.error('Error enviando felicitaciones de cumpleaños:', e);
    }
  }
}
