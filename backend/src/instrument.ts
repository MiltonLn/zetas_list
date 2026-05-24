import * as Sentry from '@sentry/nestjs';

// @sentry/profiling-node uses native glibc bindings that crash silently on
// Alpine Linux (musl libc). Only load it dynamically when Sentry is enabled,
// and wrap in try/catch so a binary incompatibility never kills the process.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations: process.env.SENTRY_DSN
    ? (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { nodeProfilingIntegration } = require('@sentry/profiling-node');
          return [nodeProfilingIntegration()];
        } catch {
          return [];
        }
      })()
    : [],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
});
