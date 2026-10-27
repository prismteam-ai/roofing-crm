import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type {
  QueryInput,
  SearchResponse,
} from "../../packages/contracts/src/index";
type Audit = {
  external: string[];
  errors: string[];
  search?: { query: QueryInput; result: SearchResponse };
};
const audit = (page: Page) => (page as Page & { audit?: Audit }).audit;
const evidence = process.env.PRISM_BROWSER_EVIDENCE_DIR ?? "test-results";
async function screenshot(page: Page, name: string) {
  assertPredicates(page);
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-query-hash",
    audit(page)!.search!.result.queryHash,
  );
  mkdirSync(evidence, { recursive: true });
  const health = (await (await page.request.get("/api/health")).json()) as {
    contractVersion: string;
    snapshotDigest?: string;
    digest?: string;
  };
  const state = await page.locator(".app-shell").evaluate((node) => ({
    snapshotId: node.getAttribute("data-snapshot-id"),
    queryHash: node.getAttribute("data-query-hash"),
    generation: node.getAttribute("data-query-generation"),
    mode: node.getAttribute("data-mode"),
  }));
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(file));
  }
  writeFileSync(
    path.join(evidence, name + ".json"),
    JSON.stringify(
      {
        ...state,
        contractVersion: health.contractVersion,
        snapshotDigest: health.snapshotDigest ?? health.digest,
        test: test.info().title,
        url: page.url(),
        query: audit(page)?.search?.query,
        head: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
          encoding: "utf8",
        }).trim(),
        workingFilesSha256: hash.digest("hex"),
        dirty:
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim().length > 0,
      },
      null,
      2,
    ),
  );
  await page.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: false,
  });
}
async function ready(page: Page) {
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-query-hash",
    /\S+/,
  );
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
  await expect.poll(() => audit(page)?.search?.query.permitStatus).toBe(permit);
  await expect
    .poll(() => audit(page)?.search?.query.minOpenDays ?? 0)
    .toBe(days);
  await expect
    .poll(() => audit(page)?.search?.query.roofMinAgeYears !== undefined)
    .toBe(roof);
  await ready(page);
  assertPredicates(page);
}
function assertPredicates(page: Page) {
  const search = audit(page)?.search;
  if (!search) throw new Error("Missing observed search response");
  const { query, result } = search;
  expect(result.snapshotId).toBe(query.snapshotId);
  expect(result.queryHash).not.toBe("");
  for (const row of result.rows) {
    expect(row.distanceMeters).toBeLessThanOrEqual(query.radiusMeters + 0.01);
    if (query.roofMinAgeYears !== undefined) {
      expect(row.roof.ageYears).not.toBeNull();
      expect(row.roof.ageYears!).toBeGreaterThanOrEqual(query.roofMinAgeYears);
    }
    if (query.permitStatus && query.permitStatus !== "any")
      expect(
        row.permits.some(
          (p) => p.kind !== "other" && p.status === query.permitStatus,
        ),
      ).toBe(true);
    if (query.minOpenDays) {
      const days = row.permits
        .filter((p) => p.status === "open" && p.kind !== "other" && p.openedAt)
        .map((p) =>
          Math.floor(
            (Date.parse(row.roof.asOf) - Date.parse(p.openedAt!)) / 86400000,
          ),
        );
      expect(days.some((d) => d >= query.minOpenDays!)).toBe(true);
    }
    if (query.ownerRegion && query.ownerRegion !== "any")
      expect(row.ownership.ownerRegion).toBe(query.ownerRegion);
    if (query.minOwnershipYears !== undefined) {
      expect(row.ownership.lastTransferDate).not.toBeNull();
      expect(
        (Date.parse(row.roof.asOf) -
          Date.parse(row.ownership.lastTransferDate!)) /
          (365.25 * 86400000),
      ).toBeGreaterThanOrEqual(query.minOwnershipYears);
    }
  }
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
  (page as Page & { audit?: Audit }).audit = { external, errors };
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/search") && response.ok()) {
      const request = response.request().postDataJSON() as QueryInput;
      const result = (await response.json()) as SearchResponse;
      const a = audit(page);
      if (a) a.search = { query: request, result };
    }
  });
  await page.goto("/");
  await ready(page);
  await test.info().attach("network-policy", {
    body: JSON.stringify({
      networkMode: "blocked-nonlocalhost",
      dataMode: process.env.PRISM_TEST_MODE ?? "synthetic",
    }),
    contentType: "application/json",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.browserEvidence =
      document.querySelector(".app-shell")?.getAttribute("data-mode") ??
      "unknown";
  });
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
  const health = (await (await page.request.get("/api/health")).json()) as {
    snapshotId: string;
    mode: string;
  };
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-snapshot-id",
    health.snapshotId,
  );
  await expect(
    page.getByText(
      health.mode === "synthetic" ? "SYNTHETIC DEMO" : "REAL PUBLIC EVIDENCE",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId("property-map")).toHaveAttribute(
    "data-map-renderer",
    "maplibre",
  );
  const initialRows = audit(page)!.search!.result.rows;
  if (health.mode === "real") {
    const unknownIndex = initialRows.findIndex(
      (property) =>
        property.permits.length === 0 &&
        property.provenance.some((source) => source.kind !== "synthetic"),
    );
    expect(
      unknownIndex,
      "Public real records retain unknown permit evidence",
    ).toBeGreaterThanOrEqual(0);
    const card = page.getByTestId("property-row").nth(unknownIndex);
    await expect(card.getByTestId("known-open-permits")).toHaveText("Unknown");
    await expect(card).toContainText("Known open permits");
    await card.click();
    await expect(page.getByTestId("permit-evidence-summary")).toContainText(
      "Unknown / not sourced",
    );
    await expect(page.getByTestId("permit-evidence-summary")).toContainText(
      "does not prove permit absence",
    );
    await page
      .getByRole("button", { name: "Close property detail", exact: true })
      .click();
  } else {
    for (let index = 0; index < initialRows.length; index++) {
      const expected = initialRows[index].permits.filter(
        (permit) => permit.status === "open" && permit.kind !== "other",
      ).length;
      await expect(
        page
          .getByTestId("property-row")
          .nth(index)
          .getByTestId("known-open-permits"),
      ).toHaveText(String(expected));
    }
    const emptyIndex = initialRows.findIndex(
      (property) => property.permits.length === 0,
    );
    expect(
      emptyIndex,
      "Declared fixture includes an explicit empty permit array",
    ).toBeGreaterThanOrEqual(0);
    await page.getByTestId("property-row").nth(emptyIndex).click();
    await expect(page.getByTestId("permit-evidence-summary")).toContainText(
      "Known open permits: 0",
    );
    await expect(page.getByTestId("permit-evidence-summary")).toContainText(
      "Declared synthetic fixture",
    );
    await page
      .getByRole("button", { name: "Close property detail", exact: true })
      .click();
  }
  await screenshot(page, "crm-unfiltered-map");
  const initial = await page.getByTestId("property-row").count();
  await setFilters(page, true, "any");
  const roofCount = await page.getByTestId("property-row").count();
  expect(roofCount).toBeLessThanOrEqual(initial);
  await setFilters(page, false, "open");
  const permitCount = await page.getByTestId("property-row").count();
  expect(permitCount).toBeLessThanOrEqual(initial);
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
  const mapRegion = page.getByTestId("property-map");
  const canvas = mapRegion.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const mapBounds = await mapRegion.boundingBox();
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds!.width).toBeGreaterThan(mapBounds!.width * 0.9);
  expect(canvasBounds!.height).toBeGreaterThan(mapBounds!.height * 0.9);
  const propertyMarkers = mapRegion.locator("[data-property-id]");
  for (let i = 0; i < (await propertyMarkers.count()); i++) {
    await expect(propertyMarkers.nth(i)).toBeInViewport();
    const markerBounds = await propertyMarkers.nth(i).boundingBox();
    expect(markerBounds!.x).toBeGreaterThanOrEqual(mapBounds!.x);
    expect(markerBounds!.y).toBeGreaterThanOrEqual(mapBounds!.y);
    expect(markerBounds!.x + markerBounds!.width).toBeLessThanOrEqual(
      mapBounds!.x + mapBounds!.width,
    );
    expect(markerBounds!.y + markerBounds!.height).toBeLessThanOrEqual(
      mapBounds!.y + mapBounds!.height,
    );
  }
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
  await expect(answer).toContainText(
    `Results are bound to ${audit(page)?.search?.query.snapshotId}`,
  );
  await expect(answer).toContainText("at least 1827 days");
  await answer.getByText(/source citations/).click();
  await expect(answer).toContainText("searchRoofingEvidence");
  await expect(answer).toContainText("no model inference");
  await expect(answer.getByTestId("agent-permit-evidence")).toContainText(
    "Zero matches do not prove permit absence",
  );
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
  await page.getByLabel("Map context", { exact: true }).uncheck();
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

