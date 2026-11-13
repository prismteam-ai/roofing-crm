import {
  expect,
  request,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { BASE_URL, CREDS, ORIGIN } from "./env.ts";

const VN = { lat: 34.199, lon: -118.487 };
const LA = { west: -118.95, south: 33.7, east: -117.65, north: 34.82 };
const TILE_PATH = "maps.geo.eu-north-1.amazonaws.com/v2/tiles/";
const haversine = (a: number[], b: number[]) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b[0]! - a[0]!) / 2) ** 2 +
    Math.cos(r(a[0]!)) *
      Math.cos(r(b[0]!)) *
      Math.sin(r(b[1]! - a[1]!) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};
const trpc = (apiUrl: string, proc: string, input?: unknown) =>
  `${apiUrl}/trpc/${proc}${input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
/** Strict data-attribute read: a missing attribute fails as "missing" and is never coerced to 0. */
const strictNum = async (
  el: Locator,
  name: string,
  what: string,
): Promise<number> => {
  const v = await el.getAttribute(name);
  if (v === null) throw new Error(`attribute ${name} missing on ${what}`);
  const n = Number(v);
  if (v.trim() === "" || !Number.isFinite(n))
    throw new Error(`attribute ${name} on ${what} is not a number: "${v}"`);
  return n;
};
const attrNum = (page: Page, testId: string, name: string) =>
  strictNum(page.getByTestId(testId), name, `[data-testid=${testId}]`);
const count = (page: Page) => attrNum(page, "result-count", "data-count");
const centre = async (page: Page) => [
  await attrNum(page, "map", "data-center-lat"),
  await attrNum(page, "map", "data-center-lon"),
];
const pinOf = async (page: Page) => [
  await attrNum(page, "map", "data-pin-lat"),
  await attrNum(page, "map", "data-pin-lon"),
];
/** Strict attribute string: a missing attribute fails as "missing". */
const strictAttr = async (page: Page, name: string): Promise<string> => {
  const v = await page.getByTestId("map").getAttribute(name);
  if (v === null)
    throw new Error(`attribute ${name} missing on [data-testid=map]`);
  return v;
};
/** The app's search key for the inputs currently set: pin (6 decimals, as in data-pin-*), radius, threshold. */
const currentKey = async (page: Page) =>
  `${await strictAttr(page, "data-pin-lat")},${await strictAttr(page, "data-pin-lon")}|${await page.getByTestId("radius").inputValue()}|${await page.getByTestId("threshold").inputValue()}`;
/** Wait until the map has drawn the points of the CURRENT search at the given zoom (render marker, written on "idle"). */
const renderedFor = async (page: Page, zoom: number) => {
  const key = await currentKey(page);
  await expect(page.getByTestId("map")).toHaveAttribute(
    "data-rendered-search",
    key,
    { timeout: 20_000 },
  );
  // The zoom is compared as a number to 6 decimals: MapLibre's zoom can carry float drift after a re-centre.
  await expect
    .poll(async () => Number(await strictAttr(page, "data-rendered-zoom")), {
      timeout: 20_000,
    })
    .toBeCloseTo(zoom, 6);
};
/** GET requests to /trpc/parcels.detail (CORS preflights excluded). */
const detailGets = (page: Page) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      new URL(r.url()).pathname.startsWith("/trpc/parcels.detail")
    )
      calls.push(r.url());
  });
  return calls;
};
/** Radius of the circle as drawn (measured by the app from the drawn ring), in miles. */
const circleRadius = (page: Page) =>
  attrNum(page, "map", "data-circle-radius-miles");
/** Web Mercator pixel of a point relative to the map centre (MapLibre: 512 px tiles). */
const mercatorOffset = (
  lat: number,
  lon: number,
  centre: number[],
  zoom: number,
) => {
  const world = 512 * 2 ** zoom;
  const x = (lo: number) => ((lo + 180) / 360) * world;
  const y = (la: number) =>
    ((1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / Math.PI) /
      2) *
    world;
  return { dx: x(lon) - x(centre[1]!), dy: y(lat) - y(centre[0]!) };
};
const settle = (page: Page, n: number) =>
  expect.poll(() => count(page), { timeout: 20_000 }).toBe(n);
const ready = (page: Page) =>
  expect(page.getByTestId("map")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
/** Centre tolerance for "re-centred" checks: 0.01 mile (about 16 m). */
const CENTRE_TOLERANCE_MILES = 0.01;
const recentredOn = (page: Page, p: number[]) =>
  expect
    .poll(async () => haversine(p, await centre(page)), { timeout: 10_000 })
    .toBeLessThan(CENTRE_TOLERANCE_MILES);

// Serial by default (a failure stops the run); PW_SERIAL=0 runs tests independently (each loads its own config).
test.describe.configure({
  mode: process.env.PW_SERIAL === "0" ? "default" : "serial",
});
type Cfg = {
  apiUrl: string;
  leadsApiUrl: string;
  apiToken: string;
  mapKey: string;
};
let cfgP: Promise<Cfg> | undefined;
/** The hosted /config.json (the only source of the API token and the map key), fetched once per worker. */
const config = (): Promise<Cfg> =>
  (cfgP ??= (async () => {
    const r = await (
      await request.newContext({ httpCredentials: CREDS })
    ).get(`${BASE_URL}/config.json`);
    if (r.status() !== 200) throw new Error(`config.json: HTTP ${r.status()}`);
    return (await r.json()) as Cfg;
  })());
const api = async () =>
  request.newContext({
    extraHTTPHeaders: { authorization: `Bearer ${(await config()).apiToken}` },
  });

test.describe("without credentials", () => {
  test("1. the site and config.json are 401", async () => {
    const anon = await request.newContext();
    expect((await anon.get(`${BASE_URL}/`)).status()).toBe(401);
    expect((await anon.get(`${BASE_URL}/config.json`)).status()).toBe(401);
  });
  test("2b. the https://user:pass@host/ URL form loads the map and data", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(); // no httpCredentials: the credentials are in the URL only
    const page = await ctx.newPage();
    await page.goto(
      `https://${encodeURIComponent(CREDS.username)}:${encodeURIComponent(CREDS.password)}@${new URL(BASE_URL).host}/?lat=${VN.lat}&lon=${VN.lon}&z=13`,
    );
    await ready(page);
    await page.getByTestId("map").click();
    await expect
      .poll(() => count(page), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await ctx.close();
  });
});

