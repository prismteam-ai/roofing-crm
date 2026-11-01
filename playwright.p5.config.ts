import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "p5-intent-ledger.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/p5-ledger",
  use: {
    baseURL: "http://127.0.0.1:4178",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        "/home/al/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "node_modules/.bin/vite --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
