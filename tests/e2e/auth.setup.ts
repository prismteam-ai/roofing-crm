// The `setup` project (playwright.config.ts): signs the seeded admin in once per Playwright
// invocation and saves the session for every viewport project (tests/e2e/lib/auth.ts explains
// why one state fits all three). Without CRM_TEST_PASSWORD it writes an empty state and skips,
// so the dependent projects still run and their signed-in specs skip exactly as before.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "@playwright/test";
import {
  AUTH_STATE_PATH,
  EMPTY_STORAGE_STATE,
  SEEDED_PASSWORD,
  signInThroughForm,
  requirePassword,
} from "./lib/auth.js";

test("sign in once and save the session", async ({ page }) => {
  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
  // Always replace the previous run's file first: a stale signed-in state must never outlive
  // the password that produced it.
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(EMPTY_STORAGE_STATE));
  requirePassword();
  if (!SEEDED_PASSWORD) return;
  await signInThroughForm(page, SEEDED_PASSWORD);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
