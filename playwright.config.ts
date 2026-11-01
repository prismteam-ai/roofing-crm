import { publicCaptureEnvironment } from "./packages/test-support/src/public-capture-env";
import { defineConfig } from "@playwright/test";
import path from "node:path";
const dataMode = process.env.PRISM_TEST_MODE ?? "synthetic";
if (!["real", "synthetic"].includes(dataMode))
  throw new Error(
    "Public browser capture requires explicit real-public or synthetic mode; protected review uses the separate authenticated hosted evidence workflow",
  );
const publicCaptureEnv = publicCaptureEnvironment(
  process.env,
  dataMode as "real" | "synthetic",
);
const integration =
  dataMode === "real" ||
  process.env.PRISM_BROWSER_ORACLE_MODE === "integration";
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
        : {}),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: [
    ...(integration
      ? [
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
            env: publicCaptureEnv,
            url: "http://127.0.0.1:4173",
            reuseExistingServer: true,
            timeout: 60000,
          },
        ]
      : [
          {
            command: "pnpm test:oracle-fixture",
            env: { ...publicCaptureEnv, PRISM_DATA_MODE: "synthetic" },
            url: "http://127.0.0.1:4310/api/health",
            reuseExistingServer: false,
            timeout: 60000,
          },
        ]),
    {
      command: "pnpm api",
      env: publicCaptureEnv,
      url: "http://127.0.0.1:4311/api/health",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "pnpm dev",
      env: publicCaptureEnv,
      url: "http://127.0.0.1:4174",
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
