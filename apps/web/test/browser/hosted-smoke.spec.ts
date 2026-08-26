/**
 * Hosted-runtime smoke tests against the public Amplify deployment.
 *
 * Requires live API + RAG index. Override with PLAYWRIGHT_BASE_URL when needed.
 */
import { expect, test } from "@playwright/test";

const WEST_CHESTER_LAT = 39.9607;
const WEST_CHESTER_LNG = -75.6055;
const MAP_SEARCH_REGION = { name: "Map search" } as const;
const KNOWN_SYNTHETIC_PERMIT_PROPERTY_ID = "1-10-67.24";
const MAP_FIRST_RUN_TOUR_STORAGE_KEY = "plat-map-first-run-tour-v1";

async function expectCoverageBanner(page: import("@playwright/test").Page) {
  const banner = page.getByTestId("coverage-mode-banner").first();
  await expect(banner).toBeVisible({ timeout: 30_000 });
  return banner;
}

async function dropPinAtCurrentLocation(page: import("@playwright/test").Page) {
  const mapRegion = page.getByRole("region", MAP_SEARCH_REGION);
  await mapRegion.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByTestId("search-map-center")).toContainText(
    String(WEST_CHESTER_LAT).slice(0, 6),
    { timeout: 15_000 },
  );
}

async function openMapSearchFilterHud(page: import("@playwright/test").Page) {
  const toggle = page.getByTestId("map-search-filter-hud-toggle");
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.getByTestId("map-search-property-filters-form").waitFor();
}

async function waitForCandidateList(page: import("@playwright/test").Page) {
  const list = page.getByTestId("search-in-radius-candidate-list");
  await expect(list).toBeVisible({ timeout: 90_000 });
  await expect(list.locator("li").first()).toBeVisible({ timeout: 90_000 });
  return list;
}

async function openKnownSyntheticPermitProperty(page: import("@playwright/test").Page) {
  const knownRow = page.getByTestId(
    `search-in-radius-candidate-row-${KNOWN_SYNTHETIC_PERMIT_PROPERTY_ID}`,
  );
  if (await knownRow.isVisible()) {
    await knownRow.click();
    return;
  }

  await page.getByRole("button", { name: "Ask about this radius" }).click();
  await expect(page.getByTestId("roofing-opportunity-agent-panel")).toBeVisible();
  await page
    .getByTestId("roofing-opportunity-agent-message")
    .fill(
      "Which properties near West Chester have open roofing permits at least five years?",
    );
  await page.getByTestId("roofing-opportunity-agent-submit").click();
  await expect(page.getByTestId("roofing-opportunity-agent-result")).toBeVisible({
    timeout: 90_000,
  });
  const citation = page
    .locator(
      `[data-testid="roofing-opportunity-agent-citation-${KNOWN_SYNTHETIC_PERMIT_PROPERTY_ID}"]`,
    )
    .first();
  await expect(citation).toBeVisible({ timeout: 90_000 });
  await citation.click();
}

async function openDrawerWithConvertAction(page: import("@playwright/test").Page) {
  const list = await waitForCandidateList(page);
  const rows = list.locator('[data-testid^="search-in-radius-candidate-row-"]');
  const rowCount = await rows.count();
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const propertyId = (await row.getAttribute("data-testid"))?.replace(
      "search-in-radius-candidate-row-",
      "",
    );
    if (propertyId === undefined || propertyId.length === 0) {
      continue;
    }
    await row.click();
    await expect(page.getByTestId("published-property-drawer")).toBeVisible();
    const convertButton = page.getByTestId("convert-published-property-to-lead");
    if (await convertButton.isVisible()) {
      return propertyId;
    }
    await page.getByRole("button", { name: "Close roof details" }).click();
  }
  throw new Error("No unconverted property found in the current radius list");
}

test.describe("hosted Chester demo smoke", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: WEST_CHESTER_LAT,
      longitude: WEST_CHESTER_LNG,
    });
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, "done");
    }, MAP_FIRST_RUN_TOUR_STORAGE_KEY);
    await page.goto("/");
    await expectCoverageBanner(page);
  });

  test("shows Chester demo coverage banner", async ({ page }) => {
    const banner = await expectCoverageBanner(page);
    await expect(banner).toContainText("87,274 parcels");
    await expect(banner).toContainText("Synthetic data for evaluation");
  });

  test("radius search returns candidates after pin drop", async ({ page }) => {
    await dropPinAtCurrentLocation(page);
    const list = await waitForCandidateList(page);
    const rowCount = await list.locator("li").count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test("aging threshold slider is available in filters", async ({ page }) => {
    await dropPinAtCurrentLocation(page);
    await waitForCandidateList(page);
    await openMapSearchFilterHud(page);
    const slider = page.getByTestId("min-structure-age-years-slider");
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", /15 years/);
    const agingCheckbox = page.getByRole("checkbox", {
      name: /structure built before/i,
    });
    await agingCheckbox.uncheck();
    await expect(page.getByTestId("search-in-radius-candidate-list")).toBeVisible({
      timeout: 30_000,
    });
    await agingCheckbox.check();
    await expect(page.getByTestId("aging-roof-hidden-count")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("property drawer shows permit contractor and BBB for synthetic demo", async ({
    page,
  }) => {
    await dropPinAtCurrentLocation(page);
    await waitForCandidateList(page);
    await openKnownSyntheticPermitProperty(page);
    await expect(page.getByTestId("published-property-drawer")).toBeVisible();
    await expect(page.getByTestId("property-permit-layer-panel")).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId("published-property-drawer-bbb")).toBeVisible();
    await expect(
      page.getByTestId("published-property-drawer-synthetic-demo"),
    ).toBeVisible();
  });

  test("lead create persists after reload", async ({ page }) => {
    await dropPinAtCurrentLocation(page);
    const propertyKey = await openDrawerWithConvertAction(page);
    await page.getByTestId("convert-published-property-to-lead").click();
    await page.getByTestId("confirm-convert-published-property-to-lead").click();
    await expect(
      page.getByTestId("convert-published-property-to-lead-status"),
    ).toContainText(/lead/i, { timeout: 30_000 });
    await page.reload();
    await expectCoverageBanner(page);
    await dropPinAtCurrentLocation(page);
    await page.getByRole("button", { name: "Leads list" }).click();
    await expect(page.getByTestId("lead-record-list-panel")).toBeVisible();
    await expect(page.getByTestId(`lead-record-row-${propertyKey}`)).toBeVisible({
      timeout: 30_000,
    });
    const statusSelect = page.getByTestId(`lead-record-status-${propertyKey}`);
    await statusSelect.selectOption("contacted");
    await expect(statusSelect).toHaveValue("contacted");
  });

  test("agent ask returns answer with citation", async ({ page }) => {
    await dropPinAtCurrentLocation(page);
    await waitForCandidateList(page);
    await page.getByRole("button", { name: "Ask about this radius" }).click();
    await expect(page.getByTestId("roofing-opportunity-agent-panel")).toBeVisible();
    await page
      .getByTestId("roofing-opportunity-agent-message")
      .fill(
        "Which properties near West Chester have open roofing permits older than five years?",
      );
    await page.getByTestId("roofing-opportunity-agent-submit").click();
    await expect(page.getByTestId("roofing-opportunity-agent-result")).toBeVisible({
      timeout: 90_000,
    });
    const citation = page
      .locator('[data-testid^="roofing-opportunity-agent-citation-"]')
      .first();
    await expect(citation).toBeVisible({ timeout: 90_000 });
    await citation.click();
    await expect(page.getByTestId("published-property-drawer")).toBeVisible({
      timeout: 30_000,
    });
  });
});
