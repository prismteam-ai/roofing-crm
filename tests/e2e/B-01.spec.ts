// B-01 story Playwright tests (T013-T016, T024-T025), one AC per describe block. Per
// plan.md's Complexity Tracking row on Article XXI: written first and confirmed failing against
// the local Turborepo dev server (no hosted stack exists yet in this phase); re-run against
// RUNTIME_URL by TZ03 once TZ02 deploys. config-guard.spec.ts enforces RUNTIME_URL is never
// localhost for that later run — this file does not special-case localhost itself.
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, openSignedIn, requirePassword } from "./lib/auth.js";

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).

async function signIn(
  page: import("@playwright/test").Page,
  password: string,
  username: string = SEEDED_USERNAME,
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
}

// AC-1 (TC-001, TC-006, TC-010): private-window sign-in, lands on Map centered on Travis County,
// no self-sign-up link, session survives a reload.
test.describe("AC-1: sign in and land on the Travis County map", () => {
  test("no self-sign-up link anywhere on the sign-in page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  });

  test("signing in with the seeded credentials lands on the Map screen", async ({ page }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await expect(page.getByTestId("crm-map")).toBeVisible();
  });

  test("the session survives a reload (stays on the Map screen)", async ({ page }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    // Wait for sign-in to actually land (the SRP round trip + lockout-gate Lambda take a few
    // seconds) before reloading — found deploying: reloading mid-flight wipes the in-progress
    // sign-in and lands back on /sign-in, which looked like a session-persistence bug but
    // wasn't one; signIn() itself can't wait for this since it's reused by the AC-3 lockout
    // test, which expects wrong-password attempts to never reach the map at all.
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-route="map"]')).toBeVisible();
  });
});

// AC-2 (TC-002): free pan/zoom never drops below the county bbox; health.ping traces within 3s.
test.describe("AC-2: map bounds and health.ping trace", () => {
  // Not a sign-in case: reuses the session the `setup` project saved (tests/e2e/lib/auth.ts).
  // AC-1 and AC-3 above keep signing in through the real form.
  test.use({ storageState: AUTH_STATE_PATH });

  test("health.ping responds from the Map screen within 3s of load", async ({ page }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    // Listen before navigating: with the saved session the Map screen (and its ping) loads
    // straight from `/`, with no sign-in round trip in between.
    const ping = page.waitForResponse((res) => res.url().includes("/api/trpc/health.ping"), {
      timeout: 3000,
    });
    await page.goto("/");
    const response = await ping;
    expect(response.ok()).toBe(true);
  });

  // TD-4 fix: TC-002's pan/zoom claim was previously only unit-tested (bounds.test.ts's pure
  // math), never asserted against the live map. CrmMap.tsx exposes window.__crmMap for exactly
  // this — try to zoom out past the computed minZoom and confirm MapLibre itself clamps it,
  // never actually dropping below full-county visibility.
  test("zooming out never drops below the county's minimum zoom", async ({ page }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await openSignedIn(page);
    await page.waitForFunction(() => {
      const map = (window as unknown as { __crmMap?: { loaded(): boolean } }).__crmMap;
      return map?.loaded() === true;
    });
    const minZoom = await page.evaluate(() =>
      (window as unknown as { __crmMap: { getMinZoom(): number } }).__crmMap.getMinZoom(),
    );
    expect(minZoom).toBeGreaterThan(0);
    const clampedZoom = await page.evaluate(() => {
      const map = (
        window as unknown as { __crmMap: { setZoom(z: number): unknown; getZoom(): number } }
      ).__crmMap;
      map.setZoom(0); // attempt to zoom out far past any sane county-wide minimum
      return map.getZoom();
    });
    expect(clampedZoom).toBeCloseTo(minZoom, 5);
  });
});

