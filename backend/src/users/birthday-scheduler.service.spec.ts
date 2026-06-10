import { Test, TestingModule } from '@nestjs/testing';
import { BirthdaySchedulerService, pickTemplate } from './birthday-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const mockPrisma = { $queryRaw: jest.fn() };
const mockWhatsapp = { sendToGroup: jest.fn() };

describe('BirthdaySchedulerService', () => {
  let service: BirthdaySchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWhatsapp.sendToGroup.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BirthdaySchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();

    service = module.get<BirthdaySchedulerService>(BirthdaySchedulerService);
  });

  describe('sendBirthdayGreetings', () => {
    it('no envía nada si no hay cumpleañeros hoy', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await service.sendBirthdayGreetings();
      expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
    });

    it('envía mensaje al grupo con la mención del cumpleañero', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'u1', name: 'Ana', phone: '573001111111' },
      ]);
      await service.sendBirthdayGreetings();
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledTimes(1);
      const [msg, opts] = mockWhatsapp.sendToGroup.mock.calls[0];
      expect(msg).toContain('@573001111111');
      expect(opts.mentions).toEqual(['573001111111']);
    });

    it('menciona a todos cuando hay varios cumpleañeros el mismo día', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'u1', name: 'Ana', phone: '573001111111' },
        { id: 'u2', name: 'Luis', phone: '573002222222' },
      ]);
      await service.sendBirthdayGreetings();
      expect(mockWhatsapp.sendToGroup).toHaveBeenCalledTimes(1);
      const [msg, opts] = mockWhatsapp.sendToGroup.mock.calls[0];
      expect(msg).toContain('@573001111111');
      expect(msg).toContain('@573002222222');
      expect(opts.mentions).toEqual(['573001111111', '573002222222']);
    });

    it('no lanza si sendToGroup falla', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'u1', name: 'Ana', phone: '573001111111' },
      ]);
      mockWhatsapp.sendToGroup.mockRejectedValue(new Error('WhatsApp down'));
      await expect(service.sendBirthdayGreetings()).resolves.not.toThrow();
    });
  });

  describe('pickTemplate', () => {
    it('devuelve una función para cualquier valor entre 0 y 1', () => {
      for (let i = 0; i < 10; i++) {
        const fn = pickTemplate(i / 10);
        expect(typeof fn).toBe('function');
        expect(fn('@573001111111')).toContain('@573001111111');
      }
    });

    it('distintos valores de rand producen distintos templates', () => {
      const results = Array.from({ length: 10 }, (_, i) =>
        pickTemplate(i / 10)('@573001111111'),
      );
      const unique = new Set(results);
      expect(unique.size).toBeGreaterThan(1);
    });
  });
});
