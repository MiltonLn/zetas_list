import { PrismaService } from '../prisma/prisma.service';
import { GameNotFoundException } from './exceptions';
import { withGameLock } from './transaction.util';

describe('withGameLock', () => {
  const tx = {
    $queryRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>): Promise<unknown> =>
        callback(tx),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['un arreglo vacío', []],
    ['undefined', undefined],
  ])('lanza GameNotFoundException cuando el lock devuelve %s', async (_label, rows) => {
    tx.$queryRaw.mockResolvedValue(rows);
    const callback = jest.fn();

    await expect(
      withGameLock(prisma as unknown as PrismaService, 'missing-game', callback),
    ).rejects.toThrow(GameNotFoundException);
    expect(callback).not.toHaveBeenCalled();
  });

  it('ejecuta el callback cuando el lock devuelve una fila', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'game-1' }]);
    const callback = jest.fn().mockResolvedValue('ok');

    await expect(
      withGameLock(prisma as unknown as PrismaService, 'game-1', callback),
    ).resolves.toBe('ok');
    expect(callback).toHaveBeenCalledWith(tx);
  });
});
