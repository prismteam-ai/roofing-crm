// An unknown URL at 390/768/1440: the not-found page inside the shell (navigation still there),
// the way back to the Map, and no sideways scroll. Read-only.
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import {
  expectInsideViewport,
  expectNoHorizontalScroll,
  MIN_TAP,
  settledBox,
} from "../lib/layout.js";

test.use({ storageState: AUTH_STATE_PATH });

test("an unknown path shows the not-found page inside the shell, with a way back to the Map", async ({
  page,
}) => {
  requirePassword();
  await page.goto("/nonexistent");
  const notFound = page.locator('[data-route="not-found"]');
  await expect(notFound).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: /no page here/i })).toBeVisible();
  // Inside the shell: the primary navigation is on screen around it.
  await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
  const back = notFound.getByRole("link", { name: "Back to Map" });
  await expect(back).toBeVisible();
  const box = await settledBox(back);
  expectInsideViewport(box, page, "Back to Map");
  expect(box.height, "Back to Map height").toBeGreaterThanOrEqual(MIN_TAP);
  await expectNoHorizontalScroll(page, "not-found page");
  await back.click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
});
