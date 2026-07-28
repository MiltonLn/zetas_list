import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsappService } from '../whatsapp.service';
import { BirthdaysTodayEvent, UserEvent } from '../../users/events/user-events';
import { reportCaughtError } from '../../common/errors/report-caught-error';

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
export class BirthdayNotificationsListener {
  private readonly logger = new Logger(BirthdayNotificationsListener.name);

  constructor(private whatsapp: WhatsappService) {}

  @OnEvent(UserEvent.BirthdaysToday)
  async onBirthdaysToday({ users }: BirthdaysTodayEvent): Promise<boolean> {
    if (users.length === 0) return false;

    const phones = users.map((u) => u.phone);
    const message = pickTemplate(Math.random())(phones.map((p) => `@${p}`).join(', '));

    try {
      return await this.whatsapp.sendToGroup(message, { mentions: phones });
    } catch (e) {
      reportCaughtError(this.logger, 'Error enviando felicitaciones de cumpleaños', e);
      return false;
    }
  }
}
