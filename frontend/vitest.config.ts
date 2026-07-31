import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/api-types.gen.ts',
        'src/main.tsx',
        'src/test/**',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        statements: 42,
        branches: 39,
        functions: 33,
        lines: 44,
        'src/hooks/**': {
          statements: 64,
          branches: 57,
          functions: 47,
          lines: 64,
        },
        'src/hooks/useGameStream.ts': {
          statements: 87,
          branches: 61,
          functions: 97,
          lines: 95,
        },
        'src/hooks/useOrdersQuery.ts': {
          statements: 72,
          branches: 82,
          functions: 68,
          lines: 72,
        },
        'src/contexts/AuthContext.tsx': {
          statements: 81,
          branches: 64,
          functions: 64,
          lines: 84,
        },
        'src/pages/GameDetailPage.tsx': {
          statements: 51,
          branches: 53,
          functions: 42,
          lines: 52,
        },
      },
    },
  },
});
