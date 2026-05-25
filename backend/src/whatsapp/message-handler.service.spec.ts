import { Test, TestingModule } from '@nestjs/testing';
import { MessageHandlerService } from './message-handler.service';
import { WHATSAPP_PROVIDER } from './whatsapp.interface';
import { GamesService } from '../games/games.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

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
const mockUsers = { findByPhone: jest.fn() };
const mockPrisma = { game: { findFirst: jest.fn() } };

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
  // Tests the regex patterns in isolation (they are module-level constants)
  // We import the patterns indirectly by testing handleMessage behavior

  const CMD_REGISTER = /^@z\s+(an[oó]tame|m[eé]teme|ap[uú]ntame|juego|voy|entro)\b/i;
  const CMD_UNREGISTER = /^@z\s+(salirme|s[aá]came|qu[ií]tame|no\s+voy|no\s+juego|salgo)\b/i;
  const CMD_LIST = /^@z\s+(lista|cupos|qui[eé]nes?\s+van|cu[aá]ntos)\b/i;
  const CMD_FINISH = /^@z\s+(terminar|cerrar|finalizar|completar)\b/i;

  describe('CMD_REGISTER', () => {
    it.each([
      ['@Z anotame'],
      ['@z anotame'],
      ['@Z anótame'],
      ['@Z meteme'],
      ['@Z méteme'],
      ['@Z apuntame'],
      ['@Z apúntame'],
      ['@Z juego'],
      ['@Z voy'],
      ['@Z entro'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_REGISTER.test(cmd)).toBe(true);
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
      ['@Z sácame'],
      ['@Z quitame'],
      ['@Z quítame'],
      ['@Z no voy'],
      ['@Z no juego'],
      ['@Z salgo'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_UNREGISTER.test(cmd)).toBe(true);
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
      ['@Z quiénes van'],
      ['@Z cuantos'],
      ['@Z cuántos'],
    ])('reconoce "%s"', (cmd) => {
      expect(CMD_LIST.test(cmd)).toBe(true);
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
      mockGames.register.mockRejectedValue(new Error('Ya estás anotado en este partido'));

      await service.handleMessage('111', '@Z anotame', 'group-1');
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
      expect(mockGames.removeRegistration).toHaveBeenCalledWith(
        'game-1', 'user-1', 'user-1', Role.member, { silent: true },
      );
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('Test User'));
    });

    it('funciona también con el sinónimo "sacame"', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser());
      mockGames.removeRegistration.mockResolvedValue({});
      mockGames.findOne.mockResolvedValue(makeActiveGame());

      await service.handleMessage('111', '@Z sacame', 'group-1');
      expect(mockGames.removeRegistration).toHaveBeenCalled();
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
  });

  // ─── anotar (register other) ──────────────────────────────────────────────

  describe('comando anotar (EC7: self-mention)', () => {
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
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      mockGames.promoteNext.mockRejectedValue(new Error('La lista principal ya está llena'));

      await service.handleMessage('111', '@Z promover', 'group-1');
      expect(mockWp.sendToGroup).toHaveBeenCalledWith(expect.stringContaining('llena'));
    });

    it('informa si no hay nadie en lista de espera', async () => {
      mockPrisma.game.findFirst.mockResolvedValue(makeActiveGame());
      mockUsers.findByPhone.mockResolvedValue(makeUser({ role: Role.admin }));
      mockGames.promoteNext.mockRejectedValue(new Error('No hay nadie en la lista de espera'));

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
});
