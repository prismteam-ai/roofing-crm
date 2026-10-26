// B-01 TZ04 (NFR-002, TC-NF-02; AC-5 reachability): responsive coverage for the Coming Soon
// screen at 390/768/1440 px, run via playwright.config.ts's three viewport projects against
// RUNTIME_URL. Reached the only way this app allows it — sign in, then tap a disabled roadmap
// row (AC-5) — per the skill's rule that a workflow-reached state needs its exact navigation
// steps, which here come straight from the story (stories/B-01-crm-shell.md AC-5) and
// B-01.spec.ts's existing AC-5 case. Scope is layout only (visibility, overflow, Atlas tokens) —
// the "opens a real page, never a 404" behaviour is already asserted by B-01.spec.ts.
import { expect, test } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";
import { AUTH_STATE_PATH, openSignedIn, requirePassword } from "../lib/auth.js";

// Signed in once by the `setup` project (tests/e2e/lib/auth.ts); this file tests layout, not sign-in.
test.use({ storageState: AUTH_STATE_PATH });

async function openComingSoon(page: import("@playwright/test").Page): Promise<void> {
  await openSignedIn(page);
  const moreTrigger = page.getByRole("button", { name: "More", exact: true });
  if (await moreTrigger.isVisible()) {
    await moreTrigger.click();
  }
  // force: true — the row is deliberately aria-disabled (AC-4) but must still open Coming Soon
  // (AC-5); same actionability override B-01.spec.ts's own AC-5 case uses.
  await page.getByRole("button", { name: /Campaigns/ }).click({ force: true });
  await expect(page.locator('[data-route="coming-soon"]')).toBeVisible();
}

test.describe("Responsive design: Coming Soon screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await openComingSoon(page);
    await page.evaluate(() => document.fonts.ready);
  });

  test("renders with no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("the heading and Back to Map action are visible and reachable without horizontal scroll", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const heading = page.getByRole("heading", { level: 2 });
    const backLink = page.getByRole("link", { name: "Back to Map" });
    await expect(heading).toBeVisible();
    await expect(backLink).toBeVisible();

    const box = await backLink.boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test("passes the Atlas design-token audit (no non-token color, type, spacing or radius values)", async ({
    page,
  }) => {
    const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
    expect(audit.checkedElements).toBeGreaterThan(0);
    expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
  });
});