test("owner evidence filters are independent, URL-bound and never infer unavailable tenure", async ({
  page,
}) => {
  const health = (await (await page.request.get("/api/health")).json()) as {
    mode: string;
  };
  await page
    .getByLabel("Owner region", { exact: true })
    .selectOption("unknown");
  await expect
    .poll(() => audit(page)?.search?.query.ownerRegion)
    .toBe("unknown");
  await ready(page);
  assertPredicates(page);
  if (health.mode === "real") {
    await page.getByTestId("property-row").first().click();
    await expect(page.getByTestId("property-detail")).toBeVisible();
  }
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/search") &&
      r.request().method() === "POST" &&
      (r.request().postDataJSON() as QueryInput).minOwnershipYears === 10,
  );
  const tenure = page.getByLabel("Filter by ownership duration", {
    exact: true,
  });
  await tenure.focus();
  await page.keyboard.press("Space");
  const applied = await response;
  await expect(page).toHaveURL(/tenure=10/);
  if (health.mode === "real") {
    expect(applied.ok()).toBe(false);
    const failure = (await applied.json()) as { message: string };
    expect(failure.message).toContain("Ownership tenure is unknown");
    await expect(page.getByRole("alert")).toContainText(
      "Ownership tenure is unknown",
    );
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await expect(page.getByTestId("property-detail")).toHaveCount(0);
    await expect(
      page.getByTestId("property-map").locator("[data-property-id]"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Create lead/ })).toHaveCount(
      0,
    );
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-query-hash",
      "",
    );
  } else {
    expect(applied.ok()).toBe(true);
    await expect
      .poll(() => audit(page)?.search?.query.minOwnershipYears)
      .toBe(10);
    await ready(page);
    assertPredicates(page);
  }
  const recovery = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/search") &&
      r.ok() &&
      r.request().method() === "POST" &&
      (r.request().postDataJSON() as QueryInput).ownerRegion === "unknown" &&
      (r.request().postDataJSON() as QueryInput).minOwnershipYears ===
        undefined,
  );
  await tenure.uncheck();
  await recovery;
  await expect
    .poll(() => audit(page)?.search?.query.minOwnershipYears)
    .toBeUndefined();
  await ready(page);
  assertPredicates(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page).not.toHaveURL(/tenure=/);
});
