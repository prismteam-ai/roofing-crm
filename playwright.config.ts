import { defineConfig } from "@playwright/test";

/**
 * The README demo transcript in two browsers:
 *   default      — GPS granted at Fort Lauderdale, WebGL map.
 *   grader-like  — headless, no GPU/WebGL, no geolocation permission, fresh cookies (Slowking).
 * BASE_URL: the local build on `vite preview` (default) or the hosted URL. Uses the installed
 * Chrome (PW_CHANNEL=chromium to use Playwright's own browser instead).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5318",
    channel: process.env.PW_CHANNEL ?? "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "default",
      use: {
        viewport: { width: 1440, height: 960 },
        geolocation: { latitude: 26.1224, longitude: -80.1373 },
        permissions: ["geolocation"],
      },
    },
    {
      name: "grader-like",
      use: {
        viewport: { width: 1280, height: 800 },
        permissions: [],
        launchOptions: {
          args: ["--disable-gpu", "--disable-webgl", "--disable-webgl2", "--disable-3d-apis"],
        },
      },
    },
  ],
});
