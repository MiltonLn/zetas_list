/**
 * Sentry instrumentation — must be imported BEFORE any other module in main.ts.
 * See: https://docs.sentry.io/platforms/javascript/guides/nestjs/
 *
 * Importing the env module here also makes environment validation the very
 * first thing that runs, so a misconfigured deploy fails at boot.
 */
import * as Sentry from '@sentry/nestjs';
import { env, isProduction } from './config/env';

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  enabled: !!env.SENTRY_DSN,

  // Captura el 10 % de las transacciones en producción para performance.
  // En desarrollo, 100 % para facilitar depuración local.
  tracesSampleRate: isProduction ? 0.1 : 1.0,
});
