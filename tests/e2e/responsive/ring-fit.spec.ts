// The search ring stays inside the visible map at 390/768/1440: after a pin drop through the URL
// (lat, lng, r=5) and after changing the radius from the radius control. The app fits the camera to
// the ring (CrmMap.tsx), and exposes its MapLibre instance as `window.__crmMap`; this reads the
// map's own visible bounds and compares them with the ring's four extreme points (computed here
// from the pin and the radius, not read from the app). No pixel or tile assertions: the camera
// settles on `idle`, which is awaited. Read-only.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import { EAST_TRAVIS, ROOF_ANY_PARAM } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_M = 6_371_008.8;

/** The ring's west/south/east/north extremes for a pin and radius (statute miles). */
function ringExtremes(lat: number, lng: number, radiusMi: number) {
  const d = (radiusMi * METERS_PER_MILE) / EARTH_RADIUS_M;
  const latDeg = (d * 180) / Math.PI;
  const lngDeg = latDeg / Math.cos((lat * Math.PI) / 180);
  return { west: lng - lngDeg, east: lng + lngDeg, south: lat - latDeg, north: lat + latDeg };
}

interface Visible {
  west: number;
  east: number;
  south: number;
  north: number;
}

async function visibleBounds(page: Page): Promise<Visible | null> {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __crmMap?: {
          getBounds(): {
            getWest(): number;
            getEast(): number;
            getSouth(): number;
            getNorth(): number;
          };
        };
      }
    ).__crmMap;
    if (map === undefined) return null;
    const b = map.getBounds();
    return { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
  });
}

/** Waits for the camera to stop moving (MapLibre `idle`), then asserts the ring is inside. */
async function expectRingVisible(page: Page, radiusMi: number, what: string): Promise<void> {
  const ring = ringExtremes(EAST_TRAVIS.lat, EAST_TRAVIS.lng, radiusMi);
  await expect
    .poll(
      async () => {
        const v = await visibleBounds(page);
        if (v === null) return "map not ready";
        const outside =
          (["west", "south"] as const).some((k) => ring[k] < v[k]) ||
          (["east", "north"] as const).some((k) => ring[k] > v[k]);
        return outside
          ? `ring outside the visible map: ring ${JSON.stringify(ring)} map ${JSON.stringify(v)}`
          : "inside";
      },
      {
        message: `${what}: the whole ring is in the visible map`,
        timeout: 20_000,
        intervals: [250, 500, 1000],
      },
    )
    .toBe("inside");
}

test.describe("The search ring fits the visible map", () => {
  test.beforeEach(() => {
    requirePassword();
  });

  test("after a pin drop (r=5) and after a radius change from the control", async ({ page }) => {
    await page.goto(`/?lat=${EAST_TRAVIS.lat}&lng=${EAST_TRAVIS.lng}&r=5&${ROOF_ANY_PARAM}`);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await expect(page.getByTestId("crm-map")).toBeVisible();
    await expectRingVisible(page, 5, "pin drop at 5 mi");

    const radius = page.getByRole("spinbutton", { name: "Radius" });
    await radius.fill("8");
    await radius.blur();
    await expect(radius).toHaveValue("8");
    await expect(page).toHaveURL(/[?&]r=8(&|$)/);
    await expectRingVisible(page, 8, "after changing the radius to 8 mi");

    await radius.fill("2");
    await radius.blur();
    await expect(page).toHaveURL(/[?&]r=2(&|$)/);
    await expectRingVisible(page, 2, "after changing the radius to 2 mi");
  });
});
