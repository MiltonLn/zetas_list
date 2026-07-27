import type { Role } from '../types';

/**
 * Frontend mirror of the backend's role model. Keep these lists in sync with
 * `backend/src/common/constants/roles.ts` and the `@Roles()` decorators: the
 * server is the real gate, these only decide what the UI offers.
 */

/** Full access: users, game creation and cancellation, finances, orders. */
export const ADMIN_ONLY: readonly Role[] = ['admin'];

/**
 * Can run a game day — confirmations, registering others, marking
 * attended/paid, promoting, reordering, completing. Mirrors GAME_MANAGERS.
 */
export const GAME_MANAGERS: readonly Role[] = ['admin', 'ayudante'];

export function hasRole(role: Role | undefined, allowed: readonly Role[]): boolean {
  return role !== undefined && allowed.includes(role);
}
