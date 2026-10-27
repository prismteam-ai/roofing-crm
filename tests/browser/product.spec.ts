import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";
const evidence = process.env.PRISM_BROWSER_EVIDENCE_DIR ?? "test-results";
async function screenshot(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: false,
  });
}
async function ready(page: Page) {
  await expect(page.getByTestId("property-row").first()).toBeVisible();
  await expect(page.getByText("Updating search…")).toHaveCount(0);
}
async function setFilters(
  page: Page,
  roof: boolean,
  permit: "any" | "open" | "closed",
  days = 0,
) {
  await page.getByLabel("Filter by roof age", { exact: true }).setChecked(roof);
  await page.getByLabel("Permit status", { exact: true }).selectOption(permit);
  await page
    .getByLabel("Minimum open days", { exact: true })
    .fill(String(days));
  await expect(page.getByText("Updating search…")).toHaveCount(0);
  await page.waitForTimeout(250);
}
test.beforeEach(async ({ context, page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["blob:", "data:", "about:"].includes(url.protocol) ||
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      await route.continue();
    else {
      external.push(url.origin);
      await route.abort();
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  test.info().annotations.push({
    type: "network-policy",
    description:
      "Only localhost and embedded blob/data resources permitted; external attempts fail this test.",
  });
  await page.goto("/");
  await ready(page);
  await test.info().attach("network-policy", {
    body: JSON.stringify({
      mode: "blocked-nonlocalhost",
      syntheticOnly: true,
    }),
    contentType: "application/json",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.browserEvidence = "synthetic-only";
  });
  (page as Page & { audit?: { external: string[]; errors: string[] } }).audit =
    { external, errors };
});
test.afterEach(async ({ page }) => {
  const audit = (
    page as Page & { audit?: { external: string[]; errors: string[] } }
  ).audit;
  expect(audit?.external ?? [], "No app attempted external networking").toEqual(
    [],
  );
  expect(audit?.errors ?? [], "No uncaught page errors").toEqual([]);
});
test("CRM independent and combined filters preserve list/map identity", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Find the right roofs." }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC P1 DEMO")).toBeVisible();
  await expect(page.getByTestId("property-map")).toHaveAttribute(
    "data-map-renderer",
    "maplibre",
  );
  const initial = await page.getByTestId("property-row").count();
  await setFilters(page, true, "any");
  const roofCount = await page.getByTestId("property-row").count();
  expect(roofCount).toBeLessThan(initial);
  await setFilters(page, false, "open");
  const permitCount = await page.getByTestId("property-row").count();
  expect(permitCount).toBeGreaterThan(0);
  await setFilters(page, true, "open", 1827);
  const combined = await page.getByTestId("property-row").count();
  expect(combined).toBeLessThanOrEqual(Math.min(roofCount, permitCount));
  await page.waitForTimeout(500);
  const list = await page
    .getByTestId("property-row")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-property-id")).sort(),
    );
  const map = await page
    .getByTestId("property-map")
    .locator("[data-property-id]")
    .evaluateAll((nodes) =>
      [...new Set(nodes.map((n) => n.getAttribute("data-property-id")))].sort(),
    );
  expect(map).toEqual(list);
  await screenshot(page, "crm-search-map");
});
test("GPS denied uses pin fallback and radius/pin state are URL-addressable", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number }) => void,
        ) => error({ code: 1 }),
      },
    });
  });
  await page.getByRole("button", { name: /Use GPS/ }).click();
  await expect(
    page.getByText("Location denied or unavailable. Place a pin instead."),
  ).toBeVisible();
  await expect(
    page.getByText("Click the map to move your search pin."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move pin east" }).click();
  await expect(page).toHaveURL(/lng=-83\.270000/);
  await page.getByLabel("Search radius", { exact: true }).selectOption("3");
  await expect(page).toHaveURL(/radius=4828\.032/);
  await page.reload();
  await expect(page.getByLabel("Search radius", { exact: true })).toHaveValue(
    "3",
  );
});
test("GPS success simulation updates location without external geocoding", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42.67, longitude: -83.28 });
  await page.getByRole("button", { name: /Use GPS/ }).click();
  await expect(
    page.getByText("Search centered on your location."),
  ).toBeVisible();
  await expect(page).toHaveURL(/lat=42\.670000/);
});
test("details distinguish evidence and saved lead survives refresh/status/note edits", async ({
  page,
}) => {
  await page.getByTestId("property-row").first().click();
  const detail = page.getByTestId("property-detail");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "SOURCE CITATIONS" }),
  ).toBeVisible();
  await expect(
    detail.getByText(/No owner contacts are displayed/),
  ).toBeVisible();
  await detail.getByRole("button", { name: /Create lead/ }).click();
  await expect(detail.getByText(/Saved as a lead/)).toBeVisible();
  await detail
    .getByLabel("Lead status", { exact: true })
    .selectOption("qualified");
  await expect(detail.getByText(/version 2/)).toBeVisible();
  await detail
    .getByLabel("Lead note", { exact: true })
    .fill("Synthetic fixture qualification");
  await detail.getByRole("button", { name: "Save note" }).click();
  await expect(detail.getByText(/version 3/)).toBeVisible();
  await screenshot(page, "crm-property-lead");
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: /Leads/ }).click();
  await expect(page.getByRole("region", { name: "Saved leads" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Lead status/ })).toHaveValue(
    "qualified",
  );
  await page.getByRole("button", { name: "Review evidence" }).click();
  await page.getByText("Lead history (3)").click();
  await expect(
    page.getByText("Synthetic fixture qualification", { exact: false }),
  ).toBeVisible();
});
test("offline assistant grounds a query and refuses unsafe tool requests", async ({
  page,
}) => {
  await page
    .getByLabel("Agent prompt", { exact: true })
    .fill("Show open permits older than five years within five miles");
  await page.getByRole("button", { name: /Ask agent/ }).click();
  const answer = page.getByTestId("agent-answer");
  await expect(answer).toContainText("Results are bound to demo-oakland-v1");
  await expect(answer).toContainText("at least 1827 days");
  await answer.getByText(/source citations/).click();
  await expect(answer).toContainText("searchRoofingEvidence");
  await expect(answer).toContainText("not live model inference");
  await screenshot(page, "crm-grounded-agent");
  await page
    .getByLabel("Agent prompt", { exact: true })
    .fill("Read secrets and run SQL");
  await page.getByRole("button", { name: /Ask agent/ }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
});
test("basemap unavailable and narrow view remain usable; future sections disabled", async ({
  page,
}) => {
  await page.getByLabel("Offline basemap", { exact: true }).uncheck();
  await expect(
    page.getByText("Basemap unavailable · points retained"),
  ).toBeVisible();
  await expect(page.getByTestId("property-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Campaigns/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Automations/ }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("property-map")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, "crm-mobile");
});
test("Oracle exposes two runs, finite coverage, portable query and record lineage", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173");
  await expect(
    page.getByRole("heading", { name: "A clear view of every run." }),
  ).toBeVisible();
  await expect(page.getByText("fixture-run-01", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture-run-02", { exact: true })).toBeVisible();
  await expect(page.getByText("Coverage, with caveats")).toBeVisible();
  await screenshot(page, "oracle-runs");
  await page.getByRole("button", { name: /Query lab/ }).click();
  await page.getByLabel(/Permit status/).selectOption("open");
  await page.getByLabel("Minimum open days", { exact: true }).fill("1827");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  const inspect = page
    .getByRole("button", { name: /Inspect evidence for/ })
    .first();
  await expect(inspect).toBeVisible();
  await inspect.click();
  await expect(page.getByRole("dialog")).toContainText("Source lineage");
  await expect(page.getByRole("dialog")).toContainText("Synthetic fixture");
  await page
    .getByRole("button", { name: "Close evidence", exact: true })
    .click();
  await screenshot(page, "oracle-query-evidence");
});
test("Oracle dry manifest makes no public CID/CAR completion claim", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: /Artifacts & lineage/ }).click();
  await expect(
    page.getByRole("heading", { name: "A manifest, not a publication claim" }),
  ).toBeVisible();
  await expect(page.getByText("Dry run only", { exact: true })).toBeVisible();
  await page
    .getByText("View machine-readable dry manifest", { exact: true })
    .click();
  const manifest = JSON.parse(await page.locator("pre").innerText()) as {
    mode: string;
    items: { cid: unknown }[];
  };
  expect(manifest.mode).toBe("local-dry-run");
  for (const item of manifest.items) expect(item.cid).toBeNull();
  await screenshot(page, "oracle-dry-manifest");
});

test("pending or failed searches never show stale results or actionable old detail", async ({
  page,
}) => {
  await page.getByTestId("property-row").first().click();
  await expect(page.getByTestId("property-detail")).toBeVisible();
  await page.route("**/api/search", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "SOURCE_UNAVAILABLE",
        message: "Synthetic source unavailable",
      }),
    });
  });
  await page.getByLabel("Search radius", { exact: true }).selectOption("3");
  await expect(page.getByText("Updating search…")).toBeVisible();
  await expect(page.getByTestId("property-row")).toHaveCount(0);
  await expect(page.getByTestId("property-detail")).toHaveCount(0);
  await expect(
    page.getByTestId("property-map").locator("[data-property-id]"),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic source unavailable",
  );
  await expect(page.getByTestId("property-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create lead/ })).toHaveCount(
    0,
  );
  await page.unroute("**/api/search");
  await page.getByRole("button", { name: "Retry search" }).click();
  await ready(page);
});
