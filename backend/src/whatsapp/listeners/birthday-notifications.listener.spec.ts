import { Test, TestingModule } from '@nestjs/testing';
import { BirthdayNotificationsListener, pickTemplate } from './birthday-notifications.listener';
import { WhatsappService } from '../whatsapp.service';

const mockWhatsapp = { sendToGroup: jest.fn() };

describe('BirthdayNotificationsListener', () => {
  let listener: BirthdayNotificationsListener;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWhatsapp.sendToGroup.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BirthdayNotificationsListener,
        { provide: WhatsappService, useValue: mockWhatsapp },
      ],
    }).compile();

    listener = module.get(BirthdayNotificationsListener);
  });

  it('envía mensaje al grupo con la mención del cumpleañero', async () => {
    await listener.onBirthdaysToday({ users: [{ name: 'Ana', phone: '573001111111' }] });

    expect(mockWhatsapp.sendToGroup).toHaveBeenCalledTimes(1);
    const [msg, opts] = mockWhatsapp.sendToGroup.mock.calls[0];
    expect(msg).toContain('@573001111111');
    expect(opts.mentions).toEqual(['573001111111']);
  });

  it('menciona a todos cuando hay varios cumpleañeros el mismo día', async () => {
    await listener.onBirthdaysToday({
      users: [
        { name: 'Ana', phone: '573001111111' },
        { name: 'Luis', phone: '573002222222' },
      ],
    });

    const [msg, opts] = mockWhatsapp.sendToGroup.mock.calls[0];
    expect(msg).toContain('@573001111111');
    expect(msg).toContain('@573002222222');
    expect(opts.mentions).toEqual(['573001111111', '573002222222']);
  });

  it('no envía nada si el evento llega sin cumpleañeros', async () => {
    await expect(listener.onBirthdaysToday({ users: [] })).resolves.toBe(false);
    expect(mockWhatsapp.sendToGroup).not.toHaveBeenCalled();
  });

  it('reporta no entregado si sendToGroup falla, sin lanzar', async () => {
    mockWhatsapp.sendToGroup.mockRejectedValue(new Error('WhatsApp down'));

    await expect(
      listener.onBirthdaysToday({ users: [{ name: 'Ana', phone: '573001111111' }] }),
    ).resolves.toBe(false);
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
      expect(new Set(results).size).toBeGreaterThan(1);
    });
  });
});