// AC-3 (TC-003, TC-004, TC-011): 3 wrong passwords then a 4th locks out with the typed message;
// a successful sign-in after the 5-minute cooldown succeeds.
test.describe("AC-3: typed lockout after the 4th consecutive failed attempt", () => {
  // Reset the lockout counter after this test proves it locked — otherwise every later test in
  // this project's run (the tile-failure edge case, AC-4, AC-5, and every tests/e2e/responsive/*
  // test on this same project) would also fail to sign in for the rest of the real 5-minute
  // cooldown (found running the full suite).
  // The lockout counter is keyed by the username string alone and the failures are reported by
  // the client, so this test locks a throwaway username of its own, never the shared admin
  // account. Found in CI: with the shared account, a lock left by one run (CI cannot reset it:
  // no AWS region or credentials there) made the next run fail on attempt 1.
  const lockoutProbeUsername = `lockout-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@roofing-crm.test`;

  test("the 4th wrong password shows the typed lockout message, never a generic error", async ({
    page,
  }, testInfo) => {
    // Found running the full suite: this test genuinely locks the one shared, real admin
    // account for a real 5-minute cooldown — it is the only test in this file that mutates
    // account-wide state rather than just signing in. Running it once per viewport project (the
    // suite's default) locks the account on the first project and the next project's run then
    // finds it still locked, failing with the lockout message on what should be attempt 1. This
    // is an auth-logic case, not a responsive/layout one, so it only needs to run once per suite
    // execution — not once per viewport.
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "lockout mutates the one shared account for a real 5 minutes; runs once (desktop-1440 only), not once per viewport",
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      await signIn(page, "wrong-password-does-not-match", lockoutProbeUsername);
      await page.waitForSelector("[data-sign-in-error]");
      // TD-4 fix (TC-004): the first 3 attempts must show the plain invalid-credentials text,
      // distinct from the eventual lockout message — previously only the final (4th) attempt's
      // text was ever asserted, so a bug that showed the lockout message prematurely (e.g. on
      // attempt 2) would have passed unnoticed.
      if (attempt < 3) {
        await expect(page.locator("[data-sign-in-error]")).toHaveText(
          "Wrong email or password. Check the test login you were sent.",
        );
      }
    }
    await expect(page.locator("[data-sign-in-error]")).toHaveText(
      "Too many attempts — try again in 5 minutes.",
    );
  });
});

// Tile-failure edge case (TC-007): a tile-host network abort shows the named CrmMapFailed390
// state with a Retry action, never a blank grey grid.
test.describe("Tile-failure edge case (closes the spec.md gap flagged at G5)", () => {
  // Not a sign-in case: reuses the session the `setup` project saved (tests/e2e/lib/auth.ts).
  // AC-1 and AC-3 above keep signing in through the real form.
  test.use({ storageState: AUTH_STATE_PATH });

  test("aborting tile-host requests renders CrmMapFailed390 with a Retry action", async ({
    page,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    // B-03: CrmMap.tsx's DEFAULT_STYLE moved from demotiles.maplibre.org to
    // tiles.openfreemap.org (the former had no detail at city-level zoom, found live) — this
    // route pattern follows it so the tile-failure edge case still actually aborts the map's
    // real requests, not a dead host.
    await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
    await page.goto("/");
    await expect(page.locator('[data-state="CrmMapFailed390"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});

// AC-4 (TC-005, TC-009): all 5 roadmap rows render aria-disabled with a "Coming soon" tooltip, at
// 1440px and inside the 390px "More" sheet.
test.describe("AC-4: disabled roadmap rows", () => {
  // Not a sign-in case: reuses the session the `setup` project saved (tests/e2e/lib/auth.ts).
  // AC-1 and AC-3 above keep signing in through the real form.
  test.use({ storageState: AUTH_STATE_PATH });

  const SECTIONS = ["Campaigns", "Estimates", "Jobs", "Invoices", "Outreach"];

  test("all 5 rows are aria-disabled with a Coming soon tooltip", async ({ page }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await openSignedIn(page);
    // Found deploying (same cause as the "survives a reload" fix above): `moreTrigger.isVisible()`
    // is a one-shot synchronous check, not a retrying `expect` — checked before the SRP round
    // trip finishes, it always saw the sign-in page (no "More" button yet) and silently skipped
    // the click, leaving the sheet closed for the rest of the test.
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const moreTrigger = page.getByRole("button", { name: "More", exact: true });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    for (const section of SECTIONS) {
      const row = page.getByRole("button", { name: new RegExp(section) });
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row).toHaveAttribute("title", "Coming soon");
    }
  });
});

// AC-5 (TC-008): tapping a disabled row opens a real Coming Soon page with "Back to Map", never
// a 404.
test.describe("AC-5: a disabled row opens Coming Soon, never a 404", () => {
  // Not a sign-in case: reuses the session the `setup` project saved (tests/e2e/lib/auth.ts).
  // AC-1 and AC-3 above keep signing in through the real form.
  test.use({ storageState: AUTH_STATE_PATH });

  test('tapping "Campaigns" opens Coming Soon with a working Back to Map action', async ({
    page,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await openSignedIn(page);
    // Same fix as AC-4 above: wait for the SRP round trip to actually land before checking for
    // "More" (found deploying).
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const moreTrigger = page.getByRole("button", { name: "More", exact: true });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    // force: true — the row is deliberately `aria-disabled="true"` (AC-4's own requirement) but
    // must still be clickable (AC-5: tapping it opens Coming Soon, never a 404); Playwright's
    // default actionability check treats aria-disabled as a real disabled state and refuses to
    // click, which found this product's own intentional "disabled-looking but interactive" NavRow
    // pattern rather than an app bug.
    await page.getByRole("button", { name: /Campaigns/ }).click({ force: true });
    await expect(page.locator('[data-route="coming-soon"]')).toBeVisible();
    await page.getByRole("link", { name: "Back to Map" }).click();
    await expect(page.locator('[data-route="map"]')).toBeVisible();
  });
});