test.describe("with credentials", () => {
  test.use({ httpCredentials: CREDS });

  test("2-3. credentials are really sent: 200 where unauthenticated is 401; config.json has API URL, token, map key", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    expect((await page.goto("/"))?.status()).toBe(200);
    const res = await page.request.get("/config.json");
    expect(res.status()).toBe(200);
    // Same URL with no credentials at all (Node fetch: nothing inherited from Playwright options) is refused.
    expect((await fetch(`${BASE_URL}/config.json`)).status).toBe(401);
    const cfg = (await res.json()) as Cfg;
    expect(cfg.apiUrl).toMatch(
      /^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/,
    );
    expect(cfg.apiToken.length).toBeGreaterThanOrEqual(40);
    expect(cfg.mapKey.length).toBeGreaterThan(20);
    await expect(page.getByTestId("result-count")).toContainText("0 results");
    expect(errors).toEqual([]);
  });

  test("4. API: no header 401, wrong token 403, right token 200", async () => {
    const cfg = await config();
    const anon = await request.newContext();
    expect((await anon.get(trpc(cfg.apiUrl, "meta.info"))).status()).toBe(401);
    expect(
      (
        await anon.get(trpc(cfg.apiUrl, "meta.info"), {
          headers: { authorization: `Bearer wrong-${Date.now()}` },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await (await api()).get(trpc(cfg.apiUrl, "meta.info"))).status(),
    ).toBe(200);
  });

  test("4b. authorizer edge cases never give 500", async () => {
    const cfg = await config();
    const anon = await request.newContext();
    const nonce = Date.now(); // fresh header values: no authorizer cache hits from earlier runs
    const cases: Array<[string, string]> = [
      ["malformed (no scheme)", `garbage-${nonce}`],
      ["malformed (Bearer, no space)", `Bearer${nonce}`],
      [
        "wrong scheme (Basic)",
        `Basic ${Buffer.from(`x:${nonce}`).toString("base64")}`,
      ],
      ["oversized (8 KB token)", `Bearer ${"a".repeat(8000)}${nonce}`],
      ["empty token", "Bearer "],
    ];
    const results: Record<string, number> = {};
    for (const [label, value] of cases)
      results[label] = (
        await anon.get(trpc(cfg.apiUrl, "meta.info"), {
          headers: { authorization: value },
        })
      ).status();
    console.log("AUTHZ", JSON.stringify(results));
    for (const s of Object.values(results)) expect([401, 403]).toContain(s);
  });

  test("5. CORS allows the CRM origin only", async () => {
    const cfg = await config();
    const anon = await request.newContext();
    const pre = (origin: string) =>
      anon.fetch(trpc(cfg.apiUrl, "meta.info"), {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        },
      });
    expect((await pre(ORIGIN)).headers()["access-control-allow-origin"]).toBe(
      ORIGIN,
    );
    expect(
      (await pre("https://evil.example")).headers()[
        "access-control-allow-origin"
      ],
    ).toBeUndefined();
  });

  test("8. opens on LA County with live Amazon Location tiles (Referer-restricted key) and attribution", async ({
    page,
  }) => {
    const tiles: Array<{ url: string; status: number }> = [];
    page.on(
      "response",
      (r) =>
        r.url().includes(TILE_PATH) &&
        tiles.push({ url: r.url(), status: r.status() }),
    );
    await page.goto("/");
    await ready(page);
    await expect
      .poll(() => tiles.filter((t) => t.status === 200).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(tiles.filter((t) => t.status >= 400)).toEqual([]);
    // Wait for the centre attributes to exist (written on "load"), then check they are inside LA County.
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-center-lat",
      /^-?\d+\.\d+$/,
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-center-lon",
      /^-?\d+\.\d+$/,
      { timeout: 10_000 },
    );
    const [lat, lon] = await centre(page);
    expect(lat!).toBeGreaterThan(LA.south);
    expect(lat!).toBeLessThan(LA.north);
    expect(lon!).toBeGreaterThan(LA.west);
    expect(lon!).toBeLessThan(LA.east);
    await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
    // The key only works with the Amplify Referer (tiles loaded live, never stored).
    const anon = await request.newContext();
    expect(
      (
        await anon.get(tiles[0]!.url, { headers: { referer: `${ORIGIN}/` } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await anon.get(tiles[0]!.url, {
          headers: { referer: "https://evil.example/" },
        })
      ).status(),
    ).toBe(403);
    expect((await anon.get(tiles[0]!.url)).status()).toBe(403);
  });

  test("9. a dropped pin re-centres the map; the radius changes the circle and the results; results are inside the radius", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=12`);
    await ready(page);
    const box = (await page.getByTestId("map").boundingBox())!;
    await page.mouse.click(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 - 80,
    ); // off-centre drop
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      /^-?\d+\.\d+$/,
    );
    const pin = await pinOf(page);
    expect(haversine(pin, [VN.lat, VN.lon])).toBeGreaterThan(0.3); // the pin is where we clicked, not the old centre
    await recentredOn(page, pin); // the map re-centres on the pin (within CENTRE_TOLERANCE_MILES)

    // Radius 1 mile: results and a screenshot of the map (in memory only, never stored).
    await page.getByTestId("radius").fill("1");
    const at = (r: number) =>
      (async () =>
        (
          await (
            await api()
          ).get(
            trpc(cfg.apiUrl, "parcels.search", {
              lat: pin[0],
              lon: pin[1],
              radius_miles: r,
              threshold_years: 15,
            }),
          )
        ).json())();
    const n1 = (await at(1)).result.data.count;
    await settle(page, n1);
    await expect
      .poll(() => circleRadius(page), { timeout: 10_000 })
      .toBeCloseTo(1, 3); // the drawn circle
    await renderedFor(page, 12); // this search is drawn before the screenshot
    const shot1 = await page.getByTestId("map").screenshot();
    // Radius 5 miles: more results, the circle changes on screen.
    await page.getByTestId("radius").fill("5");
    await expect(page.getByTestId("radius-value")).toHaveText("5");
    const n5 = (await at(5)).result.data.count;
    await settle(page, n5);
    await expect
      .poll(() => circleRadius(page), { timeout: 10_000 })
      .toBeCloseTo(5, 3); // the drawn circle
    await renderedFor(page, 12); // this search is drawn before the screenshot
    const shot5 = await page.getByTestId("map").screenshot();
    console.log("RADIUS", JSON.stringify({ n1, n5 }));
    expect(n5).toBeGreaterThan(n1);
    expect(shot5.equals(shot1)).toBe(false);

    // Every listed result is inside the radius (server distance), and a spot check recomputed here.
    const dists = await Promise.all(
      (await page.getByTestId("result").all()).map((i, k) =>
        strictNum(i, "data-distance", `result #${k}`),
      ),
    );
    expect(dists.length).toBeGreaterThan(0);
    expect(Math.max(...dists)).toBeLessThanOrEqual(5);
    const pts = (
      await (
        await (
          await api()
        ).get(
          trpc(cfg.apiUrl, "parcels.points", {
            lat: pin[0],
            lon: pin[1],
            radius_miles: 5,
            threshold_years: 15,
          }),
        )
      ).json()
    ).result.data;
    expect(pts.count).toBe(n5);
    for (const i of [
      0,
      Math.floor(pts.id.length / 3),
      Math.floor((2 * pts.id.length) / 3),
      pts.id.length - 1,
    ])
      expect(haversine(pin, [pts.lat[i], pts.lon[i]])).toBeLessThanOrEqual(
        5.0001,
      );
  });

  test("9b. a click on an isolated point ON THE MAP (exactly, and 3 px off) opens its details", async ({
    page,
  }) => {
    const cfg = await config();
    const zoom = 17; // >= DETAIL_MIN_ZOOM (16)
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=${zoom}`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre (no points loaded yet)
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      /^-?\d+\.\d+$/,
    );
    const pin = await pinOf(page);
    await recentredOn(page, pin);
    const pts = (
      await (
        await (
          await api()
        ).get(
          trpc(cfg.apiUrl, "parcels.points", {
            lat: pin[0],
            lon: pin[1],
            radius_miles: 1,
            threshold_years: 15,
          }),
        )
      ).json()
    ).result.data;
    await settle(page, pts.count);
    await renderedFor(page, zoom); // the points of THIS search are drawn at THIS zoom
    const mapCentre = await centre(page);
    const px = pts.id.map((_: string, k: number) =>
      mercatorOffset(pts.lat[k], pts.lon[k], mapCentre, zoom),
    );
    const box = (await page.getByTestId("map").boundingBox())!;
    // Nearest on-screen point with no other point within the +/-6 px tolerance (isolated at this zoom).
    const onScreen = (k: number) =>
      Math.abs(px[k].dx) < box.width / 2 - 20 &&
      Math.abs(px[k].dy) < box.height / 2 - 20;
    const isolated = (k: number) =>
      px.every(
        (q: { dx: number; dy: number }, j: number) =>
          j === k ||
          Math.max(Math.abs(q.dx - px[k].dx), Math.abs(q.dy - px[k].dy)) > 12,
      );
    const i = pts.id.findIndex(
      (_: string, k: number) => onScreen(k) && isolated(k),
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const detailCalls = detailGets(page);
    const d = page.getByTestId("detail");
    // Exact click.
    await page.mouse.click(
      box.x + box.width / 2 + px[i].dx,
      box.y + box.height / 2 + px[i].dy,
    );
    await expect(d.locator('[data-field="parcel_id"]')).toHaveText(pts.id[i]);
    await expect(d.locator('[data-field="source_page_sha256"]')).toHaveText(
      /^[0-9a-f]{64}$/,
    );
    expect(await pinOf(page)).toEqual(pin); // the pin did not move
    expect(detailCalls).toHaveLength(1);
    await d.getByRole("button", { name: "Close" }).click();
    await expect(d).toHaveCount(0);
    // 3 px off the point's centre (inside the +/-6 px tolerance).
    await page.mouse.click(
      box.x + box.width / 2 + px[i].dx + 3,
      box.y + box.height / 2 + px[i].dy - 2,
    );
    await expect(d.locator('[data-field="parcel_id"]')).toHaveText(pts.id[i]);
    expect(await pinOf(page)).toEqual(pin); // the pin did not move
    expect(detailCalls).toHaveLength(2); // one GET per click
  });

  test("9c. at the zoom where the 5-mile circle fits, a click inside the slice drops the pin (no details)", async ({
    page,
  }) => {
    const cfg = await config();
    const zoom = 11; // 10 miles ~ 509 px: the 5-mile circle fits on screen
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=${zoom}`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre
    const pin = await pinOf(page);
    await recentredOn(page, pin);
    await page.getByTestId("radius").fill("5");
    const pts = (
      await (
        await (
          await api()
        ).get(
          trpc(cfg.apiUrl, "parcels.points", {
            lat: pin[0],
            lon: pin[1],
            radius_miles: 5,
            threshold_years: 15,
          }),
        )
      ).json()
    ).result.data;
    await settle(page, pts.count);
    await renderedFor(page, zoom); // the points of THIS search are drawn at THIS zoom
    const detailCalls = detailGets(page);
    // Click exactly on a point inside the slice, ~2 miles from the pin. It is taken from the drawn points
    // (the nearest max_points: at 15 years from Van Nuys they reach about 2.31 mi), so it is on the map.
    const k = pts.id.findIndex(
      (_: string, j: number) =>
        Math.abs(haversine(pin, [pts.lat[j], pts.lon[j]]) - 2) < 0.1,
    );
    expect(k).toBeGreaterThanOrEqual(0);
    const target = [pts.lat[k], pts.lon[k]];
    const { dx, dy } = mercatorOffset(
      target[0],
      target[1],
      await centre(page),
      zoom,
    );
    const box = (await page.getByTestId("map").boundingBox())!;
    await page.mouse.click(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
    );
    // The pin moves to the click (one pixel is ~32 m at zoom 11) and no details open.
    await expect
      .poll(async () => haversine(await pinOf(page), target), {
        timeout: 10_000,
      })
      .toBeLessThan(0.05);
    await recentredOn(page, await pinOf(page));
    // The app re-centres at the current zoom, so the zoom stays the one this test set.
    await renderedFor(page, zoom); // the new search (at the clicked pin) is drawn: everything the click caused has run
    expect(detailCalls).toEqual([]);
    await expect(page.getByTestId("detail")).toHaveCount(0);
  });

  test("10. GPS re-centres; the 15-year default and threshold 80 match the API and differ visibly on screen; count always visible", async ({
    browser,
  }) => {
    const cfg = await config();
    const ctx = await browser.newContext({
      httpCredentials: CREDS,
      geolocation: { latitude: VN.lat, longitude: VN.lon },
      permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`); // opens on LA County, far from the GPS point
    await ready(page);
    await page.getByTestId("gps").click();
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      VN.lat.toFixed(6),
    );
    await recentredOn(page, [VN.lat, VN.lon]); // the map re-centres on the GPS point (within CENTRE_TOLERANCE_MILES)
    await page.getByTestId("radius").fill("5");
    await expect(page.getByTestId("threshold")).toHaveValue("15"); // default
    const pin = await pinOf(page);
    const apiCount = async (years: number) =>
      (
        await (
          await (
            await api()
          ).get(
            trpc(cfg.apiUrl, "parcels.search", {
              lat: pin[0],
              lon: pin[1],
              radius_miles: 5,
              threshold_years: years,
            }),
          )
        ).json()
      ).result.data;
    const fmt = (n: number) => n.toLocaleString("en-US");
    // 15 years (default): the on-screen count equals the API count for the same inputs.
    const a15 = await apiCount(15);
    await settle(page, a15.count);
    await expect(page.getByTestId("result-count")).toHaveText(
      `${fmt(a15.count)} results`,
    );
    // The rule shown is the API's: roof age counts from the effective roof year.
    await expect(page.getByTestId("rule")).toHaveText(a15.rule.text);
    await expect(page.getByTestId("rule")).toContainText(
      `effective roof year before ${a15.rule.built_before_year}`,
    );
    // 80 years: same check, and the screen visibly changes.
    await page.getByTestId("threshold").fill("80");
    const a80 = await apiCount(80);
    await settle(page, a80.count);
    await expect(page.getByTestId("result-count")).toHaveText(
      `${fmt(a80.count)} results`,
    );
    await expect(page.getByTestId("rule")).toHaveText(a80.rule.text);
    await expect(page.getByTestId("rule")).toContainText(
      `effective roof year before ${a80.rule.built_before_year}`,
    );
    console.log(
      "THRESHOLD",
      JSON.stringify({ at15: a15.count, at80: a80.count }),
    );
    expect(a80.count).toBeGreaterThan(0);
    expect(a80.count).toBeLessThan(a15.count);
    expect(`${fmt(a80.count)} results`).not.toBe(`${fmt(a15.count)} results`); // visibly different
    for (const y of await Promise.all(
      (await page.getByTestId("result").all()).map((i) => i.innerText()),
    ))
      expect(Number(/roof year (\d{4})/.exec(y)![1])).toBeLessThan(
        a80.rule.built_before_year,
      );
    await page.getByTestId("threshold").fill("120");
    await expect
      .poll(async () => (await count(page)) <= (await apiCount(80)).count)
      .toBe(true);
    await page
      .getByTestId("results")
      .evaluate((el) => el.scrollIntoView({ block: "end" }));
    await expect(page.getByTestId("result-count")).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("result-count")).toBeInViewport();
    await ctx.close();
  });

  test("12. details on click, with source; no owner or contact fields", async ({
    page,
  }) => {
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click();
    await page.getByTestId("result").first().click();
    const d = page.getByTestId("detail");
    await expect(d.locator('[data-field="parcel_id"]')).toHaveText(/^\d{10}$/);
    await expect(d.locator('[data-field="source_request_url"]')).toContainText(
      "https://services.arcgis.com/",
    );
    await expect(d.locator('[data-field="source_page_sha256"]')).toHaveText(
      /^[0-9a-f]{64}$/,
    );
    await expect(d.locator('[data-field="roof_age_basis"]')).toContainText(
      "PROXY",
    );
    // The page shows no owner or contact field. Only the lead editor's notes hint ("No owner names or
    // contact details…") names them, so only that one element is left out of this check.
    const text = await page.locator("body").evaluate((b) => {
      const c = b.cloneNode(true) as HTMLElement;
      c.querySelector('[data-testid="lead-notes-hint"]')?.remove();
      return c.textContent ?? "";
    });
    expect(text).not.toMatch(/owner name|mailing address|phone|e-?mail/i);
  });

  test("13. future sections are disabled placeholders (permit sections are no longer among them)", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.getByTestId("future");
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: /permit/i })).toHaveCount(0);
    for (const c of await cards.all()) {
      await expect(c).toHaveAttribute("aria-disabled", "true");
      await expect(c.getByRole("button")).toBeDisabled();
    }
  });

  test("14. map points payload is compact: at most max_points points, truncated when the count is larger", async () => {
    const cfg = await config();
    const res = await (
      await api()
    ).get(
      trpc(cfg.apiUrl, "parcels.points", {
        ...VN,
        radius_miles: 5,
        threshold_years: 15,
      }),
    );
    const body = await res.body();
    const data = JSON.parse(body.toString()).result.data;
    console.log(
      "POINTS",
      JSON.stringify({
        bytes: body.length,
        count: data.count,
        drawn: data.id.length,
        perPoint: +(body.length / data.id.length).toFixed(1),
      }),
    );
    expect(data.id).toHaveLength(Math.min(data.count, data.max_points));
    expect(data.lat).toHaveLength(data.id.length);
    expect(data.truncated).toBe(data.count > data.max_points);
    // Measured 819,810 B for 25,000 points (about 33 B each); 40 B per point leaves room for longer
    // coordinates and stays well under the API's 3,000,000 B guard.
    expect(body.length).toBeLessThan(40 * data.max_points);
  });

  test("14b. at 10 miles the map draws the nearest max_points and says so; the data notice names the served run", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=12`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre
    const pin = await pinOf(page);
    await page.getByTestId("radius").fill("10");
    const get = async (proc: string, input?: unknown) =>
      (await (await (await api()).get(trpc(cfg.apiUrl, proc, input))).json())
        .result.data;
    const pts = await get("parcels.points", {
      lat: pin[0],
      lon: pin[1],
      radius_miles: 10,
      threshold_years: 15,
    });
    expect(pts.truncated).toBe(true);
    await settle(page, pts.count);
    const n = (x: number) => x.toLocaleString("en-US");
    await expect(page.getByTestId("points-truncated")).toHaveText(
      `Map shows the nearest ${n(pts.max_points)} of ${n(pts.count)} matching parcels; the count and the list cover all ${n(pts.count)}.`,
    );
    const { run } = await get("explorer.runSummary");
    await expect(page.getByTestId("data-parcels")).toHaveText(
      n(run.row_counts.parquet),
    );
    await expect(page.getByTestId("data-notice")).not.toContainText("pilot");
  });
  test("15. leads API: no header 401, wrong token 403, CRM token 200", async () => {
    const cfg = await config();
    expect(cfg.leadsApiUrl).toMatch(
      /^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/,
    );
    const anon = await request.newContext();
    const url = trpc(cfg.leadsApiUrl, "leads.list", { limit: 1 });
    expect((await anon.get(url)).status()).toBe(401);
    expect(
      (
        await anon.get(url, {
          headers: { authorization: `Bearer wrong-${Date.now()}` },
        })
      ).status(),
    ).toBe(403);
    expect((await (await api()).get(url)).status()).toBe(200);
  });

  test("16. leads CORS: GET and POST from the CRM origin only", async () => {
    const cfg = await config();
    const anon = await request.newContext();
    const pre = (origin: string, method: string) =>
      anon.fetch(`${cfg.leadsApiUrl}/trpc/leads.create`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
    const ok = (await pre(ORIGIN, "POST")).headers();
    expect(ok["access-control-allow-origin"]).toBe(ORIGIN);
    expect(ok["access-control-allow-methods"]?.toUpperCase()).toContain("POST");
    expect(
      (await pre("https://evil.example", "POST")).headers()[
        "access-control-allow-origin"
      ],
    ).toBeUndefined();
  });

  test("17. create a lead, reload, update it, reload, delete it (the test's own lead is always deleted)", async ({
    page,
  }) => {
    const cfg = await config();
    const leadsApi = await api();
    const get = async (id: string) =>
      (
        await (
          await leadsApi.get(
            trpc(cfg.leadsApiUrl, "leads.get", { parcel_id: id }),
          )
        ).json()
      ).result.data as {
        status: string;
        notes: string;
        updated_at: string;
        created_at: string;
      } | null;
    /** The parcel IDs of all leads, read across every page via next_cursor (read-only). */
    const listAll = async () => {
      const all: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 1000; i++) {
        const r = await leadsApi.get(
          trpc(cfg.leadsApiUrl, "leads.list", { limit: 100, cursor }),
        );
        if (r.status() !== 200)
          throw new Error(`leads.list: HTTP ${r.status()}`);
        const p = (await r.json()).result.data as {
          items: { parcel_id: string }[];
          next_cursor: string | null;
        };
        all.push(...p.items.map((l) => l.parcel_id));
        if (!p.next_cursor) return all;
        cursor = p.next_cursor;
      }
      throw new Error("leads.list: next_cursor did not end after 1,000 pages");
    };
    // A parcel near Van Nuys without a lead (existing leads are never touched).
    const existing = new Set(await listAll());
    console.log(`leads before: ${existing.size}`);
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre
    await expect(page.getByTestId("result").first()).toBeVisible({
      timeout: 20_000,
    });
    const ids = await page
      .getByTestId("result")
      .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    expect(ids.length).toBeGreaterThan(0);
    let index = -1;
    let parcel = "";
    for (let i = 0; i < ids.length && index < 0; i++) {
      await page.getByTestId("result").nth(i).click();
      const id = (await page
        .getByTestId("detail")
        .locator('[data-field="parcel_id"]')
        .textContent())!;
      if (!existing.has(id) && (await get(id)) === null) {
        index = i;
        parcel = id;
      }
    }
    expect(parcel).toMatch(/^\d{10}$/);
    const openLead = async () => {
      await page.getByTestId("result").nth(index).click();
      await expect(page.getByTestId("lead")).toHaveAttribute(
        "data-parcel",
        parcel,
      );
    };
    /** Reload the page, pin the centre again and reopen the parcel: the lead is read back from the API. */
    const reloadAndReopen = async () => {
      await page.reload();
      await ready(page);
      await page.getByTestId("map").click();
      await expect(page.getByTestId("result").first()).toBeVisible({
        timeout: 20_000,
      });
      await openLead();
    };
    // Set right before the create click. The parcel had no lead when it was chosen, so from then on any lead
    // on it is the test's own, and cleanup needs no clock comparison.
    let createClicked = false;
    try {
      await openLead();
      await page.getByTestId("lead-notes").fill("Playwright test lead");
      createClicked = true;
      await page.getByTestId("lead-create").click();
      await expect(page.getByTestId("lead-save")).toBeVisible({
        timeout: 10_000,
      });
      const created = await get(parcel);
      expect(created).toMatchObject({
        status: "new",
        notes: "Playwright test lead",
      });

      // Reload between create and update: the lead is read back from the API, not from page state.
      await reloadAndReopen();
      await expect(page.getByTestId("lead-status")).toHaveValue("new");
      await expect(page.getByTestId("lead-notes")).toHaveValue(
        "Playwright test lead",
      );
      await expect(
        page.getByTestId("lead-item").filter({ hasText: parcel }),
      ).toHaveCount(1);
      await page.getByTestId("lead-status").selectOption("contacted");
      await page
        .getByTestId("lead-notes")
        .fill("Playwright test lead, contacted");
      await page.getByTestId("lead-save").click();
      await expect
        .poll(
          async () => {
            const l = await get(parcel);
            return l && { status: l.status, notes: l.notes };
          },
          { timeout: 10_000 },
        )
        .toEqual({
          status: "contacted",
          notes: "Playwright test lead, contacted",
        });

      // Reload again after the update: the edit is read back in the editor and in the list.
      await reloadAndReopen();
      await expect(page.getByTestId("lead-status")).toHaveValue("contacted");
      await expect(page.getByTestId("lead-notes")).toHaveValue(
        "Playwright test lead, contacted",
      );
      await expect(
        page.getByTestId("lead-item").filter({ hasText: parcel }),
      ).toContainText("contacted");

      await page.getByTestId("lead-delete").click();
      await expect(page.getByTestId("lead-create")).toBeVisible({
        timeout: 10_000,
      });
      expect(await get(parcel)).toBeNull();
    } finally {
      // Always delete this test's own lead once Create was clicked, also when a step above failed.
      const left = createClicked ? await get(parcel) : null;
      if (left)
        await leadsApi.post(`${cfg.leadsApiUrl}/trpc/leads.delete`, {
          data: { parcel_id: parcel, expected_updated_at: left.updated_at },
        });
      if (parcel) expect(await get(parcel)).toBeNull();
      // Evidence that nothing was left behind; a failed read here never hides the test's own error.
      await listAll().then(
        (all) => console.log(`leads after cleanup: ${all.length}`),
        (e: Error) =>
          console.log(`leads after cleanup: unknown (${e.message})`),
      );
    }
  });

  test("18. long-open permits: open days descending, re-sortable by distance; the count equals permits.longOpen for the same pin, radius, roof age and minimum", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre
    const pin = await pinOf(page);
    await page.getByTestId("radius").fill("5");
    await expect(page.getByTestId("radius-value")).toHaveText("5");
    await expect(page.getByTestId("threshold")).toHaveValue("15");
    await expect(page.getByTestId("permits-min-years")).toHaveValue("5");
    await expect(page.getByTestId("permits-max-years")).toHaveValue("");
    await expect(page.getByTestId("permits-rule")).toContainText(
      "at least 5 years (1,826 days)",
    );
    const longOpen = async (sort: string) =>
      (
        await (
          await (
            await api()
          ).get(
            trpc(cfg.apiUrl, "permits.longOpen", {
              lat: pin[0],
              lon: pin[1],
              radius_miles: 5,
              threshold_years: 15,
              min_open_days: 1826,
              sort,
              offset: 0,
              limit: 50,
            }),
          )
        ).json()
      ).result.data as {
        count: number;
        items: Array<{
          permit_number: string;
          open_days: number;
          distance_miles: number;
        }>;
      };
    const a = await longOpen("open_days");
    console.log("LONG_OPEN", JSON.stringify({ count: a.count }));
    expect(a.count).toBeGreaterThan(0);
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBe(a.count);
    const rows = page.getByTestId("permit-row");
    await expect(rows).toHaveCount(a.items.length);
    // Longest open first: data-open-days never increases down the list, and the first page is the API's
    // (the API breaks ties by permit_number, so the order is the API's exactly).
    const days = await Promise.all(
      (await rows.all()).map((r, k) =>
        strictNum(r, "data-open-days", `permit-row #${k}`),
      ),
    );
    for (let i = 1; i < days.length; i++)
      expect(days[i]!).toBeLessThanOrEqual(days[i - 1]!);
    expect(Math.min(...days)).toBeGreaterThanOrEqual(1826);
    expect(
      await rows.evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-permit")),
      ),
    ).toEqual(a.items.map((i) => i.permit_number));
    await expect(rows.first()).toHaveClass(/long-open/);
    // Nearest first: the same count; the distances are the API's for the same inputs, never decreasing, and
    // the rows are the API's in its order (ties by permit_number).
    await page.getByTestId("permits-sort").selectOption("distance");
    const near = await longOpen("distance");
    await expect
      .poll(
        async () =>
          (
            await rows.evaluateAll((els) =>
              els.map((e) => e.getAttribute("data-distance")),
            )
          ).join(","),
        { timeout: 20_000 },
      )
      .toBe(near.items.map((i) => String(i.distance_miles)).join(","));
    expect(
      await rows.evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-permit")),
      ),
    ).toEqual(near.items.map((i) => i.permit_number));
    expect(await attrNum(page, "permits-count", "data-count")).toBe(a.count);
    const dists = await Promise.all(
      (await rows.all()).map((r, k) =>
        strictNum(r, "data-distance", `permit-row #${k}`),
      ),
    );
    for (let i = 1; i < dists.length; i++)
      expect(dists[i]!).toBeGreaterThanOrEqual(dists[i - 1]!);
  });

  test("19. permit details of a parcel: number, status class, contractors or 'Contractor not published', BBB rating not available; never a description", async ({
    page,
  }) => {
    const cfg = await config();
    type Permits = {
      permit_data_available: boolean;
      permits: Array<{
        permit_number: string;
        permit_status_class: string;
        contractors: Array<{ license_identifier: string | null }>;
      }>;
      bbb: { available: boolean; reason: string };
    };
    const forParcel = async (id: string) => {
      const r = await (
        await api()
      ).get(trpc(cfg.apiUrl, "permits.forParcel", { parcel_id: id }));
      if (r.status() !== 200)
        throw new Error(`permits.forParcel: HTTP ${r.status()}`);
      return (await r.json()).result.data as Permits;
    };
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the centre (Van Nuys, City of Los Angeles)
    await expect(page.getByTestId("result").first()).toBeVisible({
      timeout: 20_000,
    });
    // The first listed parcel with at least one permit (taken from the API, not hard-coded).
    const d = page.getByTestId("detail");
    const n = await page.getByTestId("result").count();
    let parcel = "";
    let want: Permits | undefined;
    const idEl = d.locator('[data-field="parcel_id"]');
    let prev = "";
    for (let i = 0; i < n && !want; i++) {
      await page.getByTestId("result").nth(i).click();
      // Each row is another parcel: wait until the detail shows the clicked one, not the previous one.
      await expect(idEl).toHaveText(/^\d{10}$/);
      if (prev) await expect(idEl).not.toHaveText(prev);
      const id = (await idEl.textContent())!;
      prev = id;
      const got = await forParcel(id);
      if (got.permits.length > 0) {
        parcel = id;
        want = got;
      }
    }
    expect(want, "a listed parcel with permits").toBeDefined();
    console.log(
      "PARCEL_PERMITS",
      JSON.stringify({ parcel, permits: want!.permits.length }),
    );
    // The API serves no description field at all (source_status_desc is LADBS's status, not a description).
    const keys = (v: unknown): string[] =>
      v && typeof v === "object"
        ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)])
        : [];
    expect(
      keys(want).filter((k) => /desc/i.test(k) && k !== "source_status_desc"),
    ).toEqual([]);
    expect(want!.bbb.available).toBe(false);

    await expect(idEl).toHaveText(parcel);
    const section = d.getByTestId("parcel-permits");
    const shown = section.getByTestId("parcel-permit");
    await expect(shown).toHaveCount(want!.permits.length, { timeout: 20_000 });
    const first = shown.first();
    const p0 = want!.permits[0]!;
    await expect(first.getByTestId("permit-number")).toHaveText(
      p0.permit_number,
    );
    await expect(first.getByTestId("permit-status-class")).toHaveAttribute(
      "data-class",
      p0.permit_status_class,
    );
    await expect(first.getByTestId("permit-status-class")).not.toBeEmpty();
    if (p0.contractors.length === 0)
      await expect(first.getByTestId("contractor-not-published")).toHaveText(
        "Contractor not published",
      );
    else
      await expect(first.getByTestId("contractor-license").first()).toHaveText(
        p0.contractors[0]!.license_identifier ?? "—",
      );
    await expect(section.getByTestId("bbb-rating")).toHaveText(
      `not available (${want!.bbb.reason})`,
    );
    await expect(section).not.toContainText("Permits unavailable");
  });
});
