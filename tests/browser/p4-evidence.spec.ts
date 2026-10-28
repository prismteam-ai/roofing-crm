import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  PropertySchema,
  type QueryInput,
} from "../../packages/contracts/src/index";
const source = {
  sourceId: "synthetic-p4-ui",
  recordId: "SYN-P4-UI",
  observedAt: "2026-10-27T00:00:00Z",
  digest: "synthetic",
  kind: "synthetic",
};
const property = PropertySchema.parse({
  id: "SYN-P4-UI",
  nativeId: "SYN-P4-UI",
  parcelIds: [],
  address: "Synthetic P4 evidence property",
  coordinates: { lat: 42.66, lng: -83.29 },
  usage: "residential",
  roof: {
    ageYears: null,
    basis: "unknown",
    confidence: "unknown",
    asOf: "2026-10-27",
    caveats: ["Synthetic only; issuance does not establish roof age"],
  },
  permits: [
    {
      id: "SYN-PERMIT",
      permitNumber: "SYN-ISS-1",
      jurisdiction: "Synthetic jurisdiction",
      status: "unknown",
      kind: "roof_unspecified",
      issuedAt: "2010-01-01",
      statusBasis: "issued_only",
      reportedStatus: "ISSUED",
      statusObservedAt: "2026-10-27T00:00:00Z",
      openedAt: null,
      closedAt: null,
      proposedWorkScope: "Synthetic roofing work",
      contractor: {
        reportedName: "Synthetic business",
        verifiedCompanyId: null,
        license: null,
        rating: null,
        licenseEvidence: {
          identifier: "SYN-LIC",
          type: "Synthetic license",
          status: "Observed status",
          sourceUrl: "https://example.invalid/license",
          observedAt: "2026-10-27T00:00:00Z",
          matchBasis: "Synthetic business/address comparison",
          confidence: "medium",
        },
        ratingEvidence: {
          value: "A+",
          scale: "BBB",
          sourceUrl: "https://example.invalid/bbb",
          observedAt: "2026-10-27T00:00:00Z",
          matchConfidence: "low",
        },
      },
      provenance: [source],
    },
  ],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "partial",
    ownerRegion: "unknown",
    events: [
      {
        id: "SYN-SALE",
        kind: "reported_sale",
        date: "2010-01-01",
        provenance: [source],
      },
    ],
  },
  provenance: [source],
});
async function fixture(page: Page) {
  const external: string[] = [],
    errors: string[] = [],
    queries: QueryInput[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
      ["blob:", "data:"].includes(u.protocol)
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
        contractVersion: CONTRACT_VERSION,
        snapshotId: "synthetic-p4-ui",
        mode: "synthetic",
        dataMode: "synthetic",
        digest: "synthetic",
        accessMode: "review-session",
        provider: "deterministic-offline",
      };
    else if (u.pathname === "/api/session")
      body = { session: { id: "synthetic-p4-session" } };
    else if (u.pathname === "/api/map-config") body = { kind: "offline" };
    else if (u.pathname === "/api/search") {
      const q = route.request().postDataJSON() as QueryInput;
      queries.push(q);
      if (q.minOwnershipYears !== undefined)
        return route.fulfill({
          status: 400,
          json: {
            code: "UNSUPPORTED_TOOL",
            message: "Ownership tenure is unknown; it is not reported-sale age",
          },
        });
      body = {
        contractVersion: CONTRACT_VERSION,
        snapshotId: q.snapshotId,
        queryHash: createHash("sha256").update(JSON.stringify(q)).digest("hex"),
        rows: [{ ...property, distanceMeters: 0 }],
        total: 1,
        truncated: false,
        nextCursor: null,
        limitations: [
          "Synthetic controlled UI fixture; not backend acceptance",
        ],
      };
    } else if (u.pathname === "/api/leads") body = [];
    else if (u.pathname.startsWith("/api/properties/")) body = property;
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/");
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  return { external, errors, queries };
}
test("sale-age control persists its own predicate and legacy tenure links stay distinct", async ({
  page,
}) => {
  const state = await fixture(page);
  await expect(
    page.getByLabel("Filter by ownership duration", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Filter by last reported sale age", { exact: true })
    .check();
  await expect(page).toHaveURL(/reportedSaleYears=10/);
  await expect
    .poll(() => state.queries.at(-1)?.minReportedSaleAgeYears)
    .toBe(10);
  expect(state.queries.at(-1)?.minOwnershipYears).toBeUndefined();
  await expect(page.getByTestId("reported-sale-scope")).toContainText(
    "not ownership tenure",
  );
  await page.reload();
  await expect(
    page.getByLabel("Filter by last reported sale age", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Reported sale older than years", { exact: true }),
  ).toHaveValue("10");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.PRISM_BROWSER_EVIDENCE_DIR)
    await page.screenshot({
      path: `${process.env.PRISM_BROWSER_EVIDENCE_DIR}/p4-reported-sale-filter.png`,
      fullPage: true,
    });
  await page.goto("/?tenure=10");
  await expect(
    page.getByRole("button", {
      name: "Clear unsupported tenure filter",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Filter by last reported sale age", { exact: true }),
  ).not.toBeChecked();
  await expect(page).not.toHaveURL(/reportedSaleYears=/);
  await page
    .getByRole("button", {
      name: "Clear unsupported tenure filter",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  await expect(page).not.toHaveURL(/tenure=/);
  expect(state.external).toEqual([]);
  expect(state.errors).toEqual([]);
});
test("issued permit and observed license/BBB details remain sourced and do not invent open duration or roof age", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByTestId("property-row").click();
  const detail = page.getByTestId("property-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("issued · open status unknown");
  await expect(detail).toContainText("Open duration: unknown");
  await expect(detail).toContainText("opening not established from issuance");
  await expect(detail).toContainText(
    "does not establish roof installation or replacement",
  );
  await expect(detail).toContainText("License observation: SYN-LIC");
  await expect(detail).toContainText("match medium confidence");
  await expect(detail).toContainText("BBB observed rating: A+");
  await expect(detail).toContainText("match low confidence");
  await expect(
    detail.getByRole("link", { name: "License source ↗", exact: true }),
  ).toHaveAttribute("href", "https://example.invalid/license");
  await expect(detail.getByTestId("permit-evidence-summary")).toContainText(
    "Known open permits: 0",
  );
  if (process.env.PRISM_BROWSER_EVIDENCE_DIR)
    await page.screenshot({
      path: `${process.env.PRISM_BROWSER_EVIDENCE_DIR}/p4-sourced-permit-detail.png`,
      fullPage: true,
    });
  expect(state.external).toEqual([]);
  expect(state.errors).toEqual([]);
});
