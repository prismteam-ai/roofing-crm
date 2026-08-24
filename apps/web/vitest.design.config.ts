import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for web unit and mocked design tests (jsdom, no Amplify).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/design/**/*.{test,spec}.{ts,tsx}", "src/**/*.test.ts"],
    setupFiles: ["./test/setup-jsdom-polyfills.ts"],
    css: false,
  },
});
