import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/trpc': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/build.json': 'http://localhost:8080',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
});
