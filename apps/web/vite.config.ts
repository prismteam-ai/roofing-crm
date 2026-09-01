import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<owner>.github.io/roofing-crm/, so assets need that prefix.
// Override with BASE_PATH=/ for a user/organisation Pages site at the domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/roofing-crm/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
  // DuckDB-WASM ships workers as separate bundles; keep them unmangled.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
});
