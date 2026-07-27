import { stdTimeFunctions } from 'pino';
import type { Params } from 'nestjs-pino';
import { getLogContext } from './log-context';
import { env, isProduction } from '../../config/env';

/**
 * Builds the nestjs-pino configuration.
 *
 * - Level is driven by LOG_LEVEL (defaults: debug in dev, info in prod).
 * - Production emits structured JSON with ISO timestamps (queryable in any log
 *   store); development pretty-prints single-line, colorized output.
 * - A `mixin` attaches the active correlation context (reqId/source/gameId) to
 *   every line so a single flow can be followed end-to-end.
 * - Per-request HTTP auto-logging is disabled to keep the signal-to-noise ratio
 *   high; we log meaningful domain events explicitly instead.
 */
export function buildLoggerConfig(): Params {
  const isProd = isProduction;
  const level = env.LOG_LEVEL || (isProd ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,
      timestamp: stdTimeFunctions.isoTime,
      autoLogging: false,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
        ],
        remove: true,
      },
      mixin() {
        const ctx = getLogContext();
        if (!ctx) return {};
        const out: Record<string, string> = { reqId: ctx.reqId };
        if (ctx.source) out.source = ctx.source;
        if (ctx.gameId) out.gameId = ctx.gameId;
        if (ctx.phone) out.phone = ctx.phone;
        return out;
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
    },
  };
}
