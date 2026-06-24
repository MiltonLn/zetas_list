import { Test, TestingModule } from '@nestjs/testing';
import { MessageHandlerService } from './message-handler.service';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { Role } from '@prisma/client';
import { AlreadyRegisteredException, ProxyLimitExceededException } from '../games/exceptions';

const mockWp = { sendToGroup: jest.fn(), sendMessage: jest.fn(), isConnected: jest.fn() };
const mockGames = {
  register: jest.fn(),
  registerGuest: jest.fn(),
  confirmRegistration: jest.fn(),
  removeRegistration: jest.fn(),
  findOne: jest.fn(),
  complete: jest.fn(),
  promoteNext: jest.fn(),
  retryFromWaitingList: jest.fn(),
  formatListForWhatsapp: jest.fn(),
  buildCounts: jest.fn().mockReturnValue('📊 *1/18* cupos ocupados (17 disponibles)'),
  buildGameLink: jest.fn().mockReturnValue(''),
};
const mockUsers = { findByPhone: jest.fn(), setWhatsappLid: jest.fn().mockResolvedValue({}) };
const mockPrisma = { game: { findFirst: jest.fn() } };
const mockFinances = {
  getPendingFines: jest.fn().mockResolvedValue([]),
  hasUnpaidFines: jest.fn().mockResolvedValue(false),
};

