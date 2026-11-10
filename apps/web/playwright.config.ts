import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8787);

/** Runs the built API (fixture dataset, offline agent) serving the built web bundle. Build first: pnpm build. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: {
    command: `node ../api/dist/server.js`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      AGENT_MODE: 'offline',
      PIPELINE_MCP_URL: '',
      OPENAI_API_KEY: '',
      LEADS_DB_PATH: `test-results/leads-e2e-${process.pid}.sqlite`,
      TRACE_DIR: 'test-results/traces',
      WEB_DIST: 'dist',
      LOG_LEVEL: 'warn',
    },
  },
});
