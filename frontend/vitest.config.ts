import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()] as never,
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
        statements: 31,
        branches: 29,
        functions: 26,
        lines: 33,
      },
    },
  },
});
