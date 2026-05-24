import * as Sentry from '@sentry/nestjs';

// nodeProfilingIntegration uses native C++ bindings that can crash silently
// on Alpine Linux. Only load it when Sentry is actually enabled.
const integrations: Sentry.Integration[] = [];
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nodeProfilingIntegration } = require('@sentry/profiling-node') as {
      nodeProfilingIntegration: () => Sentry.Integration;
    };
    integrations.push(nodeProfilingIntegration());
  } catch {
    // profiling-node not available on this platform — continue without it
  }
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 1.0,
  enabled: !!process.env.SENTRY_DSN,
});
