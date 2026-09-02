import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173" },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npx --yes serve apps/web/public -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
