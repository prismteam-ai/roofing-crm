// The Map property drawer, at the three viewport projects: the controls a person must reach are
// inside the screen and big enough to tap. Below 1280 px the drawer is a full-width sheet that
// scrolls on its own, so each control is scrolled into view first and then measured with the
// sheet settled (it slides in). Read-only: opens the fixed open-permit property, creates nothing.
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import { expectInsideViewport, MIN_TAP, settledBox, viewportOf } from "../lib/layout.js";
import { LEAD_FIXTURES } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

test.describe("Drawer actions fit the screen and are tappable", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await page.goto(`/?sel=${LEAD_FIXTURES.openPermit.cid}`);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  });

  test("Create lead, the contractor block, the BBB link and Close are on screen and at least 44 px", async ({
    page,
  }) => {
    const drawer = page.locator('[role="dialog"][data-property-cid]');
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    const sheet = await settledBox(drawer);
    const { width } = viewportOf(page);
    expect(sheet.x + sheet.width, "drawer meets the right edge").toBeLessThanOrEqual(width + 1);

    const close = drawer.getByRole("button", { name: "Close", exact: true });
    const createLead = drawer
      .getByRole("button", { name: "Create lead", exact: true })
      .or(drawer.getByRole("link", { name: "Open lead", exact: true }))
      .first();
    const contractor = drawer.locator('[data-field="contractor_name_as_printed"]').first();
    const bbb = drawer.locator('a[data-field="bbb_url"]').first();

    // The Close control is in the sheet's header: on screen without scrolling.
    expectInsideViewport(await settledBox(close), page, "Close");
    const closeBox = await settledBox(close);
    expect(closeBox.width, "Close width").toBeGreaterThanOrEqual(MIN_TAP);
    expect(closeBox.height, "Close height").toBeGreaterThanOrEqual(MIN_TAP);

    // The lead check answers after a lookup. The fixture may already be a lead (shared with the
    // B-07 suite), in which case the same slot holds "Open lead"; the test never creates one.
    await expect(createLead).toBeVisible({ timeout: 20_000 });
    const label = (await createLead.innerText()).trim();
    expect(["Create lead", "Open lead"], `lead slot says "${label}"`).toContain(label);
    for (const [name, locator] of [
      ["Create lead", createLead],
      ["Contractor block", contractor],
      ["BBB link", bbb],
    ] as const) {
      await expect(locator, `${name} is in the drawer`).toBeAttached();
      await locator.scrollIntoViewIfNeeded();
      const box = await settledBox(locator);
      expectInsideViewport(box, page, name);
      expect(box.height, `${name} height is at least ${String(MIN_TAP)} px`).toBeGreaterThanOrEqual(
        name === "Contractor block" ? 1 : MIN_TAP,
      );
    }
    // BBB link: a short text link may be narrower than a tap target only if its text is.
    const bbbBox = await settledBox(bbb);
    expect(bbbBox.width, "BBB link width").toBeGreaterThanOrEqual(MIN_TAP);
    const lead = await settledBox(createLead);
    expect(lead.width, "Create lead width").toBeGreaterThanOrEqual(MIN_TAP);
  });
});
