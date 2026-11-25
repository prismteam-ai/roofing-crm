import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // MapLibre is about 1 MB on its own; keep it in a separate, long-cached chunk.
    chunkSizeWarningLimit: 1100,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