function makeActiveGame(regs: any[] = []) {
  return {
    id: 'game-1',
    title: 'Volley 6x6',
    maxMainSpots: 18,
    status: 'registration_open',
    registrations: regs,
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return { id: 'user-1', name: 'Test User', role: Role.member, status: 'active', ...overrides };
}

describe('MessageHandlerService — regex', () => {
  // The service strips accents before matching, so all regexes use plain ASCII.
  // Tests that use accented input call norm() to simulate what dispatch() does.
  function norm(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  const CMD_REGISTER = /^@z\s+(anotame|anotarme|meteme|meterme|meto|apuntame|apuntarme|inscribeme|inscribirme|juego|voy|entro|anotar|anota|apuntar|apunta)\b/i;
  const CMD_UNREGISTER = /^@z\s+(salirme|sacame|sacarme|quitame|quitarme|borrame|borrarme|retirame|retirarme|safo|no\s+voy|no\s+juego|no\s+puedo|salgo|salir)\b/i;
  const CMD_LIST = /^@z\s+(lista|cupos|quienes?\s+van|cuantos|como\s+vamos)\b/i;
  const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;
  const CMD_PAYMENT = /^@z\s+(llave|pago|pagos|transferencia|nequi)\b/i;
  const CMD_ALIASES = /^@z\s+(alias|variantes|sinonimos|alternativas)\b/i;

  describe('CMD_PAYMENT', () => {
    it.each([
      ['@Z llave'],
      ['@z llave'],
      ['@Z pago'],
      ['@Z pagos'],
      ['@Z transferencia'],
      ['@Z nequi'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_PAYMENT.test(cmd)).toBe(true);
    });

    it('NO reconoce texto sin @Z', () => {
      expect(CMD_PAYMENT.test('llave')).toBe(false);
    });
  });

  describe('CMD_REGISTER', () => {
    it.each([
      ['@Z anotame'],
      ['@z anotame'],
      ['@Z anotarme'],
      ['@Z meteme'],
      ['@Z meterme'],
      ['@Z meto'],
      ['@z meto'],
      ['@Z apuntame'],
      ['@Z apuntarme'],
      ['@Z inscribeme'],
      ['@Z inscribirme'],
      ['@Z juego'],
      ['@Z voy'],
      ['@Z entro'],
    ])('reconoce "%s" (plain)', (cmd) => {
      expect(CMD_REGISTER.test(cmd)).toBe(true);
    });

    it.each([
      ['@Z anótame'],
      ['@Z méteme'],
      ['@Z apúntame'],
      ['@Z inscríbeme'],
    ])('reconoce "%s" vía normalización', (cmd) => {
      expect(CMD_REGISTER.test(norm(cmd))).toBe(true);
    });

    it.each([
      ['anotame'],
      ['hola @Z anotame'],
      ['@Z '],
      ['@Z salirme'],
    ])('NO reconoce "%s"', (cmd) => {
      expect(CMD_REGISTER.test(cmd)).toBe(false);
    });
  });

  describe('CMD_UNREGISTER', () => {
    it.each([
      ['@Z salirme'],
      ['@z salirme'],
      ['@Z sacame'],
      ['@Z sacarme'],
      ['@Z quitame'],
      ['@Z quitarme'],
      ['@Z borrame'],
      ['@Z borrarme'],
      ['@Z retirame'],
      ['@Z retirarme'],
      ['@Z safo'],
      ['@z safo'],
      ['@Z no voy'],
      ['@Z no juego'],
      ['@Z no puedo'],
      ['@Z salgo'],
      ['@Z salir'],
      ['@z salir'],
    ])('reconoce "%s" (plain)', (cmd) => {
      expect(CMD_UNREGISTER.test(cmd)).toBe(true);
    });

    it.each([
      ['@Z sácame'],
      ['@Z quítame'],
      ['@Z bórrame'],
      ['@Z retírame'],
    ])('reconoce "%s" vía normalización', (cmd) => {
      expect(CMD_UNREGISTER.test(norm(cmd))).toBe(true);
    });

    it('NO reconoce texto sin @Z', () => {
      expect(CMD_UNREGISTER.test('salirme')).toBe(false);
    });
  });

  describe('CMD_LIST', () => {
    it.each([
      ['@Z lista'],
      ['@Z cupos'],
      ['@Z quienes van'],
      ['@Z cuantos'],
      ['@Z como vamos'],
    ])('reconoce "%s" (plain)', (cmd) => {
      expect(CMD_LIST.test(cmd)).toBe(true);
    });

    it.each([
      ['@Z quiénes van'],
      ['@Z cuántos'],
      ['@Z cómo vamos'],
    ])('reconoce "%s" vía normalización', (cmd) => {
      expect(CMD_LIST.test(norm(cmd))).toBe(true);
    });

    it('lista NO activa CMD_CONFIRM (era un bug previo)', () => {
      const CMD_CONFIRM = /^@z\s+(confirmar|confirmo|confirma|listo|acepto)\b/i;
      expect(CMD_CONFIRM.test('@z lista')).toBe(false);
    });
  });

  describe('CMD_FINISH', () => {
    it.each([
      ['@Z terminar'],
      ['@Z cerrar'],
      ['@Z finalizar'],
      ['@Z completar'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_FINISH.test(cmd)).toBe(true);
    });

    it('NO reconoce sin @Z', () => {
      expect(CMD_FINISH.test('terminar')).toBe(false);
    });
  });

  describe('CMD_PROMOTE', () => {
    const CMD_PROMOTE = /^@z\s+(promover|subir|jalar|meter)\b/i;

    it.each([
      ['@Z promover'],
      ['@z promover'],
      ['@Z subir'],
      ['@Z jalar'],
      ['@Z meter'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_PROMOTE.test(cmd)).toBe(true);
    });

    it('NO reconoce sin @Z', () => {
      expect(CMD_PROMOTE.test('promover')).toBe(false);
    });
  });

  describe('CMD_ALIASES', () => {
    it.each([
      ['@Z alias'],
      ['@Z variantes'],
      ['@Z sinonimos'],
      ['@Z alternativas'],
    ])('reconoce "%s" (plain)', (cmd) => {
      expect(CMD_ALIASES.test(cmd)).toBe(true);
    });

    it('reconoce "@Z sinónimos" vía normalización', () => {
      expect(CMD_ALIASES.test(norm('@Z sinónimos'))).toBe(true);
    });
  });
});

describe('MessageHandlerService — handleMessage', () => {
  let service: MessageHandlerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWp.sendToGroup.mockResolvedValue(undefined);
    mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageHandlerService,
        { provide: WHATSAPP_PROVIDER, useValue: mockWp },
        { provide: GamesService, useValue: mockGames },
        { provide: UsersService, useValue: mockUsers },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FinancesService, useValue: mockFinances },
      ],
    }).compile();

    service = module.get<MessageHandlerService>(MessageHandlerService);
  });

  it('no hace nada si el mensaje no es un comando', async () => {
    await service.handleMessage('111', 'hola como estás', 'group-1');
    expect(mockPrisma.game.findFirst).not.toHaveBeenCalled();
    expect(mockWp.sendToGroup).not.toHaveBeenCalled();
  });

  // ─── lista ─────────────────────────────────────────────────────────────────

  describe('comando lista', () => {
    it('informa que no hay lista cuando no hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);

      await service.handleMessage('111', '@Z lista', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay'));
    });

    it('envía la lista formateada cuando hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockGames.formatListForWhatsapp.mockReturnValue('📋 Lista...');

      await service.handleMessage('111', '@Z lista', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith('📋 Lista...');
    });
  });

  // ─── terminar ──────────────────────────────────────────────────────────────

  describe('comando terminar', () => {
    it('rechaza si el usuario no es admin', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.member }));

      await service.handleMessage('111', '@Z terminar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('administradores'));
      expect(mockGames.complete).not.toHaveBeenCalled();
    });

    it('rechaza si no hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));

      await service.handleMessage('111', '@Z terminar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay'));
    });

    it('completa el juego y envía el reporte para admin', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      mockGames.complete.mockResolvedValue({ game: {}, report: '✅ Reporte final' });

      await service.handleMessage('111', '@Z terminar', 'group-1');
      expect(mockGames.complete).toHaveBeenCalledWith('game-1', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith('✅ Reporte final');
    });
  });

  // ─── anotame ───────────────────────────────────────────────────────────────

  describe('comando anotame', () => {
    it('informa que no hay lista si no hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);

      await service.handleMessage('111', '@Z anotame', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay'));
    });

    it('informa que el número no está registrado si no hay usuario', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(null);

      await service.handleMessage('111', '@Z anotame', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No encontré'));
    });

    it('informa que la cuenta no está activa', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ status: 'banned' }));

      await service.handleMessage('111', '@Z anotame', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('suspendida'));
      expect(mockGames.register).not.toHaveBeenCalled();
    });

    it('anota al usuario y envía confirmación', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.register.mockResolvedValue({ position: 1, isWaitingList: false });
      mockGames.findOne.mockResolvedValue(makeActiveGame([{ isWaitingList: false }]));

      await service.handleMessage('111', '@Z anotame', 'group-1');
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Test User'));
    });

    it('informa si ya está anotado (ConflictException)', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.register.mockRejectedValue(new AlreadyRegisteredException());

      await service.handleMessage('111', '@Z anotame', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('ya estás anotado'));
    });

    it('un declined en espera usa "anótame" y es promovido si hay cupo', async () => {
      // El remitente ya tiene un registro, pero declinó y volvió a la espera.
      // "anótame" debe reintentar (retryFromWaitingList), no decir "ya estás anotado".
      mockPrisma.game.findFirst.mockResolvedValue(
        makeActiveGame([{ user: { id: 'user-1' }, isWaitingList: true, confirmationDeclined: true, position: 1 }]),
      );
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: true, game: makeActiveGame() });
      mockGames.findOne.mockResolvedValue(makeActiveGame([{ user: { id: 'user-1' }, isWaitingList: false, position: 5 }]));

      await service.handleMessage('111', '@Z anotame', 'group-1');

      expect(mockGames.retryFromWaitingList).toHaveBeenCalledWith('game-1', 'user-1');
      expect(mockWp.sendToGroup).not.toHaveBeenCalledWith(expect.stringContaining('ya estás anotado'));
    });

    it('un registro activo normal sí responde "ya estás anotado"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(
        makeActiveGame([{ user: { id: 'user-1' }, isWaitingList: false, confirmationDeclined: false, position: 3 }]),
      );
      mockUsers.findByPhone.mockResolvedValue(makeUser());

      await service.handleMessage('111', '@Z anotame', 'group-1');

      expect(mockGames.retryFromWaitingList).not.toHaveBeenCalled();
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('ya estás anotado'));
    });

    it('funciona también con el sinónimo "voy"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.register.mockResolvedValue({ position: 2, isWaitingList: false });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z voy', 'group-1');
      expect(mockGames.register).toHaveBeenCalled();
    });
  });

  // ─── salirme ───────────────────────────────────────────────────────────────

  describe('comando salirme', () => {
    it('informa que no hay lista si no hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);

      await service.handleMessage('111', '@Z salirme', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay'));
    });

    it('informa que el número no está registrado si no hay usuario', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(null);

      await service.handleMessage('111', '@Z salirme', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No encontré'));
    });

    it('saca al usuario y envía confirmación', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z salirme', 'group-1');
      // El mensaje y la auto-promoción los maneja removeRegistration (en orden).
      // El handler delega sin pasar { silent } y sin enviar un duplicado.
      expect(mockGames.removeRegistration).toHaveBeenCalledWith(
        'game-1', 'user-1', 'user-1', Role.member,
      );
      expect(mockWp.sendToGroup).not.toHaveBeenCalled();
    });

    it('funciona también con el sinónimo "sacame"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z sacame', 'group-1');
      expect(mockGames.removeRegistration).toHaveBeenCalled();
    });

    it.each([
      ['@Z salir'],
      ['@Z borrame'],
      ['@Z borrarme'],
      ['@Z retirame'],
      ['@Z retirarme'],
      ['@Z no puedo'],
    ])('alias "%s" también desanota', async (cmd) => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', cmd, 'group-1');
      expect(mockGames.removeRegistration).toHaveBeenCalled();
    });

    it('delega en removeRegistration sin enviar un mensaje propio', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(
        makeActiveGame([
          { user: { id: 'user-1' }, isGuest: false },
          { isGuest: true, registeredById: 'user-1', guestName: 'Pepito' },
        ]),
      );
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});

      await service.handleMessage('111', '@Z salir', 'group-1');
      expect(mockGames.removeRegistration).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', Role.member);
      // El sufijo de invitados y el mensaje los emite removeRegistration.
      expect(mockWp.sendToGroup).not.toHaveBeenCalled();
    });
  });

  // ─── cuenta inactiva en otros comandos ────────────────────────────────────

  describe('validación de cuenta activa centralizada', () => {
    it('rechaza @Z invitar si la cuenta está inactiva', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ status: 'inactive' }));

      await service.handleMessage('111', '@Z invitar Carlos', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('inactiva'));
      expect(mockGames.registerGuest).not.toHaveBeenCalled();
    });

    it('rechaza @Z anotar @persona si la cuenta está suspendida', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ status: 'banned' }));

      await service.handleMessage('111', '@Z anotar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('suspendida'));
      expect(mockGames.register).not.toHaveBeenCalled();
    });

    it('rechaza @Z confirmar si la cuenta está inactiva', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ status: 'inactive' }));

      await service.handleMessage('111', '@Z confirmar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('inactiva'));
      expect(mockGames.confirmRegistration).not.toHaveBeenCalled();
    });
  });

  // ─── invitar (requiere estar anotado) ──────────────────────────────────────

  describe('comando invitar', () => {
    it('rechaza si el usuario no está anotado en la lista', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());

      await service.handleMessage('111', '@Z invitar Carlos', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('debes estar anotado'));
      expect(mockGames.registerGuest).not.toHaveBeenCalled();
    });

    it('permite invitar si el usuario está anotado', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar Carlos', 'group-1');
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Carlos', 'user-1', { silent: true });
    });

    it.each([
      ['@Z invita Carlos'],
      ['@Z trae Carlos'],
      ['@Z traer Carlos'],
    ])('alias "%s" también activa CMD_INVITE', async (cmd) => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', cmd, 'group-1');
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Carlos', 'user-1', { silent: true });
    });

    it('registra por proxy al miembro @mencionado en vez de como invitado', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Lu', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar @Lu Zetas', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', { silent: true });
      expect(mockGames.registerGuest).not.toHaveBeenCalled();
    });

    it('informa si el @mencionado no está registrado en el sistema', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        return Promise.resolve(null);
      });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar @Desconocido', 'group-1', ['999@s.whatsapp.net']);
      expect(mockGames.registerGuest).not.toHaveBeenCalled();
      expect(mockGames.register).not.toHaveBeenCalled();
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('no está registrado'));
    });

    it('registra por proxy al miembro y como invitado al nombre en texto plano en el mismo comando', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Lu', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 3 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar @Lu Zetas, Pedro', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Pedro', 'user-1', { silent: true });
    });
  });

  // ─── anotar (register other) ──────────────────────────────────────────────

  describe('comando anotar — unified with anótame', () => {
    it('registers sender when only self is mentioned (no other person)', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotar @111', 'group-1', ['111@s.whatsapp.net']);
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('se anotó'),
      );
    });

    it('registers sender and mentioned person together', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Other User', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', { silent: true });
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Test User'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Other User'));
    });

    it('only registers mentioned person if sender already registered', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Other User', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z anótame @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.register).toHaveBeenCalledTimes(1);
      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', { silent: true });
    });

    it('reports sender success even if mentioned person is not in system', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        return Promise.resolve(null);
      });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame @999', 'group-1', ['999@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('se anotó'),
      );
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('no está registrado'),
      );
    });

    it('reports sender success even if mentioned person already registered', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Other User', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register
        .mockResolvedValueOnce({ isWaitingList: false, position: 1 })
        .mockRejectedValueOnce(new AlreadyRegisteredException('Other User'));
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('se anotó'),
      );
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('ya está anotado'),
      );
    });

    it('explica claramente cuando se alcanza el límite de personas a anotar', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser());
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Other User', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.register
        .mockResolvedValueOnce({ isWaitingList: false, position: 1 })
        .mockRejectedValueOnce(new ProxyLimitExceededException(1));
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(
        expect.stringContaining('máximo de personas que puedes anotar'),
      );
    });
  });

  // ─── promover ─────────────────────────────────────────────────────────────

  describe('comando promover', () => {
    it('informa que no hay lista si no hay juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay'));
    });

    it('informa que el número no está registrado si no hay usuario', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(null);

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No encontré'));
    });

    it('rechaza si el miembro no está en la lista principal', async () => {
      const game = makeActiveGame([
        { user: { id: 'other-1', name: 'Otro', phone: '222' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('lista principal'));
      expect(mockGames.promoteNext).not.toHaveBeenCalled();
    });

    it('permite a un admin promover sin estar en la lista', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      const updated = makeActiveGame();
      mockGames.promoteNext.mockResolvedValue({ updated, promotedName: 'Juan' });

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockGames.promoteNext).toHaveBeenCalled();
    });

    it('permite a un miembro en la lista principal promover', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      const updated = makeActiveGame();
      mockGames.promoteNext.mockResolvedValue({ updated, promotedName: 'Juan' });

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockGames.promoteNext).toHaveBeenCalledWith('game-1', 'user-1');
    });

    it('promueve al primer jugador de espera y envía confirmación', async () => {
      const game = makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      const updated = makeActiveGame();
      mockGames.promoteNext.mockResolvedValue({ updated, promotedName: 'Juan' });

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockGames.promoteNext).toHaveBeenCalledWith('game-1', 'user-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Juan'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('promovido'));
    });

    it('informa si la lista principal está llena', async () => {
      const { GameFullException } = require('../games/exceptions');
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      mockGames.promoteNext.mockRejectedValue(new GameFullException());

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('llena'));
    });

    it('informa si no hay nadie en lista de espera', async () => {
      const { NoOneInWaitListException } = require('../games/exceptions');
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      mockGames.promoteNext.mockRejectedValue(new NoOneInWaitListException());

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('No hay nadie'));
    });

    it('funciona también con el sinónimo "jalar"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      const updated = makeActiveGame();
      mockGames.promoteNext.mockResolvedValue({ updated, promotedName: 'Ana' });

      await service.handleMessage('111', '@Z jalar', 'group-1');
      expect(mockGames.promoteNext).toHaveBeenCalled();
    });
  });

  // ─── sacar (admin remove) ──────────────────────────────────────────────────

  describe('comando sacar', () => {
    it('rechaza si no es admin', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.member }));

      await service.handleMessage('111', '@Z sacar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Solo los administradores'));
    });

    it('pide mención si no hay nadie mencionado', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));

      await service.handleMessage('111', '@Z sacar', 'group-1', []);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('mencionar'));
    });

    it('admin saca exitosamente a un usuario', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.removeRegistration.mockResolvedValue(undefined);
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z sacar @222', 'group-1', ['222@s.whatsapp.net']);
      // El mensaje "fue sacado" (y el sufijo de invitados) los emite
      // removeRegistration, awaited antes de la auto-promoción para mantener el
      // orden del chat. El handler delega sin pasar { silent } ni duplicar.
      expect(mockGames.removeRegistration).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', Role.admin);
      expect(mockWp.sendToGroup).not.toHaveBeenCalled();
    });

    it('informa si el target no está en la lista', async () => {
      const { NotRegisteredException } = require('../games/exceptions');
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.removeRegistration.mockRejectedValue(new NotRegisteredException());

      await service.handleMessage('111', '@Z sacar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('no está anotado'));
    });

    it('informa si el target no está registrado en el sistema', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        return Promise.resolve(null);
      });

      await service.handleMessage('111', '@Z sacar @333', 'group-1', ['333@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('no está registrado'));
    });
  });

  // ─── confirmar ────────────────────────────────────────────────────────────

  describe('comando confirmar', () => {
    it('confirma exitosamente', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: true, confirmedGuests: [] });

      await service.handleMessage('111', '@Z confirmar', 'group-1');
      expect(mockGames.confirmRegistration).toHaveBeenCalledWith('game-1', 'user-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('confirmó su asistencia'));
    });

    it('confirma invitados del usuario', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: false, confirmedGuests: ['Topota'] });

      await service.handleMessage('111', '@Z confirmar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('asistencia de Topota'));
    });

    it('confirma ambos (propio y invitados)', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: true, confirmedGuests: ['Topota', 'Jeffer'] });

      await service.handleMessage('111', '@Z confirmar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('su asistencia y la de Topota, Jeffer'));
    });

    it('informa si no hay confirmación pendiente', async () => {
      const { NoPendingConfirmationException } = require('../games/exceptions');
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.confirmRegistration.mockRejectedValue(new NoPendingConfirmationException());

      await service.handleMessage('111', '@Z confirmar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('confirmación pendiente'));
    });

    it.each([
      ['@Z confirmo'],
      ['@Z confirma'],
      ['@Z listo'],
      ['@Z acepto'],
    ])('alias "%s" también confirma', async (cmd) => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: true, confirmedGuests: [] });

      await service.handleMessage('111', cmd, 'group-1');
      expect(mockGames.confirmRegistration).toHaveBeenCalled();
    });

    it('admin confirma por otro mencionándolo (pasa actorId del admin)', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: true, confirmedGuests: [] });

      await service.handleMessage('111', '@Z confirmar @222', 'group-1', ['222@s.whatsapp.net']);

      expect(mockGames.confirmRegistration).toHaveBeenCalledWith('game-1', 'user-2', 'user-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('confirmó la asistencia de Juan'));
    });

    it('rechaza confirmar por otro si no es admin', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.member }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });

      await service.handleMessage('111', '@Z confirmar @222', 'group-1', ['222@s.whatsapp.net']);

      expect(mockGames.confirmRegistration).not.toHaveBeenCalled();
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Solo los administradores'));
    });

    it('informa si no hay confirmación pendiente del mencionado', async () => {
      const { NoPendingConfirmationException } = require('../games/exceptions');
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.confirmRegistration.mockRejectedValue(new NoPendingConfirmationException());

      await service.handleMessage('111', '@Z confirmar @222', 'group-1', ['222@s.whatsapp.net']);

      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('no tiene ninguna confirmación pendiente'));
    });
  });

  // ─── invitar múltiples (opción B) ─────────────────────────────────────────

  describe('invitar múltiples invitados separados por coma', () => {
    function makeGameWithSender() {
      return makeActiveGame([
        { user: { id: 'user-1', name: 'Test User', phone: '111' }, isWaitingList: false },
      ]);
    }

    it('registra dos invitados externos en un solo comando', async () => {
      const game = makeGameWithSender();
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar Carlos, María', 'group-1');

      expect(mockGames.registerGuest).toHaveBeenCalledTimes(2);
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Carlos', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'María', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Carlos'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('María'));
    });

    it('informa individualmente si uno de los invitados falla', async () => {
      const game = makeGameWithSender();
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest
        .mockResolvedValueOnce({ isWaitingList: false, position: 2 })
        .mockRejectedValueOnce(new Error('fallo'));
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar Carlos, Pedro', 'group-1');

      expect(mockGames.registerGuest).toHaveBeenCalledTimes(2);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Carlos'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Pedro'));
    });

    it('un solo nombre sin coma sigue funcionando', async () => {
      const game = makeGameWithSender();
      mockPrisma.game.findFirst.mockResolvedValue(game);
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(game);

      await service.handleMessage('111', '@Z invitar Juan Pérez', 'group-1');

      expect(mockGames.registerGuest).toHaveBeenCalledTimes(1);
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Juan Pérez', 'user-1', { silent: true });
    });
  });

  // ─── anotame + invitados inline (opción C) ────────────────────────────────

  describe('anotame con invitados externos inline', () => {
    it('@Z anotame + Carlos, María registra al emisor y a ambos invitados', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame + Carlos, María', 'group-1');

      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledTimes(2);
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Carlos', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'María', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Test User'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Carlos'));
    });

    it('@Z anotame invitar Carlos, María funciona igual que con +', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame invitar Carlos, María', 'group-1');

      expect(mockGames.register).toHaveBeenCalledWith('game-1', 'user-1', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledTimes(2);
    });

    it('si el emisor ya estaba anotado, igual puede traer invitados', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(
        makeActiveGame([{ user: { id: 'user-1' }, isWaitingList: false, confirmationDeclined: false }]),
      );
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 3 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame + Pepito', 'group-1');

      expect(mockGames.register).not.toHaveBeenCalled();
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Pepito', 'user-1', { silent: true });
    });

    it('nombres con tilde se preservan en el registro del invitado', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.registerGuest.mockResolvedValue({ isWaitingList: false, position: 2 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame + José, Ángela', 'group-1');

      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'José', 'user-1', { silent: true });
      expect(mockGames.registerGuest).toHaveBeenCalledWith('game-1', 'Ángela', 'user-1', { silent: true });
    });
  });

  // ─── tildes / normalización ───────────────────────────────────────────────

  describe('normalización de tildes', () => {
    it('@Z anótame (con tilde) activa el comando de registro', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.register.mockResolvedValue({ position: 1, isWaitingList: false });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anótame', 'group-1');
      expect(mockGames.register).toHaveBeenCalled();
    });

    it('@Z sácame (con tilde) activa el comando de salirse', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});

      await service.handleMessage('111', '@Z sácame', 'group-1');
      expect(mockGames.removeRegistration).toHaveBeenCalled();
    });
  });

  // ─── ayuda ─────────────────────────────────────────────────────────────────

  describe('comando ayuda', () => {
    it('muestra el texto de ayuda con todos los comandos principales', async () => {
      await service.handleMessage('111', '@Z ayuda', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Comandos del Bot Zetas'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('anótame'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('sacar'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('confirmar'));
    });

    it('menciona la sintaxis de invitados inline', async () => {
      await service.handleMessage('111', '@Z ayuda', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('+ Nombre'));
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('invitar'));
    });

    it('indica que existe el comando alias', async () => {
      await service.handleMessage('111', '@Z ayuda', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('alias'));
    });

    it('no requiere juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      await service.handleMessage('111', '@Z help', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Comandos'));
    });
  });

  // ─── alias ────────────────────────────────────────────────────────────────

  describe('comando alias', () => {
    it('muestra todos los alias disponibles incluyendo los nuevos', async () => {
      await service.handleMessage('111', '@Z alias', 'group-1');
      const msg = mockWp.sendToGroup.mock.calls[0][0] as string;
      expect(msg).toContain('Alias del Bot Zetas');
      // Registro
      expect(msg).toContain('anotarme');
      expect(msg).toContain('meterme');
      expect(msg).toContain('inscribirme');
      // Salir (el texto muestra formas con tilde para legibilidad)
      expect(msg).toContain('bórrame');
      expect(msg).toContain('borrarme');
      expect(msg).toContain('retírame');
      expect(msg).toContain('no puedo');
      // Invitados
      expect(msg).toContain('invita');
      expect(msg).toContain('trae');
      // Listas / finanzas
      expect(msg).toContain('cómo vamos');
      expect(msg).toContain('caja');
      expect(msg).toContain('lucas');
      expect(msg).toContain('multas');
      // Medio de pago
      expect(msg).toContain('llave');
      expect(msg).toContain('nequi');
      // Ejemplo inline
      expect(msg).toContain('+ Carlos');
    });

    it('también funciona con "variantes" y "sinónimos" (con tilde)', async () => {
      await service.handleMessage('111', '@Z variantes', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Alias del Bot Zetas'));
    });

    it('no requiere juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      await service.handleMessage('111', '@Z alternativas', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Alias del Bot'));
    });
  });

  // ─── comando llave / pagos ────────────────────────────────────────────────

  describe('comando llave', () => {
    it('devuelve la llave Bre-B', async () => {
      await service.handleMessage('111', '@Z llave', 'group-1');
      const msg: string = mockWp.sendToGroup.mock.calls[0][0];
      expect(msg).toContain('Medio de pago');
      expect(msg).toContain('Bre-B');
      expect(msg).toContain('@MLR608');
    });

    it('también funciona con "pagos" y "nequi"', async () => {
      await service.handleMessage('111', '@Z pagos', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Bre-B'));

      mockWp.sendToGroup.mockClear();
      await service.handleMessage('111', '@Z nequi', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Bre-B'));
    });

    it('no requiere juego activo', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(null);
      await service.handleMessage('111', '@Z transferencia', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Bre-B'));
    });
  });

  // ─── comando desconocido ──────────────────────────────────────────────────

  describe('comando desconocido', () => {
    it('responde que el comando no es reconocido', async () => {
      await service.handleMessage('111', '@Z xyzzy', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Comando no reconocido'));
    });

    it('no responde si el mensaje no menciona al bot', async () => {
      await service.handleMessage('111', 'hola a todos', 'group-1');
      expect(mockWp.sendToGroup).not.toHaveBeenCalled();
    });
  });

  // ─── non-admin multi-mention limit ────────────────────────────────────────

  describe('límite de menciones para no-admins', () => {
    it('solo anota a la primera persona mencionada para un no-admin', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.member }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        if (phone === '333') return Promise.resolve({ id: 'user-3', name: 'Pedro', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame @222 @333', 'group-1', ['222@s.whatsapp.net', '333@s.whatsapp.net']);

      expect(mockGames.register).toHaveBeenCalledTimes(2);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('mención fue ignorada'));
    });

    it('un admin puede anotar a múltiples personas', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.admin }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        if (phone === '333') return Promise.resolve({ id: 'user-3', name: 'Pedro', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame @222 @333', 'group-1', ['222@s.whatsapp.net', '333@s.whatsapp.net']);

      expect(mockGames.register).toHaveBeenCalledTimes(3);
      expect(mockWp.sendToGroup).not.toHaveBeenCalledWith(expect.stringContaining('ignoradas'));
    });

    it('un ayudante puede anotar a múltiples personas (sin límite de proxy)', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.ayudante }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        if (phone === '333') return Promise.resolve({ id: 'user-3', name: 'Pedro', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.retryFromWaitingList.mockResolvedValue({ promoted: false, game: null });
      mockGames.register.mockResolvedValue({ isWaitingList: false, position: 1 });
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z anotame @222 @333', 'group-1', ['222@s.whatsapp.net', '333@s.whatsapp.net']);

      expect(mockGames.register).toHaveBeenCalledTimes(3);
      expect(mockWp.sendToGroup).not.toHaveBeenCalledWith(expect.stringContaining('ignoradas'));
    });
  });

  // ─── permisos ayudante ─────────────────────────────────────────────────────

  describe('permisos del rol ayudante', () => {
    it('ayudante puede terminar un partido', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.ayudante }));
      mockGames.complete.mockResolvedValue({ game: {}, report: '✅ Reporte final' });

      await service.handleMessage('111', '@Z terminar', 'group-1');
      expect(mockGames.complete).toHaveBeenCalledWith('game-1', 'user-1', { silent: true });
      expect(mockWp.sendToGroup).toHaveBeenCalledWith('✅ Reporte final');
    });

    it('ayudante puede sacar a otro jugador', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.ayudante }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.removeRegistration.mockResolvedValue(undefined);

      await service.handleMessage('111', '@Z sacar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.removeRegistration).toHaveBeenCalledWith('game-1', 'user-2', 'user-1', Role.ayudante);
      expect(mockWp.sendToGroup).not.toHaveBeenCalled();
    });

    it('ayudante puede confirmar asistencia por otro', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockImplementation((phone: string) => {
        if (phone === '111') return Promise.resolve(makeUser({ role: Role.ayudante }));
        if (phone === '222') return Promise.resolve({ id: 'user-2', name: 'Juan', role: Role.member, status: 'active' });
        return Promise.resolve(null);
      });
      mockGames.confirmRegistration.mockResolvedValue({ game: makeActiveGame(), confirmedOwn: false, confirmedGuests: [] });

      await service.handleMessage('111', '@Z confirmar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockGames.confirmRegistration).toHaveBeenCalledWith('game-1', 'user-2', 'user-1');
    });

    it('member sigue sin poder terminar el partido', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.member }));

      await service.handleMessage('111', '@Z terminar', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('administradores'));
      expect(mockGames.complete).not.toHaveBeenCalled();
    });

    it('member sigue sin poder sacar a otro jugador', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.member }));

      await service.handleMessage('111', '@Z sacar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Solo los administradores'));
      expect(mockGames.removeRegistration).not.toHaveBeenCalled();
    });

    it('member sigue sin poder confirmar por otro', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.member }));

      await service.handleMessage('111', '@Z confirmar @222', 'group-1', ['222@s.whatsapp.net']);
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Solo los administradores'));
      expect(mockGames.confirmRegistration).not.toHaveBeenCalled();
    });
  });
});
