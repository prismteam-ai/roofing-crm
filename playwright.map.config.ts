import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "p3-map.spec.ts",
  workers: 1,
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1440, height: 1100 },
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
});
