import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Local development: the API (tRPC, /agent) on 4318 behind the same origin.
const API = process.env.CRM_API_PROXY ?? "http://localhost:4318";
const PROXY = { "/trpc": API, "/agent": API, "/health": API };

export default defineConfig({
  plugins: [react()],
  server: { port: 5318, proxy: PROXY },
  preview: { port: 5318, proxy: PROXY },
  test: { name: "web", environment: "jsdom", setupFiles: ["./test/setup.ts"] },
});
