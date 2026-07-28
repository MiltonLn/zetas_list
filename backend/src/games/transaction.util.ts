import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GameNotFoundException } from './exceptions';

export type Tx = Prisma.TransactionClient;

export interface LockedRegistrationGame {
  id: string;
  status: string;
  maxMainSpots: number;
  mainListHasBeenFull: boolean;
  guestCutoffTime: string;
  maxProxyRegistrations: number;
  gameDate: Date;
}

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
      const games = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM games WHERE id = ${gameId} FOR UPDATE
      `;
      if (!Array.isArray(games) || games.length === 0) {
        throw new GameNotFoundException();
      }
      return fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Locks and fetches the game fields required by registration decisions in the
 * same serializable transaction.
 */
export function withGameLockAndFetch<T>(
  prisma: PrismaService,
  gameId: string,
  fn: (tx: Tx, game: LockedRegistrationGame) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const games = await tx.$queryRaw<LockedRegistrationGame[]>`
        SELECT id, status, "maxMainSpots", "mainListHasBeenFull",
               "guestCutoffTime", "maxProxyRegistrations", "gameDate"
        FROM games
        WHERE id = ${gameId}
        FOR UPDATE
      `;
      const game = games[0];
      if (!game) throw new GameNotFoundException();
      return fn(tx, game);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
