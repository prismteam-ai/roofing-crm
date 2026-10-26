// B-01 TZ04 (NFR-002, TC-NF-02): responsive/Atlas-token coverage for the sign-in screen at
// 390/768/1440 px, run via playwright.config.ts's three viewport projects against RUNTIME_URL
// (never localhost — config-guard.spec.ts enforces this at config-load time). This is the
// `smeargle` suite ARD-B §10's "Responsive and accessibility" row and NFR-002 name as the
// broader layout authority alongside TC-NF-02's narrower functional-reachability check.
//
// Scope: visual/layout verification only (visibility, layout mode, overflow, Atlas tokens) — no
// sign-in business logic (that's B-01.spec.ts's AC-1/AC-3 cases).
import { expect, test } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";

test.describe("Responsive design: sign-in screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector('[data-route="sign-in"]');
    await page.evaluate(() => document.fonts.ready);
  });

  test("renders with no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("the sign-in form is visible and reachable without horizontal scroll", async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const username = page.getByLabel("Email");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: /Sign in/ });
    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();

    const submitBox = await submit.boundingBox();
    expect(submitBox).not.toBeNull();
    if (submitBox && viewport) {
      expect(submitBox.x).toBeGreaterThanOrEqual(0);
      expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(viewport.width + 1);
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
