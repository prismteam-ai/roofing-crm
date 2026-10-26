// B-03 (US1, Group 1 scope — map+radius+GPS): T008 (AC-1), T009 (AC-2), T010 (zero-result edge
// case), T011 (outside-county edge case), per testplans/B-03-test-cases.md TC-001/TC-006/TC-007/
// TC-009. Written and left failing-until-deployed on purpose (Phase Z/TZ03 runs these against
// RUNTIME_URL, the Amplify branch preview — never localhost as evidence, though the pre-deploy
// local dev-server run this story's playwright.config.ts allows is fine for development). AC-3
// through AC-7 (roof-age/permits/detail/BBB) are Group 2's scope (T020/T027/T032/T033) and are
// not duplicated here.
//
// Geolocation requires HTTPS; Playwright's `context.setGeolocation`/`grantPermissions` work
// against the hosted preview (and against the local dev server over http://localhost, which
// Chromium treats as a secure context for this API specifically) — this file does not special-
// case localhost itself (B-01.spec.ts's precedent; config-guard.spec.ts + playwright.config.ts
// already enforce "never localhost" for any RUNTIME_URL that IS set).
import { expect, test } from "@playwright/test";
import { EAST_TRAVIS, GEORGETOWN, ROOF_ANY_PARAM, ZERO_THEN_WIDEN } from "./lib/run-fixtures.js";
import { AUTH_STATE_PATH, openSignedIn, SEEDED_PASSWORD, requirePassword } from "./lib/auth.js";

// Signed in once by the `setup` project (tests/e2e/lib/auth.ts); sign-in itself is B-01's job.
test.use({ storageState: AUTH_STATE_PATH });

// Data-dependent points live in lib/run-fixtures.ts (read from the real served index, see lib/run-fixtures.ts).

/** Drops the pin at the given lat/lng by firing the live MapLibre instance's own click event
 *  (window.__crmMap, CrmMap.tsx's test-only hook) at that point. A real pointer click is not used
 *  because, at phone and tablet widths, the status cards and legend float over most of the canvas
 *  and would take the click; the app's click handler (CrmMap's onClick) is what runs either way. */
