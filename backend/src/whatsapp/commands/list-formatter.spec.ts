import { ActiveGame, formatListForWhatsapp } from './list-formatter';

function gameWith(
  registrations: Array<Record<string, unknown>>,
): ActiveGame {
  return {
    id: 'game-1',
    title: 'Vóley viernes',
    maxMainSpots: 3,
    registrations,
  } as unknown as ActiveGame;
}

describe('formatListForWhatsapp', () => {
  it('formatea miembros, invitados, espera, pendientes y enlace', () => {
    const message = formatListForWhatsapp(
      gameWith([
        {
          id: 'member',
          isWaitingList: false,
          isGuest: false,
          pendingConfirmation: true,
          user: { name: 'Ana', alias: 'Anita' },
        },
        {
          id: 'guest',
          isWaitingList: false,
          isGuest: true,
          guestName: 'Carlos',
          pendingConfirmation: false,
          registeredBy: { name: 'Beatriz', alias: null },
        },
        {
          id: 'waiter',
          isWaitingList: true,
          isGuest: false,
          pendingConfirmation: false,
          user: { name: 'Diego', alias: null },
        },
      ]),
    );

    expect(message).toContain('1. Anita ⏳');
    expect(message).toContain('Carlos 👤 _(inv. de Beatriz)_');
    expect(message).toContain('*Lista de Espera (1):*');
    expect(message).toContain('1. Diego');
    expect(message).toContain('/game/game-1');
  });

  it('indica cuando no hay anotados', () => {
    expect(formatListForWhatsapp(gameWith([]))).toContain('_Sin anotados aún_');
  });
});
