import { defineConfig } from "@playwright/test";
import path from "node:path";
const dataMode = process.env.PRISM_TEST_MODE ?? "synthetic";
const publicCaptureEnv = {
  PRISM_DATA_MODE: dataMode,
  PRISM_ACCESS_MODE: "local",
  PRISM_SNAPSHOT_DIR: process.env.PRISM_SNAPSHOT_DIR ?? "",
  PRISM_OWNER_DERIVATIVES: "",
  PRISM_OWNER_DERIVATIVES_SHA256: "",
  PRISM_PRIVATE_ENRICHMENT: "",
  PRISM_PRIVATE_ENRICHMENT_SHA256: "",
  PRISM_ENABLE_PROTECTED_VIEW: "0",
};
const evidence = process.env.PRISM_BROWSER_EVIDENCE_DIR ?? "test-results";
export default defineConfig({
  testDir: "tests/browser",
  testIgnore:
    dataMode === "real"
      ? ["**/session-races.spec.ts", "**/p3-map.spec.ts"]
      : ["**/p3-map.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: path.join(evidence, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(evidence, "playwright-results.json") }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : { executablePath: "/usr/bin/google-chrome" }),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: [
    {
      command:
        "pnpm --dir ../oracle-property-intelligence-platform-pipeline-oakland-mi api",
      env: publicCaptureEnv,
      url: "http://127.0.0.1:4310/api/health",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command:
        "pnpm --dir ../oracle-property-intelligence-platform-pipeline-oakland-mi dev",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "pnpm api",
      env: publicCaptureEnv,
      url: "http://127.0.0.1:4311/api/health",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
