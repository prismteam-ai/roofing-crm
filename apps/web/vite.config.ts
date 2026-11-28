import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5318,
    proxy: {
      "/trpc": "http://localhost:4318",
      "/agent": "http://localhost:4318",
      "/health": "http://localhost:4318",
    },
  },
  test: { name: "web", environment: "jsdom", setupFiles: ["./test/setup.ts"] },
});
