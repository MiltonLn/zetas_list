import { HttpException } from '@nestjs/common';

/**
 * Returns true for "expected" business errors: domain exceptions that map to a
 * 4xx response (e.g. already registered, list full, proxy limit reached).
 *
 * These are normal outcomes driven by user input, not system failures, so they
 * should NOT be logged at error level (it pollutes error dashboards/Sentry).
 * Unexpected errors (5xx, plain Error, etc.) return false and must be logged at
 * error level with the full stack.
 */
export function isExpectedBusinessError(e: unknown): boolean {
  return e instanceof HttpException && e.getStatus() < 500;
}
