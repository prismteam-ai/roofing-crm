// The Map's roof age default (PO decision 2026-10-26; README: "roofs older than a configurable age
// threshold (default suggestion: 15 years)"): with no `roof` in the URL the Map filters to roofs of
// 15 years or more and the 15 chip is pressed; "Any" is an explicit URL state (`roof=any`) that
// survives a reload. Relations only, no counts from the data: the default equals an explicit
// `roof=15`, and Any never has fewer matches than 15. Runs at the three projects.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "./lib/auth.js";
import { EAST_TRAVIS } from "./lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

// The pin only (no roof param), 3 mi: the same area LAYOUT_SEARCH_PATH uses, which answers quickly.
const PIN = `lat=${EAST_TRAVIS.lat}&lng=${EAST_TRAVIS.lng}&r=3`;

const map = (page: Page) => page.locator('[data-route="map"]');

/** The results header's "Matches N", read after the list has loaded. */
async function matches(page: Page, query: string): Promise<number> {
  await page.goto(`/?${query}`);
  await expect(map(page)).toBeVisible();
  await expect(page.getByTestId("search-results")).toBeVisible({ timeout: 60_000 });
  const header = page.getByText(/^Matches \d+$/).first();
  await expect(header).toBeAttached({ timeout: 30_000 });
  return Number(/\d+/.exec((await header.textContent()) ?? "")?.[0]);
}

/** The roof age chip group, opening the Filters sheet first where the filters are a sheet. */
async function roofGroup(page: Page, projectName: string) {
  if (projectName !== "desktop-1440") {
    const sheet = map(page).getByRole("dialog", { name: "Filters" });
    // After a reload the sheet can still be open (its state is kept), and its backdrop would
    // block a second click on the Filters button: open it only when it is not already there.
    if (!(await sheet.isVisible())) {
      await map(page)
        .getByRole("button", { name: /^Filters/ })
        .click();
    }
    await expect(sheet).toBeVisible();
  }
  return map(page).getByRole("group", { name: "Roof age threshold" });
}

test.describe("Roof age defaults to 15 years", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(() => {
    requirePassword();
  });

  test("a fresh load pressed the 15 chip, matches an explicit roof=15, and Any gives at least as many", async ({
    page,
  }, testInfo) => {
    const byDefault = await matches(page, PIN);
    const group = await roofGroup(page, testInfo.project.name);
    await expect(group.getByRole("button", { name: "15", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(group.getByRole("button", { name: "Any", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const explicit = await matches(page, `${PIN}&roof=15`);
    expect(byDefault, "the default count equals the count with an explicit roof=15").toBe(explicit);

    const any = await matches(page, `${PIN}&roof=any`);
    expect(any, "Any has at least as many matches as 15+").toBeGreaterThanOrEqual(explicit);
    expect(any, "Any adds the roofs under 15 years and the ones with no roof age").toBeGreaterThan(
      explicit,
    );
  });

  test("choosing Any writes roof=any to the URL, survives a reload", async ({ page }, testInfo) => {
    await matches(page, PIN);
    let group = await roofGroup(page, testInfo.project.name);
    await group.getByRole("button", { name: "Any", exact: true }).click();
    await expect(page).toHaveURL(/roof=any/);

    await page.reload();
    await expect(map(page)).toBeVisible();
    group = await roofGroup(page, testInfo.project.name);
    await expect(group.getByRole("button", { name: "Any", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(group.getByRole("button", { name: "15", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page).toHaveURL(/roof=any/);
  });
});
