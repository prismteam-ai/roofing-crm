import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Local lane, kept out of the hosted run (its tests are *.local.ts, which the hosted config does not match):
 * the built app (run `pnpm --dir apps/crm build` first) served by vite preview on 127.0.0.1, with config.json,
 * the data API, the leads API, the agent API and the basemap answered by page routes (layout.local.ts). Dummy
 * values only; nothing leaves the machine. CRM_LOCAL_PORT picks the port (default 47961).
 *   pnpm --dir apps/crm exec playwright test -c e2e/local/playwright.local.config.ts
 */
const port = Number(process.env.CRM_LOCAL_PORT ?? 47961);
export default defineConfig({
  testDir: ".",
  testMatch: "*.local.ts",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: resolve(import.meta.dirname, "../.."),
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
