// The Map search box on the hosted app at phone, tablet and desktop widths: it is editable, suggests
// places and ZIPs from the gazetteer, finds a permit number and a TCAD account in the live index,
// finds a street address from Run 3.1, and the results-header info popover stays
// inside the screen. Read-only browsing as the seeded admin.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "./lib/auth.js";
import { LAYOUT_SEARCH_PATH, OPEN_PERMIT_NUMBER } from "./lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const SHOTS = process.env.SEARCH_SHOTS_DIR;
const shot = async (page: Page, name: string, project: string): Promise<void> => {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
};

test.describe("Search box (responsive)", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}) => {
    requirePassword();
  });

  test("editable; a place and a ZIP are suggested and centre the search; a permit number and an address are handled", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    await page.goto("/");
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const box = page.getByRole("combobox", { name: /Search an address/ });
    await expect(box).toBeVisible();

    // Focused and empty: samples that work on the current data.
    await box.click();
    await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible();
    await shot(page, "1-samples", project);

    // A city is suggested from the gazetteer, and choosing it centres the search there.
    await box.fill("Pflug");
    const place = page.getByRole("option", { name: /Pflugerville/ }).first();
    await expect(place).toBeVisible();
    await shot(page, "2-place", project);
    await place.click();
    await expect(page).toHaveURL(/lat=30\.\d+/);
    await expect(page).toHaveURL(/lng=-97\.\d+/);

    // A ZIP code.
    await box.fill("78660");
    const zip = page.getByRole("option", { name: /78660/ }).first();
    await expect(zip).toBeVisible();
    await zip.click();
    await expect(page).toHaveURL(/lat=30\.\d+/);

    // A permit number from the live index opens its property.
    await box.fill(OPEN_PERMIT_NUMBER);
    const permit = page.getByRole("option", { name: /2026-121002/ }).first();
    await expect(permit).toBeVisible({ timeout: 30_000 });
    await permit.click();
    await expect(page).toHaveURL(/sel=/, { timeout: 30_000 });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await shot(page, "3-permit-opened", project);

    // A street address (Run 3.1, TCAD's printed situs) lists its matching properties. This step
    // passes only on the hosted app once Run 3.1 is the promoted index.
    await box.fill("2725 WOODALL DR 1401");
    await expect(page.getByRole("option", { name: /WOODALL/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, "4-address", project);

    // Escape closes the list; the clear button empties the box.
    await box.press("Escape");
    await expect(page.getByRole("listbox", { name: "Search suggestions" })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(box).toHaveValue("");
  });

  test("the results header info popover opens inside the screen", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    await page.goto(LAYOUT_SEARCH_PATH);
    await expect(page.locator("[data-result-row]").first()).toBeAttached({ timeout: 45_000 });
    // The results header's own control, by its exact accessible name: a looser pattern also matches
    // the Filters suggestions ("... open or stalled permit") and would apply a preset instead.
    const info = page.getByRole("button", { name: "Permit coverage note", exact: true });
    test.skip((await info.count()) === 0, "no coverage info control at this size");
    await info.click();
    const pop = page.locator('[role="dialog"], [role="tooltip"], [data-popover]').last();
    await expect(pop).toBeVisible();
    const box = await pop.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    if (box !== null && viewport !== null) {
      expect(box.x, "popover left edge on screen").toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, "popover right edge on screen").toBeLessThanOrEqual(
        viewport.width + 1,
      );
    }
    await shot(page, "5-popover", project);
  });
});
