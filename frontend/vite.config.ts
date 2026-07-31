import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Avatar images are served by the backend at /uploads (outside /api).
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tanstack/react-query')) return 'react-query';
          if (id.includes('@sentry/')) return 'sentry';
          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)
          ) {
            return 'react';
          }
          if (
            id.includes('/axios/') ||
            id.includes('/@dnd-kit/') ||
            id.includes('/react-easy-crop/') ||
            id.includes('/react-markdown/') ||
            id.includes('/remark-') ||
            id.includes('/rehype-')
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
