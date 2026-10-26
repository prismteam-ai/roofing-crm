// Guards the data-dependent fixtures (lib/run-fixtures.ts). They were read from one Task A run;
// when the app serves another, this file fails FIRST and says what to do, instead of a dozen
// map, layout and leads specs failing for a reason that looks unrelated. Fast and read-only: a
// handful of API reads as the signed-in admin, no screenshots, one project (desktop-1440).
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, openSignedIn, requirePassword } from "./lib/auth.js";
import {
  EAST_TRAVIS,
  FIXTURES_MANIFEST_CID,
  FIXTURES_RUN_ID,
  LEAD_FIXTURES,
  OPEN_PERMIT_NUMBER,
  ZERO_THEN_WIDEN,
} from "./lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const REFRESH = "re-run the steps in tests/e2e/lib/refresh-fixtures.md";

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const raw = await page.evaluate(() => localStorage.getItem("crm.session"));
  const idToken = raw === null ? undefined : (JSON.parse(raw) as { idToken?: string }).idToken;
  if (idToken === undefined) throw new Error("no Cognito session in localStorage");
  return { Authorization: `Bearer ${idToken}` };
}

async function trpc<T>(page: Page, procedure: string, input?: unknown): Promise<T> {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await page.request.get(`/api/trpc/${procedure}${query}`, {
    headers: await authHeaders(page),
    timeout: 60_000,
  });
  expect(response.ok(), `${procedure} answered HTTP ${response.status()}`).toBe(true);
  return ((await response.json()) as { result: { data: T } }).result.data;
}

interface Counts {
  afterRadius: number;
}
const radiusCount = async (
  page: Page,
  center: { lat: number; lng: number },
  radiusMi: number,
): Promise<number> =>
  (await trpc<{ counts: Counts }>(page, "search.properties", { center, radiusMi, limit: 1 })).counts
    .afterRadius;

test.describe("Fixtures still match the served run", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    requirePassword();
    test.skip(testInfo.project.name !== "desktop-1440", "data check, once per run");
    await openSignedIn(page);
  });

  test("the app serves the run the fixtures were read from", async ({ page }) => {
    const info = await trpc<{ manifestCid: string; runId: string | null }>(page, "shell.indexInfo");
    expect(
      info.manifestCid,
      `fixtures were read from run ${FIXTURES_RUN_ID} (${FIXTURES_MANIFEST_CID}), the app now serves run ${info.runId ?? "unknown"} (${info.manifestCid}): ${REFRESH}`,
    ).toBe(FIXTURES_MANIFEST_CID);
  });

  test("the pins: the search pin has results, the empty pocket is empty and one step wider is not", async ({
    page,
  }) => {
    expect(
      await radiusCount(page, EAST_TRAVIS, 3),
      `EAST_TRAVIS has no properties within 3 mi: ${REFRESH}`,
    ).toBeGreaterThan(0);
    expect(
      await radiusCount(page, ZERO_THEN_WIDEN, ZERO_THEN_WIDEN.zeroRadiusMi),
      `ZERO_THEN_WIDEN now has properties within ${ZERO_THEN_WIDEN.zeroRadiusMi} mi, so it is not an empty pocket: ${REFRESH}`,
    ).toBe(0);
    expect(
      await radiusCount(page, ZERO_THEN_WIDEN, ZERO_THEN_WIDEN.widenedMi),
      `ZERO_THEN_WIDEN has no properties within ${ZERO_THEN_WIDEN.widenedMi} mi, so widening finds nothing: ${REFRESH}`,
    ).toBeGreaterThan(0);
  });

  test("the Map's default roof filter (15+ years) still leaves results at the search pin, and never more than the unfiltered set", async ({
    page,
  }) => {
    // The pins are measured with no roof filter (`roof=any`); the Map now opens with 15+ years.
    const all = await radiusCount(page, EAST_TRAVIS, 3);
    const aged = (
      await trpc<{ counts: Counts }>(page, "search.properties", {
        center: EAST_TRAVIS,
        radiusMi: 3,
        roofAgeMinYears: 15,
        limit: 1,
      })
    ).counts.afterRadius;
    expect(
      aged,
      `no roof of 15 years or more within 3 mi of EAST_TRAVIS: ${REFRESH}`,
    ).toBeGreaterThan(0);
    expect(aged).toBeLessThanOrEqual(all);
  });

  for (const [name, fixture] of Object.entries(LEAD_FIXTURES)) {
    test(`lead fixture ${name} still resolves`, async ({ page }) => {
      const data = await trpc<{
        property: {
          requestIdentifier: string;
          roofAgeYears: number | null;
          latitude: number | null;
        } | null;
        permits: { statusClass: string | null; permitNumber: string | null }[];
      }>(page, "property.get", { propertyCid: fixture.cid });
      expect(
        data.property,
        `${name} (${fixture.cid}) is not in the served run: ${REFRESH}`,
      ).not.toBeNull();
      const property = data.property;
      if (property === null) return;
      expect(property.requestIdentifier, `${name}: request identifier changed: ${REFRESH}`).toBe(
        fixture.requestIdentifier,
      );
      expect(property.latitude, `${name} has no location: ${REFRESH}`).not.toBeNull();
      expect(
        property.roofAgeYears ?? 0,
        `${name} no longer has a roof age of 20 years or more: ${REFRESH}`,
      ).toBeGreaterThanOrEqual(20);
      const open = data.permits.filter((permit) => permit.statusClass === "open");
      if (name === "openPermit") {
        expect(
          open.some((permit) => permit.permitNumber === OPEN_PERMIT_NUMBER),
          `${name}: open permit ${OPEN_PERMIT_NUMBER} is gone: ${REFRESH}`,
        ).toBe(true);
      } else {
        expect(
          data.permits.filter((p) => p.statusClass === "open" || p.statusClass === "stalled"),
          `${name} gained an open or stalled permit: ${REFRESH}`,
        ).toHaveLength(0);
      }
    });
  }
});
