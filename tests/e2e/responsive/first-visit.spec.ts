// The first-visit "What can I ask?" card at 390/768/1440 on the hosted app: it fits the screen
// (on a phone it is a compact card, not most of the screen), Close and Got it both dismiss it, and
// it stays dismissed after a reload. The suite starts every browser with the card already
// dismissed (tests/e2e/lib/onboarding.ts); `?first=1` forces it open, and clearing the stored
// choice brings back the genuine first visit.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import {
  expectInsideViewport,
  expectNoHorizontalScroll,
  settledBox,
  viewportOf,
} from "../lib/layout.js";
import { WHAT_CAN_I_ASK_STORAGE_KEY } from "../lib/onboarding.js";

test.use({ storageState: AUTH_STATE_PATH });

const card = (page: Page) => page.getByTestId("what-can-i-ask");

async function openForced(page: Page): Promise<void> {
  await page.goto("/?first=1");
  await expect(page.locator('[data-route="map"]')).toBeVisible();
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe("First-visit card", () => {
  test.beforeEach(() => {
    requirePassword();
  });

  test("fits the viewport (at 390 at most about 45 percent of its height)", async ({ page }) => {
    await openForced(page);
    const box = await settledBox(card(page));
    expectInsideViewport(box, page, "first-visit card");
    const { width, height } = viewportOf(page);
    if (width < 600) {
      expect(box.height, "card height at 390").toBeLessThanOrEqual(height * 0.45 + 1);
    } else {
      expect(box.height, "card height").toBeLessThanOrEqual(height * 0.8);
    }
    await expectNoHorizontalScroll(page, "first-visit card open");
  });

  for (const [name, button] of [
    ["Close", "Close"],
    ["Got it", "Got it"],
  ] as const) {
    test(`${name} dismisses it, and it stays dismissed after a reload`, async ({ page }) => {
      // A genuine first visit: no stored choice, no ?first=1.
      await page.goto("/");
      await expect(page.locator('[data-route="map"]')).toBeVisible();
      await page.evaluate((key) => localStorage.removeItem(key), WHAT_CAN_I_ASK_STORAGE_KEY);
      await page.reload();
      await expect(card(page)).toBeVisible();
      await card(page).getByRole("button", { name: button, exact: true }).click();
      await expect(card(page)).toBeHidden();
      await page.reload();
      await expect(page.locator('[data-route="map"]')).toBeVisible();
      await expect(card(page)).toBeHidden();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), WHAT_CAN_I_ASK_STORAGE_KEY),
      ).toBe("dismissed");
    });
  }
});