async function clickMapAt(
  page: import("@playwright/test").Page,
  point: { lat: number; lng: number },
): Promise<void> {
  const fired = await page.evaluate(async (p) => {
    const map = (
      window as unknown as {
        __crmMap?: {
          project(lngLat: [number, number]): { x: number; y: number };
          jumpTo(options: { center: [number, number]; zoom: number }): void;
          fire(type: string, data: unknown): void;
          queryRenderedFeatures(point: { x: number; y: number }, options: unknown): unknown[];
          getLayer(id: string): unknown;
        };
      }
    ).__crmMap;
    if (map === undefined) return false;
    // Zoomed in first, as a person aiming a pin would: at county zoom the permit clusters cover
    // the point and a click on a cluster expands it instead of dropping a pin.
    map.jumpTo({ center: [p.lng, p.lat], zoom: 12 });
    const projected = map.project([p.lng, p.lat]);
    // The county-overview hexagons hide once the zoom state catches up, a moment after jumpTo.
    // While one is still drawn under the point the app leaves the click to the hexagon handler,
    // which a synthetic map click never reaches, so wait for it to go (a person clicking at this
    // zoom never meets a hexagon). Run 3's overview loads fast enough to be there at this moment.
    for (let i = 0; i < 50; i += 1) {
      const hexes =
        map.getLayer("crm-hex-fill") === undefined
          ? []
          : map.queryRenderedFeatures(projected, { layers: ["crm-hex-fill"] });
      if (hexes.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // A real click carries its DOM event; MapLibre's own marker handler reads `originalEvent.target`
    // and throws without it once a marker (the search pin) is on the map.
    map.fire("click", {
      lngLat: { lng: p.lng, lat: p.lat },
      point: { x: projected.x, y: projected.y },
      originalEvent: { target: document.body },
    });
    return true;
  }, point);
  if (!fired) throw new Error("window.__crmMap not found — is CrmMap mounted?");
}

async function waitForMapReady(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator('[data-route="map"]')).toBeVisible();
  await page.waitForFunction(() => {
    const map = (window as unknown as { __crmMap?: { loaded(): boolean } }).__crmMap;
    return map?.loaded() === true;
  });
}

const resultsOrState =
  '[data-testid="search-results"], [data-state="CrmMapNoResults390"], [data-state="CrmMapIndexDown390"]';

/** The "Matches N" count in the results header and each row's printed distance in miles. */
async function readResults(
  page: import("@playwright/test").Page,
): Promise<{ matches: number; distancesMi: number[] }> {
  const header = await page
    .getByText(/^Matches \d+$/)
    .first()
    .textContent({ timeout: 2_000 });
  const matches = Number(/\d+/.exec(header ?? "")?.[0]);
  const distancesMi = await page.locator("[data-result-row]").evaluateAll((rows) =>
    rows
      .map((row) => /(\d+(?:\.\d+)?) mi/.exec((row as HTMLElement).innerText)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number),
  );
  return { matches, distancesMi };
}

test.describe("AC-1: radius search from a pin (B-03-TC-001, B-03-TC-004)", () => {
  // The pin drop first searches the default 10 mi radius (tens of thousands of properties), which
  // the API answers in many seconds; the radius change after it is what this test is about.
  test.describe.configure({ timeout: 120_000 });
  test("pin in east Travis County: 5 mi lists real properties inside the ring; 6 mi never loses any", async ({
    page,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    // `roof=any`: the Map defaults to roofs of 15+ years; these counts are about the radius only.
    await openSignedIn(page, `/?${ROOF_ANY_PARAM}`);
    await waitForMapReady(page);

    await clickMapAt(page, EAST_TRAVIS);
    const radius = page.getByRole("spinbutton", { name: "Radius" });
    await radius.fill("5");
    await radius.blur();

    // Run 2 has rows around this pin at every radius from 1 mi (fixtures file), so the
    // honest outcome is a results list. "Index not ready" would be a real failure here, not a state
    // to accept.
    await page.locator(resultsOrState).first().waitFor({ state: "visible" });
    await expect(page.locator('[data-state="CrmMapIndexDown390"]')).toHaveCount(0);
    await expect(page.locator('[data-state="CrmMapNoResults390"]')).toHaveCount(0);
    await page.getByTestId("search-results").waitFor({ state: "visible" });
    await page.locator("[data-result-row]").first().waitFor({ state: "attached" });

    const at5 = await readResults(page);
    expect(at5.matches, "at least one result inside the 5 mi ring").toBeGreaterThan(0);
    expect(at5.distancesMi.length, "rows print their distance").toBeGreaterThan(0);
    for (const miles of at5.distancesMi) {
      // The pixel click can sit up to ~130 m off the nominal point; a printed distance is rounded.
      expect(miles, "every listed property is inside the 5 mi ring").toBeLessThanOrEqual(5.2);
    }

    await radius.fill("6");
    await radius.blur();
    await expect(radius).toHaveValue("6");
    // The header disappears while the wider search loads (several seconds at this size), so a
    // missing header reads as -1 and the poll waits for the new count.
    await expect
      .poll(async () => (await readResults(page).catch(() => ({ matches: -1 }))).matches, {
        message: "widening 5 -> 6 mi never reduces the matches",
        timeout: 60_000,
      })
      .toBeGreaterThanOrEqual(at5.matches);
  });
});

test.describe("AC-1 edge case: zero results widen to a wider radius (B-03-TC-006)", () => {
  test('0.5 mi in an empty pocket shows "widen to {n} mi"; widening finds results', async ({
    page,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    // Opened by URL, not by a click: see ZERO_THEN_WIDEN in lib/run-fixtures.ts.
    await openSignedIn(
      page,
      `/?lat=${ZERO_THEN_WIDEN.lat}&lng=${ZERO_THEN_WIDEN.lng}&r=${ZERO_THEN_WIDEN.zeroRadiusMi}&${ROOF_ANY_PARAM}`,
    );
    await waitForMapReady(page);
    const radius = page.getByRole("spinbutton", { name: "Radius" });
    await expect(radius).toHaveValue(String(ZERO_THEN_WIDEN.zeroRadiusMi));

    const noResults = page.locator('[data-state="CrmMapNoResults390"]');
    await expect(page.locator('[data-state="CrmMapIndexDown390"]')).toHaveCount(0);
    await expect(noResults).toBeVisible();
    await expect(noResults).toContainText(/widen to \d+(\.\d+)? mi/i);

    // Clicking the suggestion raises the radius by a fixed +1 mi step (Round 1 decision,
    // 2026-10-23), never doubling.
    const widenButton = noResults.getByRole("button", { name: /widen/i });
    const label = (await widenButton.textContent()) ?? "";
    const match = /widen to (\d+(?:\.\d+)?) mi/i.exec(label);
    expect(match, "the suggestion names a specific radius").not.toBeNull();
    expect(Number(match?.[1])).toBeCloseTo(ZERO_THEN_WIDEN.widenedMi, 5);
    await widenButton.click();
    await expect(radius).toHaveValue(String(ZERO_THEN_WIDEN.widenedMi));

    // The pocket was chosen so that one step wider reaches properties.
    await page.getByTestId("search-results").waitFor({ state: "visible" });
    await expect(noResults).toHaveCount(0);
    expect((await readResults(page)).matches, "results after widening").toBeGreaterThan(0);
  });
});

test.describe("AC-1 edge case: GPS outside Travis County shows an explicit state, no empty map (B-03-TC-007)", () => {
  test("GPS resolved to Georgetown (Williamson County) shows the outside-county state", async ({
    page,
    context,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: GEORGETOWN.lat, longitude: GEORGETOWN.lng });
    await openSignedIn(page);
    await waitForMapReady(page);

    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.locator('[data-state="CrmMapGpsOutside390"]')).toBeVisible();
    // The map itself is never blank: the canvas and its wrapper stay rendered.
    await expect(page.getByTestId("crm-map")).toBeVisible();
    await expect(page.locator('[data-testid="search-results"]')).toHaveCount(0);
  });
});

test.describe("AC-2: GPS denied falls back to pin-drop with an explicit state (B-03-TC-009)", () => {
  test('GPS permission denied shows "location denied" and pin-drop still works', async ({
    page,
    context: _context,
  }) => {
    requirePassword();
    if (!SEEDED_PASSWORD) return;
    // No grantPermissions call: geolocation stays denied by default in a fresh context.
    await openSignedIn(page, `/?${ROOF_ANY_PARAM}`);
    await waitForMapReady(page);

    await page.getByRole("button", { name: "Use my location" }).click();
    const denied = page.locator('[data-state="CrmMapGpsDenied390"]');
    await expect(denied).toBeVisible();
    await expect(denied).toContainText(/location/i);

    // Pin-drop mode is still active: the map is never blank and still accepts a click.
    await expect(page.getByTestId("crm-map")).toBeVisible();
    await clickMapAt(page, EAST_TRAVIS);
    // A real search ran: a results list (this pin has rows), never a silent no-op. A 1 mi radius
    // keeps the answer quick (the default radius covers tens of thousands of properties).
    const radius = page.getByRole("spinbutton", { name: "Radius" });
    await radius.fill("1");
    await radius.blur();
    await page.getByTestId("search-results").waitFor({ state: "visible" });
    await expect(page.locator('[data-state="CrmMapIndexDown390"]')).toHaveCount(0);
  });
});
