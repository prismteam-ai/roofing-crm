import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  type QueryInput,
} from "../../packages/contracts/src/index";
import { propertyMatchesQuery } from "../../packages/contracts/src/query-predicates";
import {
  sourceProperty,
  SOURCE_SNAPSHOT,
  PRIVATE_PARTY_CANARY,
} from "../support/source-observations";
async function fixture(page: Page) {
  const row = sourceProperty(),
    queries: QueryInput[] = [],
    errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
      ["data:", "blob:"].includes(u.protocol)
    )
      return route.continue();
    external.push(u.origin);
    return route.abort();
  });
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    let body: unknown = {};
    if (u.pathname === "/api/health")
      body = {
        snapshotId: SOURCE_SNAPSHOT,
        contractVersion: CONTRACT_VERSION,
        mode: "synthetic",
        dataMode: "synthetic",
        digest: "synthetic",
        accessMode: "review-session",
        provider: "deterministic-offline",
      };
    else if (u.pathname === "/api/session")
      body = { session: { id: "synthetic-source-session" } };
    else if (u.pathname === "/api/map-config") body = { kind: "offline" };
    else if (u.pathname === "/api/leads") body = [];
    else if (u.pathname.startsWith("/api/properties/")) body = row;
    else if (u.pathname === "/api/search") {
      const q = route.request().postDataJSON() as QueryInput;
      queries.push(q);
      const rows = propertyMatchesQuery(row, q)
        ? [{ ...row, distanceMeters: 0 }]
        : [];
      body = {
        contractVersion: CONTRACT_VERSION,
        snapshotId: SOURCE_SNAPSHOT,
        queryHash: createHash("sha256").update(JSON.stringify(q)).digest("hex"),
        rows,
        total: rows.length,
        truncated: false,
        nextCursor: null,
        limitations: [
          "Synthetic source-closure browser fixture; not real source acceptance",
        ],
      };
    }
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/");
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  return { queries, errors, external };
}
test("qualified source controls persist independent meanings and protected detail retains verified dates and complete masks", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByLabel("Provider permit status", { exact: true })
    .selectOption("ISSUED");
  await page
    .getByLabel("Activity evidence", { exact: true })
    .selectOption("not_established");
  await page
    .getByLabel("Filter by permit age since issue", { exact: true })
    .check();
  await page
    .getByLabel("Filter by recorded deed index gap", { exact: true })
    .check();
  await expect
    .poll(() => state.queries.at(-1)?.minRecordedDeedGapYears)
    .toBe(10);
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByLabel("Provider permit status", { exact: true }),
  ).toHaveValue("ISSUED");
  await expect(
    page.getByLabel("Activity evidence", { exact: true }),
  ).toHaveValue("not_established");
  await expect(
    page.getByLabel("Minimum age since issue days", { exact: true }),
  ).toHaveValue("1827");
  await expect(
    page.getByLabel("Recorded deed gap years", { exact: true }),
  ).toHaveValue("10");
  expect(state.queries.at(-1)?.minOpenDays).toBe(0);
  expect(state.queries.at(-1)?.minOwnershipYears).toBeUndefined();
  await page.getByTestId("property-row").first().click();
  const provider = page.locator(
    '[data-private-evidence="provider-permit-observations"]',
  );
  await expect(provider).toContainText(PRIVATE_PARTY_CANARY);
  await expect(provider).toContainText(
    "current active/open work is not established",
  );
  await expect(provider).toContainText(
    "not continuous open duration or roof age",
  );
  const deed = page.locator('[data-private-evidence="recorded-deed-index"]');
  await expect(deed).toContainText("source verified through 2026-10-19");
  await expect(deed).toContainText("retrospectively qualified");
  await expect(deed).toContainText("Prior parcel lineage was not reviewed");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
});
test("a documented positive deed window and an empty active cohort do not broaden other source predicates", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByLabel("Filter by recorded deed index gap", { exact: true })
    .check();
  await page.getByLabel("Recorded deed gap years", { exact: true }).fill("20");
  await expect(
    page.getByRole("heading", { name: "No matches in this search" }),
  ).toBeVisible();
  await page.getByLabel("Recorded deed gap years", { exact: true }).fill("10");
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  await page
    .getByLabel("Activity evidence", { exact: true })
    .selectOption("provider_reported_active");
  await expect(
    page.getByRole("heading", { name: "No matches in this search" }),
  ).toBeVisible();
  expect(state.queries.at(-1)).toMatchObject({
    permitActivityClaim: "provider_reported_active",
    minRecordedDeedGapYears: 10,
    minOpenDays: 0,
  });
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
});
