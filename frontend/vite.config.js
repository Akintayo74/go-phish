import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite + Vitest config. The dev server proxies /api to the backend so the
// admin console and CAT site can call the API without CORS setup in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: false,
  },
});
