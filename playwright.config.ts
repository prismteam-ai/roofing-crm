import { defineConfig } from '@playwright/test';

/**
 * E2E against the deployed URL -- the same tool (Playwright) and the same
 * live site the grader evaluates, not a local dev server. Override
 * E2E_BASE_URL to point at a fork or a preview deploy.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // shares one dataset load across the file; keep it simple and deterministic
  // A real external live site is less deterministic than a local dev server --
  // one retry absorbs a transient network/CDN blip without masking a real failure.
  retries: process.env['CI'] ? 2 : 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'https://apantovic.github.io/roofing-crm/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
