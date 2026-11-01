import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "p4-evidence.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: process.env.PRISM_BROWSER_EVIDENCE_DIR
    ? `${process.env.PRISM_BROWSER_EVIDENCE_DIR}/artifacts`
    : "test-results/p4/artifacts",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4189",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
