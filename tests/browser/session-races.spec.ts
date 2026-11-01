import { test, expect, type Page, type Route } from "@playwright/test";
import {
  CONTRACT_VERSION,
  PropertySchema,
  type Lead,
} from "../../packages/contracts/src/index";
const source = {
  sourceId: "synthetic-session-review",
  recordId: "SYN-SESSION-A",
  observedAt: "2026-10-27T00:00:00.000Z",
  digest: "synthetic-only",
  kind: "synthetic" as const,
};
const property = (id: string) =>
  PropertySchema.parse({
    id,
    nativeId: id,
    address: `Synthetic session property ${id}`,
    parcelIds: [],
    usage: "unknown",
    coordinates: { lat: 42.66, lng: -83.29 },
    roof: {
      ageYears: null,
      basis: "unknown",
      confidence: "unknown",
      asOf: "2026-10-27",
      caveats: ["Synthetic regression only"],
    },
    permits: [],
    ownership: {
      lastTransferDate: null,
      historyCoverage: "unknown",
      ownerRegion: "unknown",
    },
    provenance: [source],
  });
const rows = [property("SYN-SESSION-A"), property("SYN-SESSION-B")];
const snapshotId = "demo-oakland-v1";
const oldLead: Lead = {
  id: "lead-synthetic-session",
  sessionId: "review-A",
  propertyId: rows[0].id,
  snapshotId,
  status: "new",
  version: 1,
  events: [{ kind: "created", at: "2026-10-27T00:00:00.000Z" }],
};
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
async function fixture(page: Page) {
  const external: string[] = [],
    errors: string[] = [];
  let sessionId: string | undefined = "review-A";
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      ["blob:", "data:"].includes(url.protocol)
    )
      return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    let body: unknown;
    if (url.pathname === "/api/health")
      body = {
        contractVersion: CONTRACT_VERSION,
        snapshotId,
        mode: "synthetic",
        digest: "synthetic-digest",
        accessMode: "review-session",
        provider: "deterministic-offline",
      };
    else if (url.pathname === "/api/session") {
      if (method === "DELETE") {
        sessionId = undefined;
        body = { session: null };
      } else if (method === "POST") {
        sessionId = "review-B";
        body = { session: { id: sessionId } };
      } else body = { session: { id: sessionId } };
    } else if (url.pathname === "/api/search")
      body = {
        contractVersion: CONTRACT_VERSION,
        snapshotId,
        queryHash: "a".repeat(64),
        rows: rows.map((row) => ({ ...row, distanceMeters: 0 })),
        total: 2,
        truncated: false,
        nextCursor: null,
        limitations: ["Synthetic regression only"],
      };
    else if (url.pathname === "/api/leads")
      body = sessionId === "review-A" ? [oldLead] : [];
    else if (url.pathname.startsWith("/api/properties/"))
      body = rows.find(
        (row) => row.id === decodeURIComponent(url.pathname.split("/").at(-1)!),
      );
    else body = {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("property-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Leads/ })).toContainText("1");
  return { external, errors };
}
async function loginAgain(page: Page) {
  await page
    .getByLabel("Review access code", { exact: true })
    .fill("synthetic-only-entry");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(page.getByTestId("property-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Leads/ })).toContainText("0");
}
async function heldDetail(page: Page, status = 200) {
  const gate = barrier();
  let held = false,
    delivered = false;
  await page.route("**/api/properties/**", async (route) => {
    held = true;
    await gate.promise;
    await route.fulfill({
      status,
      json:
        status === 200 ? rows[0] : { message: "Old synthetic session expired" },
    });
    delivered = true;
  });
  await page.getByRole("button", { name: /Leads/ }).click();
  await page
    .getByRole("button", { name: "Review evidence", exact: true })
    .click();
  await expect.poll(() => held).toBe(true);
  return { release: gate.release, delivered: () => delivered };
}
function audit(result: { external: string[]; errors: string[] }) {
  expect(result.external).toEqual([]);
  expect(result.errors).toEqual([]);
}
test("a delayed saved-lead detail cannot reopen after sign-out", async ({
  page,
}) => {
  const state = await fixture(page),
    detail = await heldDetail(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Open the review workspace",
      exact: true,
    }),
  ).toBeVisible();
  detail.release();
  await expect.poll(detail.delivered).toBe(true);
  await page.waitForTimeout(100);
  await expect(page.getByTestId("property-detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Leads/ })).toContainText("0");
  audit(state);
});
test("expiry and a new session reject a delayed lead refresh from the previous namespace", async ({
  page,
}) => {
  const state = await fixture(page),
    gate = barrier();
  let held = false,
    delivered = false;
  await page.route("**/api/leads?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("sessionId") !==
      "review-A"
    )
      return route.fallback();
    held = true;
    await gate.promise;
    await route.fulfill({ status: 200, json: [oldLead] });
    delivered = true;
  });
  await page.getByRole("button", { name: /Leads/ }).click();
  await expect.poll(() => held).toBe(true);
  await page.route("**/api/properties/**", (route) =>
    route.fulfill({
      status: 401,
      json: { message: "Synthetic session expired" },
    }),
  );
  await page
    .getByRole("button", { name: "Review evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Open the review workspace",
      exact: true,
    }),
  ).toBeVisible();
  await loginAgain(page);
  gate.release();
  await expect.poll(() => delivered).toBe(true);
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: /Leads/ }).click();
  await expect(page.getByRole("region", { name: "Saved leads" })).toContainText(
    "Your next lead starts on the map",
  );
  await expect(page.getByRole("button", { name: /Leads/ })).toContainText("0");
  audit(state);
});
test("a late saved detail cannot replace the latest selected property", async ({
  page,
}) => {
  const state = await fixture(page),
    detail = await heldDetail(page);
  await page.getByRole("button", { name: /Opportunities/ }).click();
  await page.getByTestId("property-row").nth(1).click();
  await expect(page.getByTestId("property-detail")).toContainText(rows[1].id);
  detail.release();
  await expect.poll(detail.delivered).toBe(true);
  await page.waitForTimeout(100);
  await expect(page.getByTestId("property-detail")).toContainText(rows[1].id);
  audit(state);
});
test("Escape cancels an outstanding detail intent before its response exists", async ({
  page,
}) => {
  const state = await fixture(page),
    detail = await heldDetail(page);
  await page.keyboard.press("Escape");
  detail.release();
  await expect.poll(detail.delivered).toBe(true);
  await page.waitForTimeout(100);
  await expect(page.getByTestId("property-detail")).toHaveCount(0);
  audit(state);
});
test("an old session agent completion cannot populate the next session", async ({
  page,
}) => {
  const state = await fixture(page),
    gate = barrier();
  let held = false,
    delivered = false;
  await page.route("**/api/agent", async (route: Route) => {
    held = true;
    await gate.promise;
    await route.fulfill({
      status: 200,
      json: {
        mode: "deterministic-offline",
        answer: "OLD SYNTHETIC SESSION ANSWER",
        query: route.request().postDataJSON().query,
        results: [rows[0]],
        citations: ["synthetic:SYN-SESSION-A"],
        caveats: [],
        toolTrace: [],
      },
    });
    delivered = true;
  });
  await page.getByRole("button", { name: /Ask agent/ }).click();
  await expect.poll(() => held).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Open the review workspace",
      exact: true,
    }),
  ).toBeVisible();
  await loginAgain(page);
  gate.release();
  await expect.poll(() => delivered).toBe(true);
  await page.waitForTimeout(100);
  await expect(page.getByTestId("agent-answer")).toHaveCount(0);
  audit(state);
});

test("a late401 from an old session cannot expire the newly opened session", async ({
  page,
}) => {
  const state = await fixture(page),
    detail = await heldDetail(page, 401);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Open the review workspace",
      exact: true,
    }),
  ).toBeVisible();
  await loginAgain(page);
  detail.release();
  await expect.poll(detail.delivered).toBe(true);
  await page.waitForTimeout(100);
  await expect(page.getByTestId("property-row")).toHaveCount(2);
  await expect(
    page.getByRole("heading", {
      name: "Open the review workspace",
      exact: true,
    }),
  ).toHaveCount(0);
  audit(state);
});
