/**
 * Sentry instrumentation — must be imported BEFORE any other module in main.ts.
 * See: https://docs.sentry.io/platforms/javascript/guides/nestjs/
 */
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN,

  // Captura el 10 % de las transacciones en producción para performance.
  // En desarrollo, 100 % para facilitar depuración local.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
