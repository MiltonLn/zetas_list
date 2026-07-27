import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;

/**
 * Runs `fn` in a serializable transaction that first takes a row lock on the
 * game.
 *
 * Every list mutation reads the current occupancy and then writes positions
 * based on it, so without the lock two concurrent requests can both see a free
 * spot and both take it. Serializable alone is not enough in practice: the
 * explicit `FOR UPDATE` is what makes concurrent callers queue instead of
 * failing with a serialization error the caller would have to retry.
 */
export function withGameLock<T>(
  prisma: PrismaService,
  gameId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`;
      return fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
