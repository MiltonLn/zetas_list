import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Fields attached to every log emitted within a given async flow (an HTTP
 * request or a WhatsApp command). Lets us follow a single action end-to-end
 * across the handler, the service layer and the scheduler.
 */
export interface LogContext {
  /** Short correlation id for the current flow. */
  reqId: string;
  /** Origin of the flow (e.g. "wa" for WhatsApp, "http"). */
  source?: string;
  /** Game involved in the flow, when known. */
  gameId?: string;
  /** Phone of the WhatsApp sender, when applicable. */
  phone?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Generates a short, human-friendly correlation id. */
export function newReqId(): string {
  return randomUUID().slice(0, 8);
}

/** Runs `fn` with the given log context bound to the current async flow. */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Returns the active log context, if any. */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * Merges additional fields into the active log context (no-op when there is no
 * active context). Useful to enrich the flow once more data is known, e.g. the
 * gameId after resolving the active game.
 */
export function setLogContext(patch: Partial<LogContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}
