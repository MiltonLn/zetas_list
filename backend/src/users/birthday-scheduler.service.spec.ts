import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BirthdaySchedulerService } from './birthday-scheduler.service';
import { UserEvent } from './events/user-events';
import { PrismaService } from '../prisma/prisma.service';

const TODAY = new Date();

function makeBirthdayUser(overrides: { id: string; name: string; phone: string }) {
  return { ...overrides, birthDate: TODAY };
}

const mockPrisma = { user: { findMany: jest.fn() } };
const mockEmitter = { emitAsync: jest.fn() };

describe('BirthdaySchedulerService', () => {
  let service: BirthdaySchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmitter.emitAsync.mockResolvedValue([true]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BirthdaySchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<BirthdaySchedulerService>(BirthdaySchedulerService);
  });

  describe('sendBirthdayGreetings', () => {
    it('no emite nada si no hay cumpleañeros hoy', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.sendBirthdayGreetings();
      expect(mockEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('no emite si hay usuarios activos pero con cumpleaños en otra fecha', async () => {
      const otherDate = new Date(TODAY);
      otherDate.setDate(TODAY.getDate() + 1);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'Ana', phone: '573001111111', birthDate: otherDate },
      ]);
      await service.sendBirthdayGreetings();
      expect(mockEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('emite el evento con el cumpleañero de hoy', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeBirthdayUser({ id: 'u1', name: 'Ana', phone: '573001111111' }),
      ]);
      await service.sendBirthdayGreetings();
      expect(mockEmitter.emitAsync).toHaveBeenCalledWith(UserEvent.BirthdaysToday, {
        users: [{ name: 'Ana', phone: '573001111111' }],
      });
    });

    it('incluye a todos cuando hay varios cumpleañeros el mismo día', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeBirthdayUser({ id: 'u1', name: 'Ana', phone: '573001111111' }),
        makeBirthdayUser({ id: 'u2', name: 'Luis', phone: '573002222222' }),
      ]);
      await service.sendBirthdayGreetings();
      expect(mockEmitter.emitAsync).toHaveBeenCalledWith(UserEvent.BirthdaysToday, {
        users: [
          { name: 'Ana', phone: '573001111111' },
          { name: 'Luis', phone: '573002222222' },
        ],
      });
    });

    it('no lanza si la notificación falla', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeBirthdayUser({ id: 'u1', name: 'Ana', phone: '573001111111' }),
      ]);
      mockEmitter.emitAsync.mockRejectedValue(new Error('WhatsApp down'));
      await expect(service.sendBirthdayGreetings()).resolves.not.toThrow();
    });
  });
});
