// "Why is this a lead?" panel on the hosted app at phone, tablet and desktop widths (the three
// Playwright projects): a row opens its panel in the results area, the rules show value, source and
// CID, Verify CID and Details are there, nothing overflows sideways, Details opens the property and
// Back returns to the list. Read-only browsing as the seeded admin; nothing is created.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "./lib/auth.js";
import { LAYOUT_SEARCH_PATH } from "./lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const SHOTS = process.env.WHY_SHOTS_DIR;

async function shot(page: Page, name: string, project: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}

test.describe("Why is this a lead? (responsive)", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}) => {
    requirePassword();
  });

  test("a row opens its panel; rules, Verify CID and Details fit the screen; Details opens the property; Back returns", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    await page.goto(LAYOUT_SEARCH_PATH);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const row = page.locator("[data-result-row]").first();
    await expect(row).toBeAttached({ timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);

    // Expand the first row (on a phone the sheet peeks; the control is inside the first card).
    await row.getByRole("button", { name: "Expand details" }).click();
    await expect(row).toHaveAttribute("data-expanded", "true");
    await shot(page, "1-row-expanded", project);

    const why = row.getByRole("button", { name: "Why is this a lead?" });
    await why.scrollIntoViewIfNeeded();
    await why.click();

    const panel = page.locator("[data-why-panel]");
    await expect(panel).toBeVisible();
    const heading = panel.getByRole("heading", { name: /^Why .+ is a lead$/ });
    await expect(heading).toBeVisible();
    // The panel opens at its top (the list was scrolled to the row): title and Back are on screen.
    await expect(heading).toBeInViewport();
    await expect(panel.getByRole("button", { name: /Back to results/ })).toBeInViewport();
    await expect(panel.locator("[data-why-rule]").first()).toBeVisible();
    const distance = panel.locator("[data-why-rule='distance']");
    await expect(distance).toContainText(/Within 3 mi of the pin/);
    await expect(distance).toContainText(/Run \d/);
    await expect(panel.locator("[data-why-coordinates]")).toBeVisible();
    const verify = panel.locator("[data-why-verify]");
    await expect(verify).toBeVisible();
    await expect(verify).toHaveAttribute("href", /\/data\/verify\/bafkrei/);
    await shot(page, "2-why-panel", project);

    // Nothing pushes the page sideways, and the panel sits inside the viewport.
    const fit = await page.evaluate(() => {
      const el = document.querySelector("[data-why-panel]") as HTMLElement;
      const b = el.getBoundingClientRect();
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        left: b.left,
        right: b.right,
        width: window.innerWidth,
      };
    });
    expect(fit.pageOverflow, "horizontal page overflow").toBeLessThanOrEqual(1);
    expect(fit.left).toBeGreaterThanOrEqual(-1);
    expect(fit.right).toBeLessThanOrEqual(fit.width + 1);

    // Details opens the property.
    await panel.getByRole("button", { name: "Details" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("details[data-lineage-metadata]")).toBeAttached();
    await shot(page, "3-details", project);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Back returns to the list.
    await panel.getByRole("button", { name: /Back to results/ }).click();
    await expect(page.locator("[data-why-panel]")).toHaveCount(0);
    await expect(page.locator("[data-result-row]").first()).toBeAttached();
  });
});
