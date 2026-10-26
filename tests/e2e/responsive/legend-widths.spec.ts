// The map legend at all three widths (map-ui.spec.ts, pinned to desktop-1440, covers the Layers
// switch there): it is open by default at 390, 768 and 1440 (PO decision 2026-10-26), stays inside
// the screen, can be closed with its own button, and comes back from the Layers dialog's switch.
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import { expectInsideViewport, expectNoHorizontalScroll, settledBox } from "../lib/layout.js";

test.use({ storageState: AUTH_STATE_PATH });

test("the legend is open by default, fits the screen, closes, and reopens from Layers", async ({
  page,
}) => {
  requirePassword();
  await page.goto("/");
  await expect(page.locator('[data-route="map"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const legend = page.getByRole("region", { name: "Map legend" });
  await expect(legend).toBeVisible();
  expectInsideViewport(await settledBox(legend), page, "legend");
  await expectNoHorizontalScroll(page, "legend open");

  await legend.getByRole("button", { name: "Close legend" }).click();
  await expect(legend).toBeHidden();

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Layers" });
  await expect(dialog).toBeVisible();
  const toggle = dialog.getByRole("checkbox", { name: /^Legend/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(legend).toBeVisible();
});
