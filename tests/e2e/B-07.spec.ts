// B-07 (create, manage and browse CRM leads): Playwright cases for testplans/B-07-test-cases.md
// §7, one test per row, titled exactly as the matrix. Runs only against the hosted RUNTIME_URL
// (playwright.config.ts enforces it; localhost is never evidence) with workers=1.
//
// The cases share state on purpose, in file order: TC-001 creates the lead for P_5_52, TC-003 to
// TC-010 work on it, TC-007 creates P_AGE48, TC-011 adds P_5_89. A lead cannot be created twice
// (that is what AC-2 tests), so `beforeAll` first deletes the four test leads from `crm-leads`
// (tests/e2e/lib/leads-cleanup.ts, GAP-3) and `afterAll` does it again only when CRM_E2E_CLEANUP=1.
// That helper needs AWS credentials in the default chain and AWS_REGION set to the table's region
// (CI: vars.AWS_REGION; locally export it alongside the profile); nothing here prints or stores them.
//
// Request identifiers are read from the live index (`property.get`), never typed by hand. The
// tRPC calls made directly (property.get, leads.list, leads.create) use the app's own call shape
// from packages/api-client (same-origin /api/trpc, no transformer, `Authorization: Bearer` with
// the Cognito ID token that the signed-in page keeps in localStorage `crm.session`).
//
// TC-014/TC-015 use a fixture lead for request identifier B07STALE, created by a direct tRPC POST
// with a real published manifest that is not the served one; its property is absent from the
// served run, which is exactly AC-5's "not in the current run" (no second published run needed).
//
// Not covered live, by design (see the fixme title): TC-NF-03 (GAP-1, needs 50+ leads).
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "./lib/atlas-tokens.js";
import { requirePassword } from "./lib/auth.js";
import { EVIDENCE_IMG_DIR } from "./lib/evidence.js";
import {
  LEAD_FIXTURES,
  LEADS_AREA,
  OLD_MANIFEST_CID,
  leadTitle,
  FIXTURES_MANIFEST_CID,
  STALE_REQUEST_ID,
} from "./lib/run-fixtures.js";
import {
  awsCredentialsAvailable,
  createLeadsCleanup,
  type LeadsCleanup,
} from "./lib/leads-cleanup.js";

/** A saved note shows once the save and the page's refetch complete. */
const NOTE_VISIBLE_MS = 15_000;
/** A radius filter makes the lead list wait for the index, which can take several seconds. */
const FILTERED_LIST_MS = 30_000;

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).
const CLEANUP_AFTER = process.env.CRM_E2E_CLEANUP === "1";

// Real Austin properties of Run 2 (tests/e2e/lib/run-fixtures.ts says how each was read). The old
// names are kept so the case bodies read as before: P_5_52 = the property with an open permit,
// P_AGE48 = roof age only (no open permit), P_5_89 = the third.
const P_5_52 = LEAD_FIXTURES.openPermit.cid;
const P_AGE48 = LEAD_FIXTURES.roofOnly.cid;
const P_5_89 = LEAD_FIXTURES.third.cid;
const MANIFEST_CID = FIXTURES_MANIFEST_CID;
const FIXTURE_IDS: Record<string, string> = {
  [P_5_52]: LEAD_FIXTURES.openPermit.requestIdentifier,
  [P_AGE48]: LEAD_FIXTURES.roofOnly.requestIdentifier,
  [P_5_89]: LEAD_FIXTURES.third.requestIdentifier,
};

/** The lead page shows the roof-age basis in words (apps/web/src/format/labels.ts). */
const BASIS_LABEL: Record<string, string> = {
  permit: "Last reroof permit",
  new_construction: "New construction (year built)",
  built_year: "Year built (no reroof permit found)",
  unknown: "Basis unknown",
};
const TRAVIS_FIPS = "48453";
const AREA_CENTRE = LEADS_AREA;
/** Prefix for every note this suite writes, so one run can be told apart from another. */
const RUN_TAG = `B07-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-`;

const leadKeyFor = (requestIdentifier: string): string =>
  `${TRAVIS_FIPS}:tcad:${requestIdentifier}`;
const leadPath = (requestIdentifier: string): string =>
  `/leads/${encodeURIComponent(leadKeyFor(requestIdentifier))}`;

interface Facts {
  readonly cid: string;
  readonly requestIdentifier: string;
  readonly leadKey: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly roofAgeYears: number | null;
  readonly roofAgeBasis: string;
  readonly sourceManifestCid: string;
  readonly hasOpenPermit: boolean;
  /** The first open permit, which the lead snapshot holds (AC-1). */
  readonly openPermit: { readonly permitNumber: string; readonly openDays: number | null } | null;
}

/** Property facts read from the index in `beforeAll`, keyed by property CID. */
const facts = new Map<string, Facts>();
let cleanup: LeadsCleanup | undefined;

