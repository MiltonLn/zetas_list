import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserEvent } from './events/user-events';
import { reportCaughtError } from '../common/errors/report-caught-error';

@Injectable()
export class BirthdaySchedulerService {
  private readonly logger = new Logger(BirthdaySchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
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

    try {
      await this.emitter.emitAsync(UserEvent.BirthdaysToday, {
        users: users.map((u) => ({ name: u.name, phone: u.phone })),
      });
      this.logger.log(
        `Felicitaciones de cumpleaños enviadas a: ${users.map((u) => u.name).join(', ')}`,
      );
    } catch (e) {
      reportCaughtError(this.logger, 'Error enviando felicitaciones de cumpleaños', e);
    }
  }
}
