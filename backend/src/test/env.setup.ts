/**
 * Runs before any module is imported (jest `setupFiles`).
 *
 * `src/config/env.ts` validates the environment at import time and throws on
 * missing values, so the unit suite needs deterministic placeholders here.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://zetas:test@localhost:5432/zetas_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-not-used-for-real-tokens';
process.env.APP_URL ??= 'http://localhost:5173';