function factsOf(cid: string): Facts {
  const found = facts.get(cid);
  if (found === undefined) throw new Error(`no index facts loaded for ${cid}`);
  return found;
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(SEEDED_USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const raw = await page.evaluate(() => localStorage.getItem("crm.session"));
  const idToken = raw === null ? undefined : (JSON.parse(raw) as { idToken?: string }).idToken;
  if (idToken === undefined) throw new Error("no Cognito session in localStorage");
  return { Authorization: `Bearer ${idToken}` };
}

/** `GET /api/trpc/{procedure}?input=...`, the unbatched query shape the tRPC server also accepts. */
async function trpcQuery<T>(page: Page, procedure: string, input: unknown): Promise<T> {
  const response = await page.request.get(
    `/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
    { headers: await authHeaders(page) },
  );
  expect(response.ok(), `${procedure} HTTP ${response.status()}`).toBe(true);
  return ((await response.json()) as { result: { data: T } }).result.data;
}

async function loadFacts(page: Page, cid: string): Promise<Facts> {
  const data = await trpcQuery<{
    property: {
      requestIdentifier: string;
      latitude: number | null;
      longitude: number | null;
      roofAgeYears: number | null;
      roofAgeBasis: string;
      sourceManifestCid: string;
    } | null;
    permits: { statusClass: string | null; permitNumber: string | null; openDays: number | null }[];
  }>(page, "property.get", { propertyCid: cid });
  const p = data.property;
  const expectedId = FIXTURE_IDS[cid];
  if (p !== null && expectedId !== undefined && p.requestIdentifier !== expectedId) {
    throw new Error(
      `fixture drift: ${cid} now has request identifier ${p.requestIdentifier}, expected ${expectedId} (re-read tests/e2e/lib/run-fixtures.ts)`,
    );
  }
  const open = data.permits.find((permit) => permit.statusClass === "open");
  if (p === null || p.latitude === null || p.longitude === null) {
    throw new Error(`property ${cid} is not in the served run or has no location`);
  }
  return {
    cid,
    requestIdentifier: p.requestIdentifier,
    leadKey: leadKeyFor(p.requestIdentifier),
    latitude: p.latitude,
    longitude: p.longitude,
    roofAgeYears: p.roofAgeYears,
    roofAgeBasis: p.roofAgeBasis,
    sourceManifestCid: p.sourceManifestCid,
    // The Open filter means open or stalled (a stalled permit is open and not progressing).
    hasOpenPermit: data.permits.some(
      (permit) => permit.statusClass === "open" || permit.statusClass === "stalled",
    ),
    openPermit:
      open?.permitNumber == null
        ? null
        : { permitNumber: open.permitNumber, openDays: open.openDays },
  };
}

/** The `leads.create` input exactly as LeadCreateAction.toCreateInput builds it. */
function createInput(f: Facts): Record<string, unknown> {
  return {
    fips: TRAVIS_FIPS,
    requestIdentifier: f.requestIdentifier,
    address: leadTitle(f.requestIdentifier),
    lat: f.latitude,
    lon: f.longitude,
    signals: {
      ...(f.roofAgeYears === null ? {} : { roofAgeYears: f.roofAgeYears }),
      roofAgeBasis: f.roofAgeBasis,
      ...(f.openPermit === null ? {} : { openPermitId: f.openPermit.permitNumber }),
      ...(f.openPermit?.openDays == null ? {} : { openDays: f.openPermit.openDays }),
    },
    sourceManifestCid: f.sourceManifestCid,
    createdFrom: "map",
  };
}

/** The AC-5 fixture: a lead captured under an older manifest whose property is not in the served run. */
async function createStaleLead(page: Page): Promise<void> {
  const f = factsOf(P_5_52);
  const response = await page.request.post("/api/trpc/leads.create", {
    headers: await authHeaders(page),
    data: {
      fips: TRAVIS_FIPS,
      requestIdentifier: STALE_REQUEST_ID,
      address: `TCAD ${STALE_REQUEST_ID}`,
      lat: f.latitude,
      lon: f.longitude,
      signals: { roofAgeYears: 40 },
      sourceManifestCid: OLD_MANIFEST_CID,
      createdFrom: "map",
    },
  });
  // 409 = left behind by a previous run (cleanup is opt-in); the fixture is the same either way.
  expect([200, 409], `leads.create HTTP ${response.status()}`).toContain(response.status());
}

async function listLeadKeys(page: Page): Promise<string[]> {
  const data = await trpcQuery<{ leads: { leadKey: string }[] }>(page, "leads.list", {
    limit: 100,
  });
  return data.leads.map((lead) => lead.leadKey);
}

/** The SAVED notes only. The "Notes" region also contains the textarea, and React renders the
 *  text typed into it as content, so asserting on the whole region passes before anything is
 *  saved (found live: the test then reloaded mid-save and flaked). */
const savedNotes = (page: Page): Locator =>
  page.getByRole("region", { name: "Notes" }).locator("ol");

/** Opens the Map drawer for a property through the `sel` deep link (no pin-drop needed). */
async function openDrawer(page: Page, cid: string): Promise<Locator> {
  await page.goto(`/?sel=${cid}`); // the Map is the app's index route, not /map
  const drawer = page.locator(`aside[role="dialog"][data-property-cid="${cid}"]`);
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Taps "Create lead" in the drawer and returns the resulting status line. */
async function createFromDrawer(drawer: Locator): Promise<Locator> {
  await drawer.getByRole("button", { name: "Create lead", exact: true }).click();
  const state = drawer.getByRole("status");
  await expect(state).toBeVisible();
  return state;
}

/** The drawer checks Leads first: for a property that is already a lead it shows the pill
 *  "Already a lead" (true here). When the lookup is unavailable the normal "Create lead" button
 *  shows instead (false), and the server's refusal still reads "Already a lead"; that fallback is
 *  recorded as an annotation so a build without the lookup is visible in the report, not hidden. */
async function showsExistingLead(drawer: Locator): Promise<boolean> {
  const pill = drawer.getByText(/^Already a lead/).first();
  const button = drawer.getByRole("button", { name: "Create lead", exact: true });
  await expect(pill.or(button)).toBeVisible({ timeout: 15_000 });
  if ((await pill.count()) > 0) return true;
  test.info().annotations.push({
    type: "presence-lookup-unavailable",
    description:
      "The drawer offered Create lead for an existing lead: the lead lookup did not answer or this build has none. The server's refusal is asserted instead.",
  });
  return false;
}

const leadCount = (page: Page): Locator => page.getByText(/^\d+ leads?$/);
/** Below 600 px the lead filters sit in a sheet behind "Filters"; from 600 px they are inline. */
async function openLeadFilters(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}
async function setLeadArea(page: Page, lat: number, lng: number, miles: string): Promise<void> {
  await page.getByLabel("Area").selectOption("point");
  await page.getByLabel("Center latitude").fill(String(lat));
  await page.getByLabel("Center longitude").fill(String(lng));
  await page.getByLabel("Radius, mi").selectOption(miles);
}
const leadLink = (page: Page, f: Facts): Locator =>
  // A lead keeps the title it was created with: the street address, or "TCAD {id}" for a lead an
  // earlier run created before the address was published. Either names the same lead.
  page.getByRole("link", {
    name: new RegExp(
      `(${leadTitle(f.requestIdentifier).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|TCAD ${f.requestIdentifier})`,
    ),
  });

/** Screenshot to docs/evidence/img/B-07-TC-{nnn}-{step}.png, attached to the report. */
async function shot(page: Page, tc: string, step: string): Promise<void> {
  const name = `B-07-TC-${tc}-${step.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  mkdirSync(EVIDENCE_IMG_DIR, { recursive: true });
  const body = await page.screenshot({ path: resolve(EVIDENCE_IMG_DIR, name) });
  await test.info().attach(name, { body, contentType: "image/png" });
}

/** Great-circle distance in miles (haversine, Earth radius 3,958.8 mi: test plan § 3). */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

test.describe("B-07 leads", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() => {
    requirePassword();
  });

  test.beforeAll(async ({ browser }, testInfo) => {
    if (!SEEDED_PASSWORD) return;
    // CI's AWS credentials are the `crm-ci` IAM user's key (the organization policy blocks the
    // GitHub OIDC role; infra/lib/crm-ci-user.ts), from the repository secrets
    // CRM_CI_AWS_ACCESS_KEY_ID / CRM_CI_AWS_SECRET_ACCESS_KEY. Without them the four test leads
    // cannot be cleared, so a second run would be refused as a duplicate: skip the whole file
    // there, loudly. Locally, missing or expired credentials must FAIL, never skip, so this
    // applies on CI only.
    test.skip(
      process.env.CI !== undefined && !(await awsCredentialsAvailable()),
      "B-07 needs AWS credentials to clear its test leads; the CRM_CI_AWS_* repository secrets are not set. Proven by the local hosted run (docs/evidence/B-07.md).",
    );
    const baseURL = testInfo.project.use.baseURL;
    const page = await browser.newPage(baseURL === undefined ? {} : { baseURL });
    try {
      await signIn(page, SEEDED_PASSWORD);
      for (const cid of [P_5_52, P_AGE48, P_5_89]) facts.set(cid, await loadFacts(page, cid));
    } finally {
      await page.close();
    }
    const keys = [
      ...[P_5_52, P_AGE48, P_5_89].map((cid) => factsOf(cid).leadKey),
      leadKeyFor(STALE_REQUEST_ID),
    ];
    cleanup = createLeadsCleanup(keys);
    await cleanup.deleteLeads(keys); // clean slate: reruns are otherwise refused by design
  });

  test.afterAll(async () => {
    if (cleanup === undefined) return;
    if (CLEANUP_AFTER) {
      await cleanup.deleteLeads(cleanup.allowed);
    } else {
      console.info(
        "B-07 cleanup skipped after the run (set CRM_E2E_CLEANUP=1 to delete test leads)",
      );
    }
  });

  test.beforeEach(async ({ page }) => {
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
  });

  // ---- Edge case: the list before anything has been created -------------------------------

  test("B-07-TC-016 empty list state", async ({ page }) => {
    await page.goto("/leads");
    const empty = page.getByText("No leads yet");
    const count = leadCount(page);
    await expect(empty.or(count)).toBeVisible();
    // The four test leads were just deleted; other leads of this user would make the state
    // legitimately non-empty, so say so instead of passing or failing on someone else's data.
    test.skip(await count.isVisible(), "this user already has leads beyond the test properties");
    await expect(empty).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await shot(page, "016", "empty-list");
  });

  // ---- AC-1: create ------------------------------------------------------------------------

  test("B-07-TC-001 create lead from property drawer", async ({ page }) => {
    const f = factsOf(P_5_52);
    const drawer = await openDrawer(page, P_5_52);
    await expect(drawer.locator('dd[data-field="roof_age_years"]')).toHaveText(
      `${f.roofAgeYears} yrs`,
    );
    const state = await createFromDrawer(drawer);
    await expect(state).toContainText("Lead created");
    await shot(page, "001", "created");

    await page.goto("/leads");
    const first = page.locator("li[data-lead-id]").first();
    await expect(first).toContainText(leadTitle(f.requestIdentifier));
    await expect(first).toContainText("New");
    await expect(leadLink(page, f)).toHaveCount(1);
    // The row shows "Created Oct 20, 09:14 UTC"; the exact (minute-truncated) stamp is the <time>
    // element's datetime attribute. It is within the last few minutes.
    await expect(first).toContainText(/Created \w{3} \d{1,2}, \d{2}:\d{2} UTC/);
    const createdAt = await first.locator("time").first().getAttribute("datetime");
    expect(createdAt, "created-at is on the row").not.toBeNull();
    const ageMs = Date.now() - Date.parse(createdAt ?? "");
    expect(Math.abs(ageMs)).toBeLessThan(3 * 60_000);
    // The row's columns are Lead (with where it came from), Status, Roof, Main permit and Last
    // activity; the created time sits in the last one.
    await expect(first).toContainText(/From Map/i);
    for (const column of ["Roof", "Main permit", "Last activity"]) {
      await expect(first.locator(`[data-field="${column}"]`), `${column} column`).toBeVisible();
    }
    await expect(first.locator('[data-field="Last activity"]')).toContainText(/Created/);
    await shot(page, "001", "top-of-list");
  });

  test("B-07-TC-002 create lead from permit row", async ({ page }) => {
    const f = factsOf(P_5_52);
    const permit = f.openPermit;
    if (permit === null) throw new Error("P_5_52 has no open permit with a number");
    const drawer = await openDrawer(page, P_5_52);
    const button = drawer.getByRole("button", {
      name: `Create lead from permit ${permit.permitNumber}`,
    });
    // Found by its permit number, not by "contains the button": the click replaces the button.
    const card = drawer
      .locator("article[data-permit-cid]")
      .filter({ hasText: permit.permitNumber });
    // The drawer checks Leads first. The key is per property, so TC-001's lead usually exists
    // already: then the permit row offers no create button and the drawer header says so.
    // Otherwise the button is there and the click creates the lead.
    const alreadyLead = drawer.getByText(/Already a lead/).first();
    await expect(button.or(alreadyLead)).toBeVisible({ timeout: 15_000 });
    if ((await button.count()) > 0) {
      await button.click();
      await expect(card.getByRole("status")).toContainText(/Lead created|Already a lead/);
    } else {
      await expect(alreadyLead).toBeVisible();
      await expect(button).toHaveCount(0);
    }
    await shot(page, "002", "permit-row");

    await page.goto("/leads");
    await expect(leadLink(page, f)).toHaveCount(1);
    await page.goto(leadPath(f.requestIdentifier));
    await expect(page.getByRole("region", { name: "Current signals" })).toContainText(
      permit.permitNumber,
    );
  });

  test("B-07-TC-003 signals snapshot and source CID", async ({ page }) => {
    const f = factsOf(P_5_52);
    await page.goto(leadPath(f.requestIdentifier));
    const signals = page.getByRole("region", { name: "Current signals" });
    await expect(signals).toBeVisible();
    await expect(signals).toContainText(`${f.roofAgeYears} yrs`);
    await expect(signals).toContainText(BASIS_LABEL[f.roofAgeBasis] ?? f.roofAgeBasis);
    // Character-for-character: the stored CID equals both the index row's and the plan's CID.
    expect(f.sourceManifestCid).toBe(MANIFEST_CID);
    await expect(signals.locator(`[data-cid="${MANIFEST_CID}"]`).first()).toBeVisible();
    // The snapshot holds the first open permit's id (AC-1), read from the index like the facts above.
    const permit = f.openPermit;
    if (permit === null) throw new Error("P_5_52 has no open permit with a number");
    await expect(signals).toContainText(permit.permitNumber);
    if (permit.openDays !== null)
      await expect(signals).toContainText(`open ${permit.openDays} days`);
    await shot(page, "003", "snapshot");
  });

  test("B-07-TC-004 contractor is shown as printed or with its reason", async ({ page }) => {
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const signals = page.getByRole("region", { name: "Current signals" });
    const contractor = signals
      .locator("div", { hasText: "Contractor, as printed on permit" })
      .last();
    // The contractor row is never blank or invented: either the name as printed on the permit,
    // labelled unverified (Task A prints one for this property since contract v1.1), or the reason
    // it is missing; and no BBB rating either (GAP-2: copy is asserted by meaning, not by the
    // literal string).
    await expect(contractor).toContainText(
      /as printed, unverified|not (published|available|saved)|unresolved/i,
    );
    await expect(signals.locator("div", { hasText: /^BBB/ }).last()).toContainText(
      /not (available|checked)|unresolved/i,
    );
    await shot(page, "004", "contractor-reason");
  });

  // ---- AC-2: duplicates --------------------------------------------------------------------

  test("B-07-TC-005 duplicate shows Already a lead", async ({ page }) => {
    const f = factsOf(P_5_52);
    const drawer = await openDrawer(page, P_5_52);
    // The drawer checks Leads first and shows the state instead of a button that would be refused.
    if (await showsExistingLead(drawer)) {
      const pill = drawer.getByText(/^Already a lead/).first();
      await expect(pill).not.toContainText("Lead created");
      await expect(drawer.getByRole("button", { name: "Create lead", exact: true })).toHaveCount(0);
      await expect(drawer.getByRole("button", { name: /^Checking Leads/ })).toHaveCount(0);
      await expect(drawer.getByRole("link", { name: "Open lead" })).toHaveAttribute(
        "href",
        leadPath(f.requestIdentifier),
      );
    } else {
      await drawer.getByRole("button", { name: "Create lead", exact: true }).click();
      const state = drawer.getByRole("status");
      await expect(state).toContainText("Already a lead");
      await expect(state).not.toContainText("Lead created");
    }
    await shot(page, "005", "already-a-lead");
  });

  test("B-07-TC-006 duplicate writes no row", async ({ page }) => {
    const f = factsOf(P_5_52);
    await page.goto("/leads");
    await expect(leadLink(page, f)).toHaveCount(1);
    const before = (await leadCount(page).textContent()) ?? "";

    // Opening the drawer only shows the state and writes nothing; no tap is needed.
    const drawer = await openDrawer(page, P_5_52);
    if (!(await showsExistingLead(drawer))) {
      await drawer.getByRole("button", { name: "Create lead", exact: true }).click();
      await expect(drawer.getByRole("status")).toContainText("Already a lead");
    }

    await page.goto("/leads");
    await page.reload();
    await expect(leadLink(page, f)).toHaveCount(1);
    await expect(leadCount(page)).toHaveText(before);
    expect((await listLeadKeys(page)).filter((key) => key === f.leadKey)).toHaveLength(1);
  });

  test("B-07-TC-007 20 concurrent creates", async ({ page }) => {
    const f = factsOf(P_AGE48);
    await page.goto("/leads");
    const headers = await authHeaders(page);
    // This AWS account allows 10 concurrent Lambda executions, so some of 20 simultaneous calls are
    // throttled (HTTP 503). A real client retries a throttle; so does this test, and it counts them.
    let throttled = 0;
    let dnsRetried = 0;
    const post = async (): Promise<APIResponse> => {
      for (let attempt = 1; ; attempt++) {
        let res: APIResponse;
        try {
          res = await page.request.post("/api/trpc/leads.create", {
            headers,
            data: createInput(f),
          });
        } catch (error) {
          // A lookup that fails under 20 simultaneous requests never reached the server, so
          // retrying cannot duplicate anything (the server dedupes anyway). Counted, not hidden.
          if (!/ENOTFOUND|EAI_AGAIN/.test(String(error)) || attempt >= 8) throw error;
          dnsRetried += 1;
          await page.waitForTimeout(150 * attempt + Math.floor(Math.random() * 150));
          continue;
        }
        if (res.status() !== 503 || attempt >= 8) return res;
        throttled += 1;
        await page.waitForTimeout(150 * attempt + Math.floor(Math.random() * 150));
      }
    };
    const responses: APIResponse[] = await Promise.all(Array.from({ length: 20 }, post));
    const bodies = await Promise.all(responses.map((r) => r.text()));
    const created = responses.filter((r) => r.status() === 200).length;
    const refused = responses.filter(
      (r, i) => r.status() === 409 && (bodies[i] ?? "").includes("Already a lead"),
    ).length;
    // The tally (status -> count, plus each distinct error message) is the TC-007 evidence.
    const tally: Record<string, number> = {};
    responses.forEach((r, i) => {
      const message = /"message":"([^"]*)"/.exec(bodies[i] ?? "")?.[1] ?? "";
      const key = `${r.status()} ${message}`.trim();
      tally[key] = (tally[key] ?? 0) + 1;
    });
    console.log(
      `TC-007 tally: ${JSON.stringify({ final: tally, throttledAndRetried: throttled, dnsRetried })}`,
    );
    await test.info().attach("TC-007-tally.json", {
      body: JSON.stringify({ final: tally, throttledAndRetried: throttled }, null, 2),
      contentType: "application/json",
    });
    expect({ created, refused, tally }).toEqual({ created: 1, refused: 19, tally });

    await page.reload();
    await expect(leadLink(page, f)).toHaveCount(1);
    expect((await listLeadKeys(page)).filter((key) => key === f.leadKey)).toHaveLength(1);
    // 0 lost updates: the single winner is still `new`.
    await page.goto(leadPath(f.requestIdentifier));
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("new");
    await shot(page, "007", "one-winner");
  });

  // ---- AC-3: status and notes --------------------------------------------------------------
  // TC-009 runs before TC-008 because TC-008 leaves the lead at `contacted`.

  test("B-07-TC-009 failed save undone", async ({ page }) => {
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const status = page.getByRole("combobox", { name: "Status" });
    await expect(status).toBeVisible();
    const original = await status.inputValue();
    const target = original === "contacted" ? "qualified" : "contacted";

    await page.route("**/api/trpc/leads.updateStatus**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "forced failure", code: -32603 } }),
      }),
    );
    await status.selectOption(target);
    // Behavior, not copy (GAP-2): an error is announced and mentions the save/status.
    await expect(page.getByRole("alert")).toContainText(/status|save/i);
    await expect(status).toHaveValue(original);
    await shot(page, "009", "error-and-reverted");

    await page.unroute("**/api/trpc/leads.updateStatus**");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(original);
  });

  test("B-07-TC-008 status and note persist", async ({ page }) => {
    const note = `${RUN_TAG} Spoke with homeowner, roof confirmed 22 years old`;
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const status = page.getByRole("combobox", { name: "Status" });
    await status.selectOption("contacted");
    await expect(status).toHaveValue("contacted");
    // Wait until the status is SAVED (the header pill reflects the server state), as a person
    // would: firing the note 40 ms after the status races the two refetches in the browser.
    await expect(
      page
        .locator("header")
        .filter({ has: page.locator("#lead-title") })
        .getByText("contacted"),
    ).toBeVisible();

    await page.getByLabel("Add a note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(savedNotes(page)).toContainText(note, { timeout: NOTE_VISIBLE_MS });
    await shot(page, "008", "saved");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("contacted");
    await expect(savedNotes(page)).toContainText(note, { timeout: NOTE_VISIBLE_MS });
    // History records both the status change and the note (plus the creation event).
    const history = page.getByRole("region", { name: "History" }).locator("li");
    expect(await history.count()).toBeGreaterThanOrEqual(2);
    await shot(page, "008", "after-reload");
  });

  test("B-07-TC-010 note round-trip", async ({ page }) => {
    const filler = "Roof walk notes, flashing & vents ok; ".repeat(40).slice(0, 1000);
    const note = `${RUN_TAG} "quoted" & 'single'\nsecond line ${filler}`.slice(0, 1000);
    expect(note).toHaveLength(1000);
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    await page.getByLabel("Add a note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    // Wait until THIS note is SAVED (in the list, not just typed in the textarea) before reloading.
    await expect(savedNotes(page)).toContainText(`${RUN_TAG} "quoted" & 'single'`, {
      timeout: NOTE_VISIBLE_MS,
    });

    await page.reload();
    await expect(savedNotes(page)).toContainText(`${RUN_TAG} "quoted" & 'single'`, {
      timeout: NOTE_VISIBLE_MS,
    });
    const text = await savedNotes(page).textContent();
    // textContent keeps the line break and every character, so a plain includes() is exact.
    expect(text ?? "").toContain(note);
  });

  // ---- AC-4: filters -----------------------------------------------------------------------

  test("B-07-TC-011 combined filters agree with map", async ({ page }) => {
    // Third lead for the count; "Already a lead" is fine when a previous run left it behind.
    const drawer = await openDrawer(page, P_5_89);
    const createButton = drawer.getByRole("button", { name: "Create lead", exact: true });
    const alreadyLead = drawer.getByText(/^Already a lead/).first();
    await expect(createButton.or(alreadyLead)).toBeVisible({ timeout: 15_000 });
    if ((await createButton.count()) > 0) {
      await createButton.click();
      await expect(drawer.getByRole("status")).toContainText(/Lead created|Already a lead/);
    }

    // Expected set from the index itself (roof >= 20, an open permit, <= 10 mi of the Central Austin area centre).
    const expected = [P_5_52, P_AGE48, P_5_89]
      .map(factsOf)
      .filter(
        (f) =>
          (f.roofAgeYears ?? 0) >= 20 &&
          f.hasOpenPermit &&
          milesBetween(AREA_CENTRE, { lat: f.latitude, lng: f.longitude }) <= 10,
      );

    await page.goto("/leads");
    await openLeadFilters(page);
    await page
      .getByRole("group", { name: "Roof age threshold" })
      .getByRole("button", { name: "20", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Permit status" })
      .getByRole("button", { name: "Open" })
      .click();
    await setLeadArea(page, AREA_CENTRE.lat, AREA_CENTRE.lng, "10");

    if (expected.length === 0) {
      await expect(page.getByText("No leads match these filters")).toBeVisible({
        timeout: FILTERED_LIST_MS,
      });
    } else {
      // Other leads in the same area (for example one made by hand on the live app) may also pass
      // the filters, so the list must hold every expected fixture lead and at least that many
      // rows; the fixture leads that must NOT match are checked below.
      await expect(async () => {
        const text = (await leadCount(page).textContent()) ?? "";
        expect(Number(/^(\d+)/.exec(text)?.[1] ?? 0)).toBeGreaterThanOrEqual(expected.length);
      }).toPass({ timeout: FILTERED_LIST_MS });
      for (const f of expected) await expect(leadLink(page, f)).toHaveCount(1);
    }
    for (const f of [P_5_52, P_AGE48, P_5_89].map(factsOf).filter((x) => !expected.includes(x))) {
      await expect(leadLink(page, f)).toHaveCount(0);
    }
    test.info().annotations.push({
      type: "scope",
      description:
        "Map header count is not compared: the map counts every matching property, the list only leads. List count is checked against the index-derived set instead; the 50+ lead variant is GAP-1.",
    });
    await shot(page, "011", "combined-filters");
  });

  test("B-07-TC-012 filters in URL reopen same view", async ({ page, browser, baseURL }) => {
    await page.goto("/leads");
    await openLeadFilters(page);
    await page
      .getByRole("group", { name: "Roof age threshold" })
      .getByRole("button", { name: "20", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Permit status" })
      .getByRole("button", { name: "Open" })
      .click();
    await setLeadArea(page, AREA_CENTRE.lat, AREA_CENTRE.lng, "10");
    await expect(page).toHaveURL(/roof=20/);
    const url = new URL(page.url());
    for (const [key, value] of [
      ["roof", "20"],
      ["permit", "open"],
      ["lat", String(AREA_CENTRE.lat)],
      ["lng", String(AREA_CENTRE.lng)],
      ["r", "10"],
    ] as const) {
      expect(url.searchParams.get(key), `URL param ${key}`).toBe(value);
    }
    const countText = await leadCount(page)
      .textContent({ timeout: FILTERED_LIST_MS })
      .catch(() => null);

    // A second, fresh browser context stands in for "a new private window".
    const other = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(page.viewportSize() === null ? {} : { viewport: page.viewportSize() }),
    });
    try {
      const second = await other.newPage();
      await signIn(second, SEEDED_PASSWORD ?? "");
      await second.goto(`${url.pathname}${url.search}`);
      await openLeadFilters(second);
      await expect(
        second
          .getByRole("group", { name: "Roof age threshold" })
          .getByRole("button", { name: "20", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        second.getByRole("group", { name: "Permit status" }).getByRole("button", { name: "Open" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(second.getByLabel("Radius, mi")).toHaveValue("10");
      if (countText === null) {
        await expect(second.getByText("No leads match these filters")).toBeVisible({
          timeout: FILTERED_LIST_MS,
        });
      } else {
        await expect(leadCount(second)).toHaveText(countText, { timeout: FILTERED_LIST_MS });
      }
      await shot(second, "012", "reopened");
    } finally {
      await other.close();
    }
  });

  test("B-07-TC-013 no-match state", async ({ page }) => {
    // 60 yr is not a chip, so the combination is set through the URL (the same state the chips write).
    await page.goto(
      `/leads?roof=60&permit=closed&lat=${AREA_CENTRE.lat}&lng=${AREA_CENTRE.lng}&r=0.5`,
    );
    await expect(page.getByText("No leads match these filters")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await shot(page, "013", "no-match");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/roof=|permit=|lat=|lng=|r=/);
  });

  // ---- AC-5 and scale: blocked by known gaps -----------------------------------------------

  test("B-07-TC-014 not in Run n", async ({ page }) => {
    await createStaleLead(page);
    await page.goto(leadPath(STALE_REQUEST_ID));
    const state = page.getByTestId("not-in-run");
    await expect(state).toBeVisible();
    // "Not in run {id}" names the served run, taken from the index; never a made-up number.
    await expect(state).toContainText(/Not in run \S+/);
    await expect(state.locator(`[data-cid="${OLD_MANIFEST_CID}"]`).first()).toBeVisible();
    await shot(page, "014", "not-in-run");

    await page.goto("/leads");
    const row = page.locator("li[data-lead-id]").filter({ hasText: `TCAD ${STALE_REQUEST_ID}` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Not in the current run");
    await shot(page, "014", "list-pill");
  });

  test("B-07-TC-015 no stale values", async ({ page }) => {
    await page.goto(leadPath(STALE_REQUEST_ID));
    const signals = page.getByRole("region", { name: "Current signals" });
    await expect(signals).toContainText("Signals withheld");
    // The captured roof age (40) is not shown as current, and no other value takes its place.
    await expect(page.getByText(/\b40 yrs/)).toHaveCount(0);
    await expect(signals).not.toContainText(/\d+ yrs/);
    await expect(signals).not.toContainText("Roof age");
    await expect(signals).not.toContainText("Open permit");
    await shot(page, "015", "signals-withheld");
  });

  test("B-07-TC-015b lead on a property still in the run is not flagged", async ({ page }) => {
    const f = factsOf(P_5_52);
    await page.goto(leadPath(f.requestIdentifier));
    await expect(page.getByRole("region", { name: "Current signals" })).toBeVisible();
    await expect(page.getByTestId("not-in-run")).toHaveCount(0);
    await page.goto("/leads");
    const row = page
      .locator("li[data-lead-id]")
      .filter({ hasText: leadTitle(f.requestIdentifier) });
    await expect(row).toHaveCount(1);
    await expect(row).not.toContainText("Not in the current run");
    // A differing manifest with the property still present is covered by the service unit tests.
  });

  // ---- Edge: unknown lead ------------------------------------------------------------------

  test("B-07-TC-017 unknown lead not found", async ({ page }) => {
    await page.goto("/leads/does-not-exist");
    // A missing lead is not retried, so the not-found page appears straight away.
    await expect(page.getByRole("heading", { name: "Lead not found" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("alert")).toHaveCount(0); // not the generic load-error banner
    await shot(page, "017", "not-found");
    await page.getByRole("link", { name: "Back to leads" }).click();
    await expect(page).toHaveURL(/\/leads$/);
  });

  // ---- NFRs --------------------------------------------------------------------------------

  test("B-07-TC-018 permit open chip filters the list through the URL", async ({ page }) => {
    // The open permit of the first fixture is 37 days old (run-fixtures.ts), so a filter of
    // "open at least 1 yr" must drop it, and the chip must show as pressed from the URL alone.
    // Needs the API that returns the permit age with each lead (permitOpenDaysMin).
    const f = factsOf(P_5_52);
    await page.goto("/leads");
    await expect(leadLink(page, f)).toHaveCount(1);

    await page.goto("/leads?permitOpen=1");
    await openLeadFilters(page);
    const group = page.getByRole("group", { name: "Permit open at least" });
    await expect(group.getByRole("button", { name: "1 yr", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // "Any" exists in several groups; only this group's chip is meant.
    await expect(group.getByRole("button", { name: "Any", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Other leads that really have a permit open for years may stay in the list (one made by hand
    // on the live app does), so the check is that this fixture's 37-day permit drops out.
    await expect(leadLink(page, f)).toHaveCount(0, { timeout: FILTERED_LIST_MS });

    await group.getByRole("button", { name: "Any", exact: true }).click();
    await expect(page).not.toHaveURL(/permitOpen=/);
    await expect(leadLink(page, f)).toHaveCount(1, { timeout: FILTERED_LIST_MS });
    await shot(page, "018", "permit-open-chip");
  });

  test("B-07-TC-NF-04 responsive and tokens", async ({ page }) => {
    const f = factsOf(P_5_52);
    for (const path of ["/leads", leadPath(f.requestIdentifier)]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${path} overflows horizontally`).toBeLessThanOrEqual(clientWidth);
      const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
      expect(audit.checkedElements).toBeGreaterThan(0);
      expect(audit.violations, `${path}: ${JSON.stringify(audit.violations, null, 2)}`).toEqual([]);
      await shot(page, "NF-04", path.startsWith("/leads/") ? "detail" : "list");
    }
  });

  // Runs last: it creates and deletes the P_5_89 lead 20 times, so it must not precede TC-011.
  test("B-07-TC-NF-01 create latency p95", async ({ page }) => {
    test.setTimeout(300_000);
    const f = factsOf(P_5_89);
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      try {
        await cleanup?.deleteLeads([f.leadKey]);
        const drawer = await openDrawer(page, P_5_89);
        // The drawer shows a disabled "Checking Leads…" button until its lead lookup answers.
        // That is drawer readiness, not create latency, so the clock starts once the real
        // button is there (a person cannot click it earlier either).
        const createButton = drawer.getByRole("button", { name: "Create lead", exact: true });
        await createButton.waitFor({ state: "visible", timeout: 15_000 });
        const startedAt = Date.now();
        await createButton.click();
        await drawer.getByRole("link", { name: "View leads" }).click();
        // Poll on every animation frame: expect().toContainText rechecks on a coarse back-off
        // schedule, which rounded these samples up in steps (found live: ~700 ms became 1200 or
        // 2200 ms with the API itself answering in about 450 ms).
        await page.waitForFunction(
          (needle) =>
            document.querySelector("li[data-lead-id]")?.textContent?.includes(needle) === true,
          leadTitle(f.requestIdentifier),
          { polling: "raf", timeout: 10_000 },
        );
        samples.push(Date.now() - startedAt);
      } catch (error) {
        // Say which iteration failed and what the earlier ones measured.
        throw new Error(
          `NF-01 iteration ${i + 1}/20 failed after samples [${samples.join(", ")}] ms`,
          {
            cause: error,
          },
        );
      }
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.POSITIVE_INFINITY;
    console.log(`NF-01 samples ms: ${samples.join(", ")} | p95 ms: ${p95}`);
    await test.info().attach("B-07-TC-NF-01-samples.txt", {
      body: `samples ms: ${samples.join(", ")}\np95 ms: ${p95}\n`,
      contentType: "text/plain",
    });
    expect(p95, `p95 ${p95} ms`).toBeLessThanOrEqual(2000);
    // Leave the P_5_89 lead in place for any later manual check.
  });

  test.fixme(
    "B-07-TC-NF-03 list load p95",
    {
      annotation: {
        type: "known-gap",
        description:
          "GAP-1: the full-county index is not published (A-11 pending); the slice has 14 properties, so 50 distinct leads cannot exist yet.",
      },
    },
    () => {},
  );
});
