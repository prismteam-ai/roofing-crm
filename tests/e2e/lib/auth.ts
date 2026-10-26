// Sign in once per Playwright invocation, then reuse the session (playwright.config.ts's `setup`
// project, tests/e2e/auth.setup.ts).
//
// The web app keeps its whole Cognito session in localStorage `crm.session`
// (apps/web/src/auth/session.ts): origin-scoped and independent of the viewport, so one saved
// storageState serves all three viewport projects. A spec that only needs a signed-in page opts
// in with `test.use({ storageState: AUTH_STATE_PATH })` and calls `openSignedIn()`; a spec that
// tests sign-in itself (B-01 AC-1/AC-3, responsive/sign-in.spec.ts) keeps signing in for real.
//
// The state file holds live Cognito tokens: it lives under `playwright/.auth/` (gitignored), is
// never attached to a report, and is never uploaded by CI (only `playwright-report/` is).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/** Repository root: tests/e2e/lib → tests/e2e → tests → root. */
const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

/** The saved signed-in state (or an empty one when CRM_TEST_PASSWORD is unset). */
export const AUTH_STATE_PATH = resolve(repoRoot, "playwright", ".auth", "admin.json");

/** An empty storageState: written when there is no password, so opted-in specs still load. */
export const EMPTY_STORAGE_STATE = { cookies: [], origins: [] } as const;

export const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
export const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).
export const NO_PASSWORD_REASON = "CRM_TEST_PASSWORD not set (Secrets Manager only)";

/**
 * Call at the top of a spec's `beforeEach` (or test) that needs the seeded password. Locally an
 * unset CRM_TEST_PASSWORD skips the test; on CI (`CI` set) it FAILS, so a missing secret can never
 * turn a whole signed-in suite into a green run of skipped tests.
 */
export function requirePassword(): void {
  if (SEEDED_PASSWORD !== undefined) return;
  if (process.env.CI) throw new Error(`${NO_PASSWORD_REASON}; refusing to skip on CI`);
  test.skip(true, NO_PASSWORD_REASON);
}

/** The real sign-in form, waiting until the Map screen proves the session landed. */
export async function signInThroughForm(
  page: Page,
  password: string,
  username: string = SEEDED_USERNAME,
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
}

/**
 * Opens `path` with the saved session (the spec must `test.use({ storageState: AUTH_STATE_PATH })`).
 * `/` lands on the Map screen; other routes are checked by the caller.
 */
export async function openSignedIn(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  if (path === "/") await expect(page.locator('[data-route="map"]')).toBeVisible();
}
