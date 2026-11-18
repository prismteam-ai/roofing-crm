import {
  expect,
  request,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { AnswerResponse } from "../src/agent-types.ts";
import {
  ANSWERED,
  CITED_PARCEL,
  FOLLOW_UP,
  QUESTION_1,
  QUESTION_2,
  REFUSED,
  STANDING_GAPS,
  STOPPED,
} from "./agent-fixtures.ts";
import { BASE_URL, CREDS, ORIGIN } from "./env.ts";
import {
  expectLayout,
  LAYOUT_BREAKPOINTS,
  openLayout,
  PERMIT_CHOICE_TEXTS,
} from "./layout-checks.ts";
import { dateOnly } from "../src/dates.ts";

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
const mapCenter = async (page: Page) => [
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
/** The app's search key for the inputs currently set: pin (5 decimals, as in data-pin-*), radius, threshold. */
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
  // The zoom is compared as a number to 6 decimals: MapLibre's zoom can carry float drift after a re-center.
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
/** Web Mercator pixel of a point relative to the map center (MapLibre: 512 px tiles). */
const mercatorOffset = (
  lat: number,
  lon: number,
  center: number[],
  zoom: number,
) => {
  const world = 512 * 2 ** zoom;
  const x = (lo: number) => ((lo + 180) / 360) * world;
  const y = (la: number) =>
    ((1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / Math.PI) /
      2) *
    world;
  return { dx: x(lon) - x(center[1]!), dy: y(lat) - y(center[0]!) };
};
const settle = (page: Page, n: number) =>
  expect.poll(() => count(page), { timeout: 20_000 }).toBe(n);
const ready = (page: Page) =>
  expect(page.getByTestId("map")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
/**
 * The notes every lead a test creates starts with. A suite edits or deletes only a lead it created: one it
 * created itself (the create answered 200, or Create was clicked on a parcel that had no lead) and that carries
 * these notes. Another user's lead on the same parcel never matches, so cleanup never touches it.
 */
const OWN_LEAD_NOTES = "Playwright test lead";
const isOwnLead = (l: { notes: string } | null): l is { notes: string } =>
  !!l && l.notes.startsWith(OWN_LEAD_NOTES);
/** Opens a details element (a list or the agent's Sources) by a click on its summary, as a user does. */
const expand = async (details: Locator) => {
  await expect(details).toBeAttached({ timeout: 20_000 });
  if (!(await details.evaluate((e) => (e as HTMLDetailsElement).open)))
    await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
};
/** Opens the results list (closed until opened). */
const openResults = (page: Page) => expand(page.getByTestId("results-details"));
/** Center tolerance for "re-centered" checks: 0.01 mile (about 16 m). */
const CENTER_TOLERANCE_MILES = 0.01;
const recenteredOn = (page: Page, p: number[]) =>
  expect
    .poll(async () => haversine(p, await mapCenter(page)), { timeout: 10_000 })
    .toBeLessThan(CENTER_TOLERANCE_MILES);

/**
 * The inputs of the GET requests to a data API procedure, in order (batched calls included: the path lists the
 * procedures and the input is keyed by position).
 */
const trpcInputs = (page: Page, proc: string) => {
  const inputs: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() !== "GET" || !u.pathname.startsWith("/trpc/")) return;
    const i = u.pathname.slice("/trpc/".length).split(",").indexOf(proc);
    if (i < 0) return;
    const input = JSON.parse(u.searchParams.get("input") ?? "{}");
    inputs.push(u.searchParams.has("batch") ? input[i] : input);
  });
  return inputs;
};
/**
 * Empties a field with the keyboard (it must stay empty), then types the text key by key (it must show exactly
 * that: before, a cleared field showed 1 again and "20" came out as "120").
 */
const retype = async (field: Locator, text: string) => {
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.press("Backspace");
  await expect(field).toHaveValue("");
  await field.pressSequentially(text);
  await expect(field).toHaveValue(text);
};
/**
 * The words of an element's text that the browser split over two lines although they fit on one line of the
 * element (a token longer than the line, such as a URL or a hash, may break). A hyphen ends a word: a break
 * after the hyphen of "stand-in" is a normal break.
 */
const splitWords = (el: Locator, word = "[^\\s-]+-?") =>
  el.evaluate((node, word) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t as Text;
      for (const m of text.data.matchAll(new RegExp(word, "g"))) {
        const r = document.createRange();
        r.setStart(text, m.index);
        r.setEnd(text, m.index + m[0].length);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0);
        const lines = new Set(rects.map((x) => Math.round(x.top)));
        const width = rects.reduce((w, x) => w + x.width, 0);
        if (lines.size > 1 && width <= (node as HTMLElement).clientWidth)
          out.push(m[0]);
      }
    }
    return out;
  }, word);
/** The number of lines an element's text takes. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    return new Set(
      [...r.getClientRects()]
        .filter((x) => x.width > 0)
        .map((x) => Math.round(x.top)),
    ).size;
  });

// Serial by default (a failure stops the run); PW_SERIAL=0 runs tests independently (each loads its own config).
test.describe.configure({
  mode: process.env.PW_SERIAL === "0" ? "default" : "serial",
});

/**
 * HARD RULE: no test ever sends a real request to /agent/answer (it would be a model call). Every browser context
 * gets this catch-all: a request to /agent/answer that no test mock answered is aborted and fails the test.
 * (A test's own page.route takes precedence over this context route.) The panel may call the real /agent/warm.
 */
const unmockedAnswers: string[] = [];
async function guardAgentAnswer(ctx: BrowserContext) {
  await ctx.route("**/agent/answer", async (route) => {
    unmockedAnswers.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    await route.abort("blockedbyclient");
  });
}
test.beforeEach(async ({ context }) => {
  unmockedAnswers.length = 0;
  await guardAgentAnswer(context);
});
test.afterEach(() => {
  expect(unmockedAnswers, "requests to /agent/answer without a mock").toEqual(
    [],
  );
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
    await guardAgentAnswer(ctx);
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

  test("3b. the site's own favicon: /favicon.ico (16 and 32 px) and /favicon.svg are served and linked", async ({
    page,
  }) => {
    const ico = await page.request.get("/favicon.ico");
    expect(ico.status()).toBe(200);
    const b = await ico.body();
    expect([...b.subarray(0, 6)]).toEqual([0, 0, 1, 0, 2, 0]); // an icon with two images
    const svg = await page.request.get("/favicon.svg");
    expect(svg.status()).toBe(200);
    expect(await svg.text()).toMatch(/^<svg /);
    await page.goto("/");
    expect(
      await page
        .locator('link[rel="icon"]')
        .evaluateAll((ls) => ls.map((l) => l.getAttribute("href"))),
    ).toEqual(["/favicon.ico", "/favicon.svg"]);
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
    // Wait for the center attributes to exist (written on "load"), then check they are inside LA County.
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
    const [lat, lon] = await mapCenter(page);
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

  test("9. a dropped pin re-centers the map; the radius changes the circle and the results; results are inside the radius", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=12`);
    await ready(page);
    const box = (await page.getByTestId("map").boundingBox())!;
    await page.mouse.click(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 - 80,
    ); // off-center drop
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      /^-?\d+\.\d+$/,
    );
    const pin = await pinOf(page);
    expect(haversine(pin, [VN.lat, VN.lon])).toBeGreaterThan(0.3); // the pin is where we clicked, not the old center
    await recenteredOn(page, pin); // the map re-centers on the pin (within CENTER_TOLERANCE_MILES)

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
    await page.getByTestId("map").click(); // pin at the center (no points loaded yet)
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      /^-?\d+\.\d+$/,
    );
    const pin = await pinOf(page);
    await recenteredOn(page, pin);
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
    const mapCenterNow = await mapCenter(page);
    const px = pts.id.map((_: string, k: number) =>
      mercatorOffset(pts.lat[k], pts.lon[k], mapCenterNow, zoom),
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
    // 3 px off the point's center (inside the +/-6 px tolerance).
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
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await recenteredOn(page, pin);
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
      await mapCenter(page),
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
    await recenteredOn(page, await pinOf(page));
    // The app re-centers at the current zoom, so the zoom stays the one this test set.
    await renderedFor(page, zoom); // the new search (at the clicked pin) is drawn: everything the click caused has run
    expect(detailCalls).toEqual([]);
    await expect(page.getByTestId("detail")).toHaveCount(0);
  });

  test("10. GPS re-centers; the 15-year default and threshold 80 match the API and differ visibly on screen; count always visible", async ({
    browser,
  }) => {
    const cfg = await config();
    const ctx = await browser.newContext({
      httpCredentials: CREDS,
      geolocation: { latitude: VN.lat, longitude: VN.lon },
      permissions: ["geolocation"],
    });
    await guardAgentAnswer(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/`); // opens on LA County, far from the GPS point
    await ready(page);
    await page.getByTestId("gps").click();
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      VN.lat.toFixed(5),
    );
    await recenteredOn(page, [VN.lat, VN.lon]); // the map re-centers on the GPS point (within CENTER_TOLERANCE_MILES)
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
    await openResults(page);
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
    await openResults(page);
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
    // Yes or no for true or false, and dates without the time part.
    await expect(
      d.locator('[data-field="owner_unchanged_10y_proxy"]'),
    ).toHaveText(/^(yes|no|—)$/);
    await expect(d.locator('[data-field="last_recording_date"]')).toHaveText(
      /^(\d{4}-\d{2}-\d{2}|—)$/,
    );
    await expect(d.locator('[data-field="source_retrieved_at"]')).toHaveText(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    for (const dd of await d.locator("dd").all())
      await expect(dd).not.toHaveText(/^(true|false)$|T\d{2}:\d{2}/);
    // The page shows no owner or contact field. Only the lead editor's notes hint ("No owner names or
    // contact details…") names them, so only that one element is left out of this check.
    const text = await page.locator("body").evaluate((b) => {
      const c = b.cloneNode(true) as HTMLElement;
      c.querySelector('[data-testid="lead-notes-hint"]')?.remove();
      return c.textContent ?? "";
    });
    expect(text).not.toMatch(/owner name|mailing address|phone|e-?mail/i);
  });

  test("13. future sections are disabled placeholders (permit sections and the agent are no longer among them)", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.getByTestId("future");
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: /permit/i })).toHaveCount(0);
    await expect(cards.filter({ hasText: /agent|RAG/i })).toHaveCount(0);
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
    await page.getByTestId("map").click(); // pin at the center
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
    // Beside the results badge: the legend's long-open count, "of the M drawn" (the points are truncated).
    const ptsLongOpen = await get("parcels.points", {
      lat: pin[0],
      lon: pin[1],
      radius_miles: 10,
      threshold_years: 15,
      min_open_days: 1826,
    });
    const marked = (ptsLongOpen.long_open_permit as number[]).reduce(
      (x, y) => x + y,
      0,
    );
    await expect(page.getByTestId("legend-long-open")).toHaveAttribute(
      "data-count",
      String(marked),
      { timeout: 20_000 },
    );
    if (marked > 0)
      await expect(page.getByTestId("result-long-open")).toHaveText(
        `${n(marked)} of the ${n(ptsLongOpen.id.length)} drawn with a long-open roofing permit (open at least 1,826 days)`,
      );
    else await expect(page.getByTestId("result-long-open")).toHaveCount(0);
    const { run } = await get("explorer.runSummary");
    await expect(page.getByTestId("data-parcels")).toHaveText(
      n(run.row_counts.parquet),
    );
    await expect(page.getByTestId("data-notice")).not.toContainText("pilot");
  });
  test("14c. when more parcels match than are drawn, a dashed ring at the farthest drawn point says how many lie at or beyond it; no ring when all are drawn (read only: no lead is touched)", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=12`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    const points = async (radius_miles: number) =>
      (
        await (
          await (
            await api()
          ).get(
            trpc(cfg.apiUrl, "parcels.points", {
              lat: pin[0],
              lon: pin[1],
              radius_miles,
              threshold_years: 15,
            }),
          )
        ).json()
      ).result.data as {
        count: number;
        id: string[];
        lat: number[];
        lon: number[];
        truncated: boolean;
      };
    const n = (x: number) => x.toLocaleString("en-US");

    // 1 mile: every match is drawn, no ring and no label.
    await page.getByTestId("radius").fill("1");
    const small = await points(1);
    expect(small.truncated).toBe(false);
    await settle(page, small.count);
    await expect(page.getByTestId("points-beyond")).toHaveCount(0);
    await expect(page.getByTestId("map")).not.toHaveAttribute(
      "data-beyond-ring-miles",
    );

    // 10 miles: truncated; the ring is at the farthest drawn point, the label counts the rest.
    await page.getByTestId("radius").fill("10");
    const pts = await points(10);
    expect(pts.truncated).toBe(true);
    await settle(page, pts.count);
    const farthest = pts.lat.reduce(
      (m, la, i) => Math.max(m, haversine(pin, [la, pts.lon[i]!])),
      0,
    );
    await expect
      .poll(() => attrNum(page, "map", "data-beyond-ring-miles"), {
        timeout: 20_000,
      })
      .toBeCloseTo(farthest, 2);
    const notDrawn = pts.count - pts.id.length;
    const label = page.getByTestId("points-beyond");
    await expect(label).toHaveAttribute("data-not-drawn", String(notDrawn));
    const text = (await label.textContent()) ?? "";
    const m = new RegExp(
      `^${n(notDrawn)} matching parcels? not drawn: at or beyond the dashed ring, (\\d+\\.\\d\\d) mi from the pin\\.$`,
    ).exec(text);
    expect(m, `label: "${text}"`).not.toBeNull();
    // The distance shown is the ring's, rounded down (so ties at that distance are covered).
    const shown = Number(m![1]);
    expect(shown).toBeLessThanOrEqual(farthest);
    expect(shown).toBeGreaterThan(farthest - 0.011);
    console.log("BEYOND", JSON.stringify({ farthest, notDrawn, text }));
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
    await page.getByTestId("map").click(); // pin at the center
    await openResults(page);
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
    /** Reload the page, pin the center again and reopen the parcel: the lead is read back from the API. */
    const reloadAndReopen = async () => {
      await page.reload();
      await ready(page);
      await page.getByTestId("map").click();
      await openResults(page);
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
      await page.getByTestId("lead-notes").fill(OWN_LEAD_NOTES);
      createClicked = true;
      await page.getByTestId("lead-create").click();
      await expect(page.getByTestId("lead-save")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("lead-created")).toHaveText("Lead created");
      const created = await get(parcel);
      expect(created).toMatchObject({
        status: "new",
        notes: "Playwright test lead",
      });
      // The stored lead holds no address: the list looks it up at display time (parcels.detail).
      expect(Object.keys(created!)).not.toContain("address");
      const address = (await page
        .getByTestId("detail")
        .locator('[data-field="address"]')
        .textContent())!;

      // Reload between create and update: the lead is read back from the API, not from page state.
      await reloadAndReopen();
      await expect(page.getByTestId("lead-status")).toHaveValue("new");
      await expect(page.getByTestId("lead-notes")).toHaveValue(
        "Playwright test lead",
      );
      await expect(
        page.getByTestId("lead-item").filter({ hasText: parcel }),
      ).toHaveCount(1);
      // Opened, the list shows the parcel's address under its ID (when the parcel has one).
      await expand(page.getByTestId("leads-details"));
      const item = page.getByTestId("lead-item").filter({ hasText: parcel });
      await expect(item.getByTestId("lead-parcel")).toHaveText(parcel);
      if (address !== "—")
        await expect(item.getByTestId("lead-address")).toHaveText(address, {
          timeout: 20_000,
        });
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

      // Delete asks in the page first: Cancel leaves the lead; "Delete lead" deletes it.
      await page.getByTestId("lead-delete").click();
      await expect(page.getByTestId("lead-delete-confirmation")).toContainText(
        "Delete the lead for this parcel? This cannot be undone.",
      );
      await page.getByTestId("lead-delete-cancel").click();
      await expect(page.getByTestId("lead-delete-confirmation")).toHaveCount(0);
      expect(await get(parcel)).toMatchObject({ status: "contacted" });
      await page.getByTestId("lead-delete").click();
      await page.getByTestId("lead-delete-confirm").click();
      await expect(page.getByTestId("lead-create")).toBeVisible({
        timeout: 10_000,
      });
      expect(await get(parcel)).toBeNull();
    } finally {
      // Always delete this test's own lead once Create was clicked, also when a step above failed; a lead
      // without this test's notes is another user's (created between the check and the click) and is left alone.
      const left = createClicked ? await get(parcel) : null;
      if (isOwnLead(left))
        await leadsApi.post(`${cfg.leadsApiUrl}/trpc/leads.delete`, {
          data: { parcel_id: parcel, expected_updated_at: left.updated_at },
        });
      if (parcel && (!left || isOwnLead(left)))
        expect(await get(parcel)).toBeNull();
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
    await page.getByTestId("map").click(); // pin at the center
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
    await page.getByTestId("map").click(); // pin at the center (Van Nuys, City of Los Angeles)
    await openResults(page);
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

  test("20. the map highlights parcels with a long-open roofing permit; the legend count equals parcels.points' long_open_permit sum for the same pin, radius, roof age and window", async ({
    page,
  }) => {
    const cfg = await config();
    const zoom = 13;
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=${zoom}`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await page.getByTestId("radius").fill("5");
    await expect(page.getByTestId("radius-value")).toHaveText("5");
    await expect(page.getByTestId("threshold")).toHaveValue("15");
    const points = async (days: object) =>
      (
        await (
          await (
            await api()
          ).get(
            trpc(cfg.apiUrl, "parcels.points", {
              lat: pin[0],
              lon: pin[1],
              radius_miles: 5,
              threshold_years: 15,
              ...days,
            }),
          )
        ).json()
      ).result.data as {
        id: string[];
        long_open_permit: number[];
        long_open: { min_open_days: number; max_open_days: number | null };
      };
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const n = (x: number) => x.toLocaleString("en-US");
    const legend = page.getByTestId("legend-long-open");
    const legendCount = () =>
      strictNum(legend, "data-count", "[data-testid=legend-long-open]");
    const badge = page.getByTestId("result-long-open");
    /** The count beside the results badge: the legend's number, as attribute and as text. */
    const badgeEqualsLegend = async (n: number) => {
      await expect
        .poll(
          () =>
            strictNum(badge, "data-count", "[data-testid=result-long-open]"),
          { timeout: 20_000 },
        )
        .toBe(n);
      await expect(page.getByTestId("result-long-open-count")).toHaveText(
        (await page.getByTestId("legend-long-open-count").textContent())!,
      );
    };

    // Default window: at least 1,826 days, no maximum (the long-open list's).
    const a = await points({ min_open_days: 1826 });
    expect(a.long_open).toEqual({ min_open_days: 1826, max_open_days: null });
    const nA = sum(a.long_open_permit);
    console.log(
      "HIGHLIGHT",
      JSON.stringify({ drawn: a.id.length, highlighted: nA }),
    );
    expect(nA).toBeGreaterThan(0);
    await expect(legend).toHaveAttribute("data-window", "1826|", {
      timeout: 20_000,
    });
    await expect.poll(legendCount, { timeout: 20_000 }).toBe(nA);
    await expect(legend).toContainText(
      `(open at least 1,826 days): ${n(nA)} of the ${n(a.id.length)} parcels drawn`,
    );
    // One line under it: why parcels with a long-open permit can exceed the permits listed.
    await expect(page.getByTestId("legend-building-note")).toHaveText(
      "A building-level permit counts on each of its units, so parcels with a long-open permit can exceed the permits listed.",
    );
    await badgeEqualsLegend(nA);
    await expect(badge).toHaveAttribute("data-window", "1826|");
    await renderedFor(page, zoom); // this search is drawn
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-rendered-long-open",
      "1826|",
    );

    // A maximum of 10 years (3,653 days): the highlight follows the list's window.
    await page.getByTestId("permits-max-years").fill("10");
    const b = await points({ min_open_days: 1826, max_open_days: 3653 });
    expect(b.long_open).toEqual({ min_open_days: 1826, max_open_days: 3653 });
    const nB = sum(b.long_open_permit);
    console.log("HIGHLIGHT_MAX_10Y", JSON.stringify({ highlighted: nB }));
    expect(nB).toBeLessThanOrEqual(nA);
    await expect(legend).toHaveAttribute("data-window", "1826|3653", {
      timeout: 20_000,
    });
    await expect.poll(legendCount, { timeout: 20_000 }).toBe(nB);
    await expect(legend).toContainText("(open 1,826 to 3,653 days)");
    if (nB > 0) {
      await badgeEqualsLegend(nB);
      await expect(badge).toContainText("(open 1,826 to 3,653 days)");
    } else await expect(badge).toHaveCount(0);
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-rendered-long-open",
      "1826|3653",
      { timeout: 20_000 },
    );
  });

  test("21. a long-open roofing permit row opens its parcel's detail (the item's parcel_id from permits.longOpen)", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await page.getByTestId("radius").fill("5");
    await expect(page.getByTestId("radius-value")).toHaveText("5");
    const lo = (
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
            sort: "open_days",
            offset: 0,
            limit: 50,
          }),
        )
      ).json()
    ).result.data as {
      count: number;
      items: Array<{
        permit_number: string;
        parcel_id: string;
        building_level: boolean;
      }>;
    };
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBe(lo.count);
    // The first row that is not building-level (a building-level row opens its nearest unit).
    const i = lo.items.findIndex((x) => !x.building_level);
    expect(i).toBeGreaterThanOrEqual(0);
    const want = lo.items[i]!;
    console.log(
      "ROW_OPENS",
      JSON.stringify({ row: i, parcel: want.parcel_id }),
    );
    await expand(page.getByTestId("permits-details"));
    const row = page.getByTestId("permit-row").nth(i);
    await expect(row).toHaveAttribute("data-permit", want.permit_number);
    await expect(row).toHaveAttribute("data-parcel", want.parcel_id);
    const detailCalls = detailGets(page);
    await row.click();
    const d = page.getByTestId("detail");
    await expect(d.locator('[data-field="parcel_id"]')).toHaveText(
      want.parcel_id,
    );
    expect(detailCalls).toHaveLength(1);
    expect(await pinOf(page)).toEqual(pin); // the pin did not move
    // The parcel's permits include the row's permit, marked long-open.
    const mine = d
      .getByTestId("parcel-permits")
      .locator(`[data-permit="${want.permit_number}"]`);
    await expect(mine).toHaveCount(1, { timeout: 20_000 });
    await expect(mine).toHaveAttribute("data-long-open", "true");
  });

  test("22. the list is 'Long-open roofing permits' with roofing work only; the data notice states the permit coverage from explorer.runSummary; no 'not harvested' text", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    const n = (x: number) => x.toLocaleString("en-US");
    const { run } = (
      await (
        await (await api()).get(trpc(cfg.apiUrl, "explorer.runSummary"))
      ).json()
    ).result.data;
    const pd = run.coverage.permit_data as {
      parcels_with_permit_data: number;
      parcels_with_permits: number;
    };
    console.log("PERMIT_COVERAGE", JSON.stringify(pd));
    await expect(page.getByTestId("data-permit-parcels")).toHaveText(
      n(pd.parcels_with_permit_data),
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("data-permit-coverage")).toHaveText(
      `Permit coverage: LADBS building permits, City of Los Angeles only: ${n(pd.parcels_with_permit_data)} of the ${n(run.row_counts.parquet)} parcels have permit data (${n(pd.parcels_with_permits)} with at least one permit).`,
    );
    await expect(page.getByTestId("leads-permit-filter-note")).toContainText(
      "by a long-open roofing permit in the map's open-duration window",
    );
    await expect(page.getByTestId("leads-filters-help")).not.toHaveAttribute(
      "open",
      /.*/,
    );
    await expect(page.getByTestId("leads-permit-filter")).toBeEnabled();
    await expect(
      page.getByTestId("leads-permit-filter-label"),
    ).not.toContainText("not available yet");
    // Before a pin, "Leads in this search" is greyed and says it needs one.
    await expect(page.getByTestId("leads-in-search")).toBeDisabled();
    await expect(page.getByTestId("leads-in-search-label")).toHaveClass(
      "unavailable",
    );
    await expect(page.getByTestId("leads-in-search-needs-pin")).toHaveText(
      " (needs a pin on the map first)",
    );

    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await expect(page.getByTestId("leads-in-search")).toBeEnabled({
      timeout: 20_000,
    });
    await expect(page.getByTestId("leads-in-search-needs-pin")).toHaveCount(0);
    await expect(page.getByTestId("permits-heading")).toHaveText(
      "Long-open roofing permits",
    );
    const lo = (
      await (
        await (
          await api()
        ).get(
          trpc(cfg.apiUrl, "permits.longOpen", {
            lat: pin[0],
            lon: pin[1],
            radius_miles: 1,
            threshold_years: 15,
            min_open_days: 1826,
            sort: "open_days",
            offset: 0,
            limit: 50,
          }),
        )
      ).json()
    ).result.data as {
      count: number;
      items: Array<{ permit_number: string; roofing_work: boolean }>;
    };
    expect(lo.items.length).toBeGreaterThan(0);
    expect(lo.items.every((x) => x.roofing_work)).toBe(true);
    const rows = page.getByTestId("permit-row");
    await expect(rows).toHaveCount(lo.items.length, { timeout: 20_000 });
    expect(
      await rows.evaluateAll((els) =>
        els.map((e) => [
          e.getAttribute("data-permit"),
          e.getAttribute("data-roofing"),
        ]),
      ),
    ).toEqual(lo.items.map((x) => [x.permit_number, "true"]));
    await expect(page.locator("body")).not.toContainText(/not harvested/i);
  });

  test("23. the ownership filter: off by default; turned on, 'both' is preselected; each basis's count equals parcels.search with it, and the texts shown (once, in a collapsed details) are the API's", async ({
    page,
  }) => {
    const cfg = await config();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center; radius 1 mi, 15 years (defaults)
    const pin = await pinOf(page);
    type Rule = {
      basis: string;
      text: string;
      weakness: string;
      proxy_note: string;
    };
    const search = async (basis?: string) => {
      const r = await (
        await api()
      ).get(
        trpc(cfg.apiUrl, "parcels.search", {
          lat: pin[0],
          lon: pin[1],
          radius_miles: 1,
          threshold_years: 15,
          ...(basis ? { ownership_basis: basis } : {}),
          limit: 1,
        }),
      );
      if (r.status() !== 200)
        throw new Error(`parcels.search: HTTP ${r.status()}`);
      return (await r.json()).result.data as {
        count: number;
        ownership: Rule | null;
      };
    };
    const off = await search();
    expect(off.ownership).toBeNull();
    await settle(page, off.count);
    await expect(page.getByTestId("ownership-on")).not.toBeChecked();
    await expect(page.getByTestId("ownership-basis")).toHaveCount(0);
    await expect(page.getByTestId("ownership-rules")).toHaveCount(0);
    const showing = page.getByTestId("results-showing");
    await expect(showing).not.toContainText("ownership filter");

    await page.getByTestId("ownership-on").check();
    await expect(page.getByTestId("ownership-basis-both")).toBeChecked();
    // The rules: one collapsed details, opened here to read them.
    const rules = page.getByTestId("ownership-rules");
    await expect(rules).not.toHaveAttribute("open", /.*/);
    await expand(rules);
    const counts: Record<string, number> = {};
    for (const b of ["both", "recording", "base_year"]) {
      if (b !== "both") await page.getByTestId(`ownership-basis-${b}`).check();
      const r = await search(b);
      expect(r.ownership?.basis).toBe(b);
      const rule = r.ownership!;
      await expect(showing).toHaveText(
        new RegExp(` · ownership filter: ${b}$`),
        { timeout: 20_000 },
      );
      await settle(page, r.count);
      // The rules show the API's own texts for this basis, once in the page.
      const box = page.locator(
        `[data-testid="ownership-basis-rule"][data-basis="${b}"]`,
      );
      await expect(box.getByTestId("ownership-text")).toHaveText(rule.text);
      await expect(box.getByTestId("ownership-weakness")).toHaveText(
        `Weakness: ${rule.weakness}`,
      );
      await expect(page.getByTestId("ownership-proxy-note")).toHaveText(
        rule.proxy_note,
      );
      for (const t of [rule.text, rule.weakness, rule.proxy_note])
        expect(
          await page.evaluate(
            (x) => document.body.textContent!.split(x).length - 1,
            t,
          ),
        ).toBe(1);
      counts[b] = r.count;
    }
    console.log("OWNERSHIP", JSON.stringify({ off: off.count, ...counts }));
    expect(counts.both).toBeLessThanOrEqual(
      Math.min(counts.recording!, counts.base_year!),
    );
    expect(Math.max(counts.recording!, counts.base_year!)).toBeLessThanOrEqual(
      off.count,
    );

    await page.getByTestId("ownership-on").uncheck();
    await expect(page.getByTestId("ownership-rules")).toHaveCount(0);
    await expect(showing).not.toContainText("ownership filter", {
      timeout: 20_000,
    });
    await settle(page, off.count);
  });

  test("24. the lead list's 'Has a long-open roofing permit' toggle, with 'Leads in this search' on and off: the list equals parcels.match for the same leads (the test's own leads are always deleted)", async ({
    page,
  }) => {
    const cfg = await config();
    const a = await api();
    const json = async (
      r: Awaited<ReturnType<typeof a.get>>,
      what: string,
    ): Promise<unknown> => {
      if (r.status() !== 200) throw new Error(`${what}: HTTP ${r.status()}`);
      return ((await r.json()) as { result: { data: unknown } }).result.data;
    };
    const getLead = async (id: string) =>
      (await json(
        await a.get(trpc(cfg.leadsApiUrl, "leads.get", { parcel_id: id })),
        "leads.get",
      )) as { updated_at: string; notes: string } | null;
    /** The parcel IDs of all leads, read across every page via next_cursor (read-only). */
    const listAll = async () => {
      const all: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 1000; i++) {
        const p = (await json(
          await a.get(
            trpc(cfg.leadsApiUrl, "leads.list", { limit: 100, cursor }),
          ),
          "leads.list",
        )) as { items: { parcel_id: string }[]; next_cursor: string | null };
        all.push(...p.items.map((l) => l.parcel_id));
        if (!p.next_cursor) return all;
        cursor = p.next_cursor;
      }
      throw new Error("leads.list: next_cursor did not end after 1,000 pages");
    };
    /** parcels.match over all the given IDs, in chunks of the API's MAX_MATCH_IDS (72). */
    const match = async (input: object, ids: string[]) => {
      const hit = new Set<string>();
      for (let i = 0; i < ids.length; i += 72) {
        const r = (await json(
          await a.get(
            trpc(cfg.apiUrl, "parcels.match", {
              ...input,
              parcel_ids: ids.slice(i, i + 72),
            }),
          ),
          "parcels.match",
        )) as { parcel_ids: string[] };
        for (const id of r.parcel_ids) hit.add(id);
      }
      return hit;
    };
    const pinAt = async () => {
      await ready(page);
      await page.getByTestId("map").click(); // pin at the center; radius 1 mi, 15 years (defaults)
      return pinOf(page);
    };
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    const pin = await pinAt();
    const filter = {
      lat: pin[0],
      lon: pin[1],
      radius_miles: 1,
      threshold_years: 15,
    };
    const WINDOW = { long_open_permit: true, min_open_days: 1826 };
    const points = async (radius: number) =>
      (await json(
        await a.get(
          trpc(cfg.apiUrl, "parcels.points", {
            ...filter,
            radius_miles: radius,
            min_open_days: 1826,
          }),
        ),
        "parcels.points",
      )) as { id: string[]; long_open_permit: number[] };
    const existing = new Set(await listAll());
    console.log(`leads before: ${existing.size}`);
    // Three parcels without a lead, picked from the API's points (default window, 1,826 days):
    // in the 1 mi search with a long-open roofing permit, in it without one, and outside it with one.
    const near = await points(1);
    const nearIds = new Set(near.id);
    const free = (id: string) => !existing.has(id);
    const inLong = near.id.find(
      (id, i) => near.long_open_permit[i] === 1 && free(id),
    );
    const inPlain = near.id.find(
      (id, i) => near.long_open_permit[i] === 0 && free(id),
    );
    const far = await points(5);
    const outLong = far.id.find(
      (id, i) => far.long_open_permit[i] === 1 && !nearIds.has(id) && free(id),
    );
    expect([inLong, inPlain, outLong].every(Boolean)).toBe(true);
    const mine = [inLong!, inPlain!, outLong!];
    console.log("TOGGLE_LEADS", JSON.stringify(mine));
    const created: string[] = [];
    try {
      for (const id of mine) {
        // Counted as this test's own only once the create answered 200: a create refused because another
        // user's lead appeared on the parcel meanwhile never makes that lead this test's.
        const r = await a.post(`${cfg.leadsApiUrl}/trpc/leads.create`, {
          data: { parcel_id: id, status: "new", notes: OWN_LEAD_NOTES },
        });
        expect(r.status(), `leads.create ${id}`).toBe(200);
        created.push(id);
      }
      const all = await listAll();
      const toggleOnly = await match(WINDOW, all);
      const searchOnly = await match(filter, all);
      const both = await match({ ...filter, ...WINDOW }, all);
      console.log(
        "TOGGLE_COUNTS",
        JSON.stringify({
          leads: all.length,
          toggle: toggleOnly.size,
          search: searchOnly.size,
          both: both.size,
        }),
      );
      // The three leads behave as picked (the API's own answers).
      expect([...mine].map((id) => toggleOnly.has(id))).toEqual([
        true,
        false,
        true,
      ]);
      expect([...mine].map((id) => searchOnly.has(id))).toEqual([
        true,
        true,
        false,
      ]);
      expect([...mine].map((id) => both.has(id))).toEqual([true, false, false]);

      // The page reads the leads at start: reload, pin the same center again.
      await page.reload();
      expect(await pinAt()).toEqual(pin);
      await openResults(page);
      await expect(page.getByTestId("result").first()).toBeVisible({
        timeout: 20_000,
      });
      const shown = async () =>
        new Set(
          await page
            .getByTestId("lead-item")
            .evaluateAll((els) =>
              els.map((e) => e.getAttribute("data-parcel")!),
            ),
        );
      const expectList = async (want: Set<string>) => {
        await expect(page.getByTestId("leads-count")).toHaveText(
          String(want.size),
          { timeout: 30_000 },
        );
        expect(await shown()).toEqual(want);
      };
      await expectList(new Set(all));
      await expect(page.getByTestId("leads-long-open-window")).toHaveText(
        " (open at least 1,826 days)",
      );
      // Toggle on, "Leads in this search" off: the lead IDs only.
      await page.getByTestId("leads-long-open").check();
      await expectList(toggleOnly);
      // Both on: the search filter and the lead IDs.
      await page.getByTestId("leads-in-search").check();
      await expectList(both);
      // Toggle off, "Leads in this search" on.
      await page.getByTestId("leads-long-open").uncheck();
      await expectList(searchOnly);
      await page.getByTestId("leads-in-search").uncheck();
      await expectList(new Set(all));
    } finally {
      // Always delete this test's own leads, also when a step above failed.
      for (const id of created) {
        const left = await getLead(id);
        if (isOwnLead(left))
          await a.post(`${cfg.leadsApiUrl}/trpc/leads.delete`, {
            data: { parcel_id: id, expected_updated_at: left.updated_at },
          });
      }
      for (const id of created) expect(await getLead(id)).toBeNull();
      await listAll().then(
        (all) => console.log(`leads after cleanup: ${all.length}`),
        (e: Error) =>
          console.log(`leads after cleanup: unknown (${e.message})`),
      );
    }
  });

  test("25. a long-open roofing permit's detail shows each contractor on one line as permits.forParcel serves it (business name, license, class, city; name variants only when more than one; the expiry recorded on the permit; no identity or canonical-name label)", async ({
    page,
  }) => {
    const cfg = await config();
    const a = await api();
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    type Contractor = Record<string, unknown> & {
      contractor_identity_key: string | null;
      contractors_business_name: string | null;
      license_identifier: string | null;
      city_name: string | null;
      license_expiration_date: string | null;
      name_variant_count: number | null;
    };
    const lo = (
      await (
        await a.get(
          trpc(cfg.apiUrl, "permits.longOpen", {
            lat: pin[0],
            lon: pin[1],
            radius_miles: 1,
            threshold_years: 15,
            min_open_days: 1826,
            sort: "open_days",
            offset: 0,
            limit: 50,
          }),
        )
      ).json()
    ).result.data as {
      count: number;
      items: Array<{
        permit_number: string;
        parcel_id: string;
        building_level: boolean;
      }>;
    };
    // The first row (not building-level: such a row opens its nearest unit) whose permit has a contractor
    // with an identity, from the API.
    let row = -1;
    let want: { permit_number: string; contractors: Contractor[] } | undefined;
    for (let i = 0; i < lo.items.length && !want; i++) {
      const it = lo.items[i]!;
      if (it.building_level) continue;
      const fp = (
        await (
          await a.get(
            trpc(cfg.apiUrl, "permits.forParcel", { parcel_id: it.parcel_id }),
          )
        ).json()
      ).result.data as {
        permits: Array<{ permit_number: string; contractors: Contractor[] }>;
      };
      const p = fp.permits.find((x) => x.permit_number === it.permit_number);
      if (p?.contractors.some((c) => c.contractor_identity_key !== null)) {
        row = i;
        want = p;
      }
    }
    expect(
      want,
      "a long-open permit with an identified contractor",
    ).toBeDefined();
    console.log(
      "IDENTITY_PERMIT",
      JSON.stringify({
        row,
        permit: want!.permit_number,
        contractors: want!.contractors.length,
      }),
    );
    // Counted, never listed: no contractor row carries a list.
    for (const c of want!.contractors)
      expect(Object.values(c).some((v) => Array.isArray(v))).toBe(false);

    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBe(lo.count);
    await expand(page.getByTestId("permits-details"));
    const r = page.getByTestId("permit-row").nth(row);
    await expect(r).toHaveAttribute("data-permit", want!.permit_number);
    await r.click();
    const permit = page
      .getByTestId("detail")
      .getByTestId("parcel-permits")
      .locator(`[data-permit="${want!.permit_number}"]`);
    await expect(permit).toHaveCount(1, { timeout: 20_000 });
    await expect(permit).toHaveAttribute("data-long-open", "true");
    const rows = permit.getByTestId("contractor");
    await expect(rows).toHaveCount(want!.contractors.length);
    for (let j = 0; j < want!.contractors.length; j++) {
      const c = want!.contractors[j]!;
      const row = rows.nth(j);
      // The identity key stays an attribute only.
      if (c.contractor_identity_key === null)
        await expect(row).not.toHaveAttribute("data-identity-key", /.*/);
      else
        await expect(row).toHaveAttribute(
          "data-identity-key",
          c.contractor_identity_key,
        );
      await expect(row.getByTestId("contractor-name")).toHaveText(
        c.contractors_business_name ?? "business name not published",
      );
      await expect(row.getByTestId("contractor-license")).toHaveText(
        c.license_identifier ?? "—",
      );
      if (c.city_name)
        await expect(row.getByTestId("contractor-city")).toHaveText(
          c.city_name,
        );
      else await expect(row.getByTestId("contractor-city")).toHaveCount(0);
      // Name variants only when the license carries more than one name: counted, never listed.
      const n = c.name_variant_count;
      if (n !== null && n > 1)
        await expect(row.getByTestId("contractor-name-variants")).toHaveText(
          `${n.toLocaleString("en-US")} name variants`,
        );
      else
        await expect(row.getByTestId("contractor-name-variants")).toHaveCount(
          0,
        );
      if (c.license_expiration_date)
        await expect(row).toContainText(
          `expiry recorded on the permit ${dateOnly(c.license_expiration_date)}`,
        );
      await expect(row).not.toContainText(/identity|canonical|expires/i);
    }
  });

  test("34. number fields are text entries: roof age and the open-duration years can be emptied and retyped; an empty or invalid value shows a message and sends nothing; the search sends what was typed and the counts equal the API", async ({
    page,
  }) => {
    const cfg = await config();
    const searches = trpcInputs(page, "parcels.search");
    const longOpens = trpcInputs(page, "permits.longOpen");
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    const get = async (proc: string, input: unknown) =>
      (await (await (await api()).get(trpc(cfg.apiUrl, proc, input))).json())
        .result.data as { count: number };
    const where = { lat: pin[0], lon: pin[1], radius_miles: 1 };
    await settle(
      page,
      (await get("parcels.search", { ...where, threshold_years: 15 })).count,
    );
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"))
      .toBeGreaterThanOrEqual(0);
    const calls = () => [searches.length, longOpens.length];
    const before = calls();

    // Roof age: emptied, then out of range: a message each time, no call. (The search runs as the field
    // changes, so the invalid value is one with no valid value on the way: "0".)
    const years = page.getByTestId("threshold");
    await retype(years, "");
    await expect(page.getByTestId("threshold-error")).toHaveText(
      "Roof older than (years) is empty: enter a whole number from 1 to 120. The search keeps 15 years until then.",
    );
    await years.pressSequentially("0");
    await expect(page.getByTestId("threshold-error")).toContainText(
      "must be a whole number from 1 to 120",
    );
    await page.waitForTimeout(1_000); // past the 250 ms debounce
    expect(calls()).toEqual(before);
    // Retyped: the search sends what was typed; the count equals the API.
    await retype(years, "20");
    await expect(page.getByTestId("threshold-error")).toHaveCount(0);
    const at20 = await get("parcels.search", { ...where, threshold_years: 20 });
    await settle(page, at20.count);
    expect(searches.at(-1)).toMatchObject({ threshold_years: 20 });
    expect(searches.map((s) => s.threshold_years)).not.toContain(0);

    // Open at least (years): emptied, a message and no call; retyped, the list sends what was typed.
    const minYears = page.getByTestId("permits-min-years");
    const n = longOpens.length;
    await retype(minYears, "");
    await expect(page.getByTestId("permits-window-error")).toHaveText(
      "Open at least (years) is empty: enter a whole number from 1 to 100.",
    );
    await page.waitForTimeout(1_000);
    expect(longOpens.length).toBe(n);
    await retype(minYears, "8");
    const lo8 = await get("permits.longOpen", {
      ...where,
      threshold_years: 20,
      min_open_days: 2922,
    });
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBe(lo8.count);
    expect(longOpens.at(-1)).toMatchObject({
      threshold_years: 20,
      min_open_days: 2922,
    });
    expect("max_open_days" in longOpens.at(-1)!).toBe(false);
    // At most (years): typed after clearing, then a maximum below the minimum (a message, no call).
    const maxYears = page.getByTestId("permits-max-years");
    await retype(maxYears, "12");
    await expect
      .poll(() => longOpens.at(-1)?.max_open_days, { timeout: 20_000 })
      .toBe(4383);
    const m = longOpens.length;
    // Typed over the selected text (no empty value on the way, which would be a valid window).
    await maxYears.click();
    await maxYears.press("ControlOrMeta+a");
    await maxYears.pressSequentially("3");
    await expect(page.getByTestId("permits-window-error")).toHaveText(
      "The maximum (3 years) is below the minimum (8 years); set a larger maximum or clear it.",
    );
    await page.waitForTimeout(1_000);
    expect(longOpens.length).toBe(m);
    // The arrows step whole years.
    await years.press("ArrowUp");
    await expect(years).toHaveValue("21");
  });

  test("35. the parcel detail wraps whole words (no word split over two lines)", async ({
    page,
  }) => {
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click();
    await openResults(page);
    await page.getByTestId("result").first().click();
    const d = page.getByTestId("detail");
    const basis = d.locator('[data-field="roof_age_basis"]');
    await expect(basis).toContainText("not a roof installation date");
    await expect(basis).toHaveCSS("word-break", "normal");
    await expect(basis).toHaveCSS("overflow-wrap", "anywhere");
    expect(await lineCount(basis)).toBeGreaterThan(1); // it does wrap
    for (const dd of await d.locator("dd").all())
      expect(await splitWords(dd)).toEqual([]);
  });

  test("39. layout: the controls stay in place while the aside scrolls; each rule text once, collapsed; results, permits and leads closed until opened, with their counts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const results = page.getByTestId("results-details");
    await expect(results).toBeAttached({ timeout: 20_000 });
    await expect(page.getByTestId("result-count")).toHaveAttribute(
      "data-count",
      /^[1-9]\d*$/,
      { timeout: 20_000 },
    );
    // Closed until opened, the count in the summary.
    for (const id of ["results-details", "permits-details"])
      await expect(page.getByTestId(id)).not.toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("result").first()).toBeHidden();
    const n = await count(page);
    await expect(page.getByTestId("results-showing")).toContainText(
      `${n.toLocaleString("en-US")} · showing 1–`,
    );
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(0);
    // Rule texts: each in a collapsed details, each once in the page.
    for (const id of ["rule-details", "permits-rule-details"])
      await expect(page.getByTestId(id)).not.toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("rule")).toBeHidden();
    for (const id of ["rule", "permits-api-rule"]) {
      const t = (await page.getByTestId(id).textContent())!.trim();
      expect(t.length).toBeGreaterThan(0);
      expect(
        await page.evaluate(
          (x) => document.body.textContent!.split(x).length - 1,
          t,
        ),
      ).toBe(1);
    }
    // Controls in one fixed place: open the lists, scroll the aside, the controls do not move.
    await openResults(page);
    await expand(page.getByTestId("permits-details"));
    const controls = page.locator("aside > section.controls");
    const before = (await controls.boundingBox())!;
    await page.locator("aside").evaluate((el) => el.scrollTo(0, 600));
    await expect
      .poll(() => page.locator("aside").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const after = (await controls.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("gps")).toBeInViewport();
    await expect(page.getByTestId("radius")).toBeInViewport();
  });

  test("40. 'Use my location' zooms the map to the radius circle and closes the open details panel; the pin is at 5 decimals everywhere", async ({
    browser,
  }) => {
    const GPS = { latitude: 34.1990123, longitude: -118.4870456 };
    const ctx = await browser.newContext({
      httpCredentials: CREDS,
      geolocation: GPS,
      permissions: ["geolocation"],
      viewport: { width: 1280, height: 800 },
    });
    await guardAgentAnswer(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/?lat=${VN.lat}&lon=${VN.lon}&z=15`);
    await ready(page);
    await page.getByTestId("map").click(); // a pin, so a result can be opened
    await openResults(page);
    await page.getByTestId("result").first().click();
    await expect(page.getByTestId("detail")).toBeVisible();
    await page.getByTestId("radius").fill("2");
    await page.getByTestId("gps").click();
    await expect(page.getByTestId("detail")).toHaveCount(0);
    // The pin: rounded to 5 decimals where it is placed.
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      GPS.latitude.toFixed(5),
    );
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lon",
      GPS.longitude.toFixed(5),
    );
    const pin = await pinOf(page);
    await recenteredOn(page, pin);
    // The circle fits the map and fills most of it (fitted, not merely panned at zoom 15).
    await expect
      .poll(async () => Number(await strictAttr(page, "data-rendered-zoom")), {
        timeout: 20_000,
      })
      .toBeLessThan(15);
    const z = Number(await strictAttr(page, "data-rendered-zoom"));
    const size = (await page.getByTestId("map").boundingBox())!;
    const center = await mapCenter(page);
    const north = mercatorOffset(pin[0]! + 2 / 69.05, pin[1]!, center, z);
    const east = mercatorOffset(
      pin[0]!,
      pin[1]! + 2 / (69.17 * Math.cos((pin[0]! * Math.PI) / 180)),
      center,
      z,
    );
    const fill = Math.max(
      Math.abs(north.dy) / (size.height / 2),
      Math.abs(east.dx) / (size.width / 2),
    );
    console.log("GPS_FIT", JSON.stringify({ z, fill }));
    expect(fill).toBeLessThanOrEqual(1);
    expect(fill).toBeGreaterThan(0.6);
    await ctx.close();
  });

  test("41. a lead created from a long-open permit row keeps that permit (source_permit): shown read only in the editor and in the list's Permit column, unchanged by an update (the test's own lead is always deleted)", async ({
    page,
  }) => {
    const cfg = await config();
    const a = await api();
    type StoredLead = {
      status: string;
      notes: string;
      updated_at: string;
      source_permit?: string;
    };
    const get = async (id: string) => {
      const r = await a.get(
        trpc(cfg.leadsApiUrl, "leads.get", { parcel_id: id }),
      );
      if (r.status() !== 200) throw new Error(`leads.get: HTTP ${r.status()}`);
      return (await r.json()).result.data as StoredLead | null;
    };
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    await page.getByTestId("radius").fill("5");
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await expand(page.getByTestId("permits-details"));
    const rows = page.getByTestId("permit-row");
    const listed = await rows.evaluateAll((els) =>
      els.map((e) => [e.dataset.permit!, e.dataset.parcel!]),
    );
    // The first row whose parcel has no lead (existing leads are never touched).
    let index = -1;
    for (let i = 0; i < listed.length && index < 0; i++)
      if ((await get(listed[i]![1]!)) === null) index = i;
    expect(index).toBeGreaterThanOrEqual(0);
    const [permit, parcel] = listed[index]! as [string, string];
    expect(permit).toMatch(/^\d{5}-\d{5}-\d{5}$/);
    console.log("LEAD_FROM_PERMIT", JSON.stringify({ permit, parcel }));
    let createClicked = false;
    try {
      await rows.nth(index).click();
      await expect(page.getByTestId("lead")).toHaveAttribute(
        "data-parcel",
        parcel,
      );
      await expect(page.getByTestId("lead-source-permit")).toHaveText(
        `A lead created here records permit ${permit}`,
      );
      await page.getByTestId("lead-notes").fill(OWN_LEAD_NOTES);
      createClicked = true;
      await page.getByTestId("lead-create").click();
      await expect(page.getByTestId("lead-save")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("lead-created")).toHaveText("Lead created");
      expect(await get(parcel)).toMatchObject({
        notes: OWN_LEAD_NOTES,
        source_permit: permit,
      });
      // Read only in the editor; in the list's Permit column.
      const shown = page.getByTestId("lead-source-permit");
      await expect(shown).toHaveText(`From permit ${permit}`);
      // No field of the editor holds it.
      expect(
        await page
          .getByTestId("lead")
          .locator("input, textarea, select")
          .evaluateAll(
            (els, p) => els.some((e) => (e as HTMLInputElement).value === p),
            permit,
          ),
      ).toBe(false);
      await expand(page.getByTestId("leads-details"));
      const row = page.getByTestId("lead-item").filter({
        has: page.locator(`[data-testid=lead-parcel]:text-is("${parcel}")`),
      });
      await expect(row.getByTestId("lead-permit")).toHaveText(permit);
      // An update changes the status, never the permit.
      await page.getByTestId("lead-status").selectOption("contacted");
      await page.getByTestId("lead-save").click();
      await expect
        .poll(async () => (await get(parcel))?.status, { timeout: 10_000 })
        .toBe("contacted");
      expect((await get(parcel))?.source_permit).toBe(permit);
      await expect(shown).toHaveText(`From permit ${permit}`);
    } finally {
      // Only this test's own lead (its notes) is deleted.
      const left = createClicked ? await get(parcel) : null;
      if (isOwnLead(left))
        await a.post(`${cfg.leadsApiUrl}/trpc/leads.delete`, {
          data: { parcel_id: parcel, expected_updated_at: left.updated_at },
        });
      if (!left || isOwnLead(left)) expect(await get(parcel)).toBeNull();
    }
  });
  test("43. the lead list's permit-status filter uses each lead's own permit (source_permit): its class as permits.forParcel serves it, 'no permit on the lead' for a lead without one, combined with the status filter; an unreadable permit shows 'status not available' and stays listed (the test's own leads are always deleted)", async ({
    page,
  }) => {
    const cfg = await config();
    const a = await api();
    const json = async (
      r: Awaited<ReturnType<typeof a.get>>,
      what: string,
    ): Promise<unknown> => {
      if (r.status() !== 200) throw new Error(`${what}: HTTP ${r.status()}`);
      return ((await r.json()) as { result: { data: unknown } }).result.data;
    };
    const getLead = async (id: string) =>
      (await json(
        await a.get(trpc(cfg.leadsApiUrl, "leads.get", { parcel_id: id })),
        "leads.get",
      )) as { updated_at: string; notes: string } | null;
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    await page.getByTestId("radius").fill("5");
    await expect
      .poll(() => attrNum(page, "permits-count", "data-count"), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await expand(page.getByTestId("permits-details"));
    const rows = await page
      .getByTestId("permit-row")
      .evaluateAll((els) =>
        els.map((e) => [e.dataset.permit!, e.dataset.parcel!] as const),
      );
    // Two parcels without a lead (existing leads are never touched): one for a lead created from its permit
    // row, one for a lead without a permit.
    const free: Array<readonly [string, string]> = [];
    for (const r of rows) {
      if (free.length === 2) break;
      if (free.some((f) => f[1] === r[1])) continue;
      if ((await getLead(r[1])) === null) free.push(r);
    }
    expect(free).toHaveLength(2);
    const [[permit, withPermit], [, noPermit]] = free as [
      readonly [string, string],
      readonly [string, string],
    ];
    // The class the API serves for that permit on that parcel.
    const own = (
      (await json(
        await a.get(
          trpc(cfg.apiUrl, "permits.forParcel", { parcel_id: withPermit }),
        ),
        "permits.forParcel",
      )) as {
        permits: Array<{ permit_number: string; permit_status_class: string }>;
      }
    ).permits.find((p) => p.permit_number === permit);
    expect(own, `${permit} among ${withPermit}'s permits`).toBeTruthy();
    const cls = own!.permit_status_class;
    console.log(
      "PERMIT_FILTER_LEADS",
      JSON.stringify({ permit, withPermit, cls, noPermit }),
    );
    const LABEL: Record<string, string> = {
      "open-issued": "Open (issued)",
      "open-application": "Open (application stage)",
      closed: "Closed",
      unclear: "Unclear (neither open nor closed)",
      unmapped: "Unmapped status",
    };
    const created: string[] = [];
    try {
      for (const data of [
        {
          parcel_id: withPermit,
          status: "new",
          notes: OWN_LEAD_NOTES,
          source_permit: permit,
        },
        { parcel_id: noPermit, status: "new", notes: OWN_LEAD_NOTES },
      ]) {
        const r = await a.post(`${cfg.leadsApiUrl}/trpc/leads.create`, {
          data,
        });
        expect(r.status(), `leads.create ${data.parcel_id}`).toBe(200);
        created.push(data.parcel_id);
      }
      const reads = trpcInputs(page, "permits.forParcel");
      await page.reload();
      await ready(page);
      const filter = page.getByTestId("leads-permit-filter");
      await expect(filter).toBeEnabled();
      await expect(filter.locator("option")).toHaveText(PERMIT_CHOICE_TEXTS);
      await expand(page.getByTestId("leads-details"));
      const row = (id: string) =>
        page
          .getByTestId("lead-item")
          .and(page.locator(`[data-parcel="${id}"]`));
      await expect(row(withPermit)).toHaveCount(1, { timeout: 20_000 });
      // Before a status choice, no permit is read for the filter.
      expect(reads.filter((v) => v.parcel_id === withPermit)).toHaveLength(0);
      const choose = async (value: string) => {
        await filter.selectOption(value);
        await expect(page.getByTestId("leads-permit-checking")).toHaveCount(0, {
          timeout: 60_000,
        });
      };
      for (const choice of [
        "open-issued",
        "open-application",
        "closed",
        "unclear",
        "none",
      ]) {
        await choose(choice);
        await expect(row(withPermit), `${choice}: the permit lead`).toHaveCount(
          choice === cls ? 1 : 0,
        );
        await expect(
          row(noPermit),
          `${choice}: the lead without a permit`,
        ).toHaveCount(choice === "none" ? 1 : 0);
      }
      // The lead's permit is read once, from its own parcel; at most once per parcel overall.
      expect(reads.filter((v) => v.parcel_id === withPermit)).toHaveLength(1);
      const parcels = reads.map((v) => v.parcel_id);
      expect(new Set(parcels).size).toBe(parcels.length);
      expect(parcels).not.toContain(noPermit);
      // All permit statuses: both leads, the permit lead with its status beside its number.
      await choose("all");
      await expect(row(noPermit)).toHaveCount(1);
      await expect(
        row(withPermit).getByTestId("lead-permit-status"),
      ).toHaveText(LABEL[cls] ?? cls);
      // Combined with the lead status filter: both leads are "new".
      if (cls in LABEL && cls !== "unmapped") {
        await choose(cls);
        await page.getByTestId("leads-status-filter").selectOption("contacted");
        await expect(row(withPermit)).toHaveCount(0);
        await page.getByTestId("leads-status-filter").selectOption("new");
        await expect(row(withPermit)).toHaveCount(1);
        await page.getByTestId("leads-status-filter").selectOption("all");
      }
      // Unreadable: with permits.forParcel failing (aborted in the page), the lead stays under every status
      // choice with "status not available".
      await page.route(
        (u) => u.pathname.includes("permits.forParcel"),
        (route) => route.abort("failed"),
      );
      await page.reload();
      await ready(page);
      await expand(page.getByTestId("leads-details"));
      for (const choice of ["closed", "open-application"]) {
        await choose(choice);
        await expect(row(withPermit)).toHaveCount(1);
        await expect(
          row(withPermit).getByTestId("lead-permit-status"),
        ).toHaveText("status not available");
        await expect(row(noPermit)).toHaveCount(0);
      }
    } finally {
      // Always delete this test's own leads, also when a step above failed.
      for (const id of created) {
        const left = await getLead(id);
        if (isOwnLead(left))
          await a.post(`${cfg.leadsApiUrl}/trpc/leads.delete`, {
            data: { parcel_id: id, expected_updated_at: left.updated_at },
          });
      }
      for (const id of created) expect(await getLead(id)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Ask the agent (POST /agent/answer always mocked; the section may call the real /agent/warm and the data API).

type Reply = AnswerResponse | { httpStatus: number; body: unknown };
/** CORS headers for the mocked agent API: the CRM origin only, as the agent stack's CORS does. */
const AGENT_CORS = {
  "access-control-allow-origin": ORIGIN,
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

/**
 * Mocks POST /agent/answer with the given replies in order (page route, ahead of the catch-all) and records each
 * request body; a request with no reply left is aborted and fails the test.
 */
async function mockAnswers(page: Page, replies: Reply[], log?: string[]) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/agent/answer", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: AGENT_CORS });
    const next = replies.shift();
    if (!next) {
      unmockedAnswers.push(
        `${req.method()} ${req.url()} (no mocked reply left)`,
      );
      return route.abort("blockedbyclient");
    }
    bodies.push(req.postDataJSON() as Record<string, unknown>);
    log?.push("answer");
    const [status, body] =
      "httpStatus" in next ? [next.httpStatus, next.body] : [200, next];
    await route.fulfill({
      status,
      headers: { ...AGENT_CORS, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });
  return bodies;
}

/** The screen values sent with a question on a fresh page: radius 1 mile, roof older than 15 years. */
const SCREEN_DEFAULT = { radius_miles: 1, threshold_years: 15 };

/** Records the warm-up traffic in order: "warm:req", "warm:res", "data:req", "data:res" (explorer.sources). */
function watchWarmup(page: Page, log: string[]) {
  const kind = (url: string) =>
    /\/agent\/warm$/.test(new URL(url).pathname)
      ? "warm"
      : /\/trpc\/explorer\.sources$/.test(new URL(url).pathname)
        ? "data"
        : null;
  page.on("request", (r) => {
    const k = kind(r.url());
    if (k && r.method() === "GET") log.push(`${k}:req`);
  });
  page.on("response", (r) => {
    const k = kind(r.url());
    if (k && r.request().method() === "GET") log.push(`${k}:res`);
  });
}

const openAgent = async (page: Page) => {
  await page.getByTestId("agent-open").click();
  await expect(page.getByTestId("agent-body")).toBeVisible();
};
const ask = async (page: Page, q: string) => {
  await page.getByRole("textbox", { name: /question/i }).fill(q);
  await page.getByTestId("agent-send").click();
};
const seen = (log: string[], e: string) => log.filter((x) => x === e).length;
const box = (page: Page) => page.getByRole("textbox", { name: /question/i });

test.describe("Ask the agent (answers mocked)", () => {
  test.use({ httpCredentials: CREDS });

  test("26. config.json names the agent API (OracleLaAgentApi, eu-north-1)", async ({
    page,
  }) => {
    const cfg = (await (
      await page.request.get(`${BASE_URL}/config.json`)
    ).json()) as Cfg & { agentApiUrl?: string };
    expect(cfg.agentApiUrl).toMatch(
      /^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/,
    );
    expect(cfg.agentApiUrl).not.toBe(cfg.apiUrl);
  });

  test("27. the section is in the aside below the controls; opening it warms the agent and two data API requests at once; the notice and the pin as the center are shown", async ({
    page,
  }) => {
    const log: string[] = [];
    watchWarmup(page, log);
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    const section = page.getByTestId("ask-agent");
    await expect(section).toBeVisible();
    expect(
      await section.evaluate(
        (el) =>
          el.closest("aside") !== null &&
          el.previousElementSibling?.classList.contains("controls"),
      ),
    ).toBe(true);
    // Collapsed: nothing warmed yet.
    await expect(page.getByTestId("agent-body")).toBeHidden();
    expect(log).toEqual([]);
    await openAgent(page);
    await expect
      .poll(() => [seen(log, "warm:res"), seen(log, "data:res")])
      .toEqual([1, 2]);
    // Both data requests went out before either answered (sent at once).
    expect(log.filter((x) => x.startsWith("data:")).slice(0, 2)).toEqual([
      "data:req",
      "data:req",
    ]);
    await expect(page.getByTestId("agent-notice")).toHaveText(
      "Your questions in this conversation, the map center, the radius, the roof age threshold and the data the agent reads are sent to Anthropic to answer them.",
    );
    await expect(page.getByTestId("agent-center")).toContainText(
      "Center: none yet",
    );
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await expect(page.getByTestId("agent-center")).toHaveText(
      `Center: map pin (${pin[0]!.toFixed(5)}, ${pin[1]!.toFixed(5)})`,
    );
    await expect(page.getByTestId("agent-send")).toBeEnabled();
  });

  test("28. an answered reply around the pin: markdown text, How I got this collapsed, Sources by kind, Gaps with Always true, unverified ID flagged", async ({
    page,
  }) => {
    const bodies = await mockAnswers(page, [ANSWERED]);
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    const pin = await pinOf(page);
    await openAgent(page);
    await ask(page, QUESTION_1);
    const a = page.getByTestId("agent-answer");
    await expect(a).toHaveAttribute("data-status", "answered");
    expect(bodies).toHaveLength(1);
    const sent = bodies[0] as {
      question: string;
      center: { lat: number; lon: number; label: string };
    };
    expect(sent.question).toBe(QUESTION_1);
    expect(Object.keys(sent).sort()).toEqual(["center", "question", "screen"]);
    expect(sent.center.label).toBe("map pin");
    // The pin is rounded to 5 decimals where it is placed: the center sent is exactly the pin shown.
    expect(sent.center.lat).toBe(pin[0]);
    expect(sent.center.lon).toBe(pin[1]);
    expect(String(sent.center.lat)).toMatch(/^-?\d+(\.\d{1,5})?$/);
    await expect(
      a.getByTestId("agent-text").locator("strong").first(),
    ).toHaveText(
      "115,373 parcels within 5 miles of Van Nuys have roofs older than 15 years.",
    );
    await expect(a.getByTestId("agent-text").locator("tbody tr")).toHaveCount(
      2,
    );
    await expect(a.getByTestId("unverified-id")).toHaveText([
      "2218099999 (unverified)",
    ]);
    const how = a.getByTestId("agent-how");
    await expect(how).not.toHaveAttribute("open", /.*/);
    await expect(how.getByText(ANSWERED.reasoning)).toBeHidden();
    await how.locator("summary").click();
    await expect(how.getByText(ANSWERED.reasoning)).toBeVisible();
    // Sources: closed, with the count of cited records in the header; Gaps are not collapsed.
    const sources = a.getByTestId("agent-sources-details");
    await expect(sources).not.toHaveAttribute("open", /.*/);
    await expect(sources.locator("summary")).toHaveText(
      `Sources (${ANSWERED.records.length})`,
    );
    await expect(a.getByTestId("agent-gaps")).toBeVisible();
    await expand(sources);
    await expect(a.getByTestId("agent-sources")).toHaveCount(3);
    for (const r of ANSWERED.records) {
      const row = a.locator(
        `[data-testid="agent-sources"][data-kind="${r.kind}"] tbody tr`,
      );
      await expect(row.locator("td")).toHaveText([
        r.id,
        r.source_name,
        r.license ?? "—",
        r.attribution ?? "—",
        dateOnly(r.collected_at), // dates as YYYY-MM-DD
      ]);
    }
    await expect(a.getByTestId("agent-gaps").locator("li")).toHaveText(
      ANSWERED.gaps.slice(STANDING_GAPS.length),
    );
    await expect(a.getByTestId("agent-standing-gaps").locator("li")).toHaveText(
      STANDING_GAPS,
    );
    await expect(box(page)).toHaveValue("");
  });

  test("29. a refused reply is a normal message with its gaps; a stopped reply and a 503 are plain messages that keep the question", async ({
    page,
  }) => {
    await mockAnswers(page, [
      REFUSED,
      STOPPED,
      { httpStatus: 503, body: { error: "agent not configured" } },
    ]);
    await page.goto("/");
    await openAgent(page);
    await ask(page, "Who owns parcel 2218022020?");
    const a = page.getByTestId("agent-answer");
    await expect(a).toHaveAttribute("data-status", "refused");
    await expect(a.getByTestId("agent-text")).toHaveText(REFUSED.text);
    await expect(page.getByTestId("agent-message")).toHaveCount(0);
    await expect(a.getByTestId("agent-standing-gaps").locator("li")).toHaveText(
      STANDING_GAPS,
    );

    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-message")).toContainText(
      "The answer stopped before it was complete (time_budget)",
    );
    await expect(box(page)).toHaveValue(QUESTION_1);
    await expect(page.getByTestId("agent-answer")).toHaveCount(1);

    await page.getByTestId("agent-send").click();
    await expect(page.getByTestId("agent-message")).toContainText(
      "not available right now (HTTP 503: agent not configured)",
    );
    await expect(box(page)).toHaveValue(QUESTION_1);
  });

  test("30. a follow-up sends the history, session and signature; nothing is stored; New conversation clears them", async ({
    page,
  }) => {
    const bodies = await mockAnswers(page, [ANSWERED, FOLLOW_UP, ANSWERED]);
    await page.goto("/");
    await openAgent(page);
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-turn")).toHaveCount(1);
    await ask(page, QUESTION_2);
    await expect(page.getByTestId("agent-turn")).toHaveCount(2);
    expect(bodies[1]).toEqual({
      question: QUESTION_2,
      screen: SCREEN_DEFAULT,
      history: ANSWERED.history,
      session: ANSWERED.session,
      signature: ANSWERED.signature,
    });
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
    await page.getByTestId("agent-new").click();
    await expect(page.getByTestId("agent-turn")).toHaveCount(0);
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-turn")).toHaveCount(1);
    expect(bodies[2]).toEqual({ question: QUESTION_1, screen: SCREEN_DEFAULT });
  });

  test("31. a question asked before the warm-up answered is held with a waking-up status and sent when the agent and both data requests answered", async ({
    page,
  }) => {
    const log: string[] = [];
    watchWarmup(page, log);
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    // The real /agent/warm, held back until the test releases it.
    await page.route("**/agent/warm", async (route) => {
      await released;
      await route.continue();
    });
    const bodies = await mockAnswers(page, [ANSWERED], log);
    await page.goto("/");
    await openAgent(page);
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-status")).toHaveAttribute(
      "data-state",
      "waking",
    );
    await expect(page.getByTestId("agent-status")).toContainText("Waking up");
    // Pending from the click: Send and New conversation are disabled during the hold.
    await expect(page.getByTestId("agent-send")).toBeDisabled();
    await expect(page.getByTestId("agent-new")).toBeDisabled();
    await expect.poll(() => seen(log, "data:res")).toBe(2);
    expect(bodies).toEqual([]);
    release();
    await expect(page.getByTestId("agent-answer")).toHaveAttribute(
      "data-status",
      "answered",
    );
    // The answer went out only after the warm-up's agent and data responses.
    expect(log.indexOf("answer")).toBeGreaterThan(log.lastIndexOf("warm:res"));
    expect(log.indexOf("answer")).toBeGreaterThan(log.lastIndexOf("data:res"));
    await expect(page.getByTestId("agent-send")).toBeEnabled();
    await expect(page.getByTestId("agent-new")).toBeEnabled();
  });

  test("32. re-warm: more than 4 minutes after the last data API response, the warm-up runs again before the question", async ({
    page,
  }) => {
    await page.clock.install();
    const log: string[] = [];
    watchWarmup(page, log);
    await mockAnswers(page, [ANSWERED, FOLLOW_UP], log);
    await page.goto("/");
    await openAgent(page);
    await expect.poll(() => seen(log, "data:res")).toBe(2);
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-turn")).toHaveCount(1);
    expect(seen(log, "warm:req")).toBe(1);
    await page.clock.fastForward("04:01");
    await ask(page, QUESTION_2);
    await expect(page.getByTestId("agent-turn")).toHaveCount(2);
    expect(seen(log, "warm:req")).toBe(2);
    expect(seen(log, "data:req")).toBe(4);
    // The second question went out after the second warm-up had answered.
    expect(log.lastIndexOf("answer")).toBeGreaterThan(
      log.lastIndexOf("data:res"),
    );
    expect(log.lastIndexOf("answer")).toBeGreaterThan(
      log.lastIndexOf("warm:res"),
    );
  });

  test("38. the screen's radius and last valid roof age threshold go with the question as numbers and show under the box; Send and New conversation are disabled until the answer is in", async ({
    page,
  }) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/agent/answer", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: AGENT_CORS });
      bodies.push(req.postDataJSON() as Record<string, unknown>);
      await released;
      await route.fulfill({
        status: 200,
        headers: { ...AGENT_CORS, "content-type": "application/json" },
        body: JSON.stringify(ANSWERED),
      });
    });
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    await page.getByTestId("map").click(); // pin at the center
    await page.getByTestId("radius").fill("2.5");
    await page.getByTestId("threshold").fill("25");
    // An invalid threshold: the search and the agent keep the last valid one.
    await page.getByTestId("threshold").fill("500");
    await expect(page.getByTestId("threshold-error")).toBeVisible();
    await openAgent(page);
    await expect(page.getByTestId("agent-screen")).toHaveText(
      "Radius: 2.5 mi. Roof older than: 25 years.",
    );
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-send")).toBeDisabled();
    await expect(page.getByTestId("agent-new")).toBeDisabled();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]!.screen).toEqual({
      radius_miles: 2.5,
      threshold_years: 25,
    });
    release();
    await expect(page.getByTestId("agent-answer")).toHaveAttribute(
      "data-status",
      "answered",
    );
    await expect(page.getByTestId("agent-send")).toBeEnabled();
    await expect(page.getByTestId("agent-new")).toBeEnabled();
  });

  test("33. a parcel ID in Sources opens the parcel's detail and pans the map to it; the pin stays", async ({
    page,
  }) => {
    expect(ANSWERED.records[0]).toMatchObject({
      kind: "parcel",
      id: CITED_PARCEL,
    });
    await mockAnswers(page, [ANSWERED]);
    await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
    await ready(page);
    // A pin away from the parcel, so the pan is visible.
    const m = (await page.getByTestId("map").boundingBox())!;
    await page.mouse.click(m.x + m.width / 2 + 150, m.y + m.height / 2 + 100);
    await expect(page.getByTestId("map")).toHaveAttribute(
      "data-pin-lat",
      /^-?\d+\.\d+$/,
    );
    const pin = await pinOf(page);
    await recenteredOn(page, pin);
    await openAgent(page);
    await ask(page, QUESTION_1);
    await expect(page.getByTestId("agent-turn")).toHaveCount(1);
    const detailCalls = detailGets(page);
    await expand(page.getByTestId("agent-sources-details"));
    await page.getByTestId("agent-parcel-link").click();
    const d = page.getByTestId("detail");
    await expect(d.locator('[data-field="parcel_id"]')).toHaveText(
      CITED_PARCEL,
    );
    expect(detailCalls).toHaveLength(1);
    const at = [
      Number(await d.locator('[data-field="latitude"]').innerText()),
      Number(await d.locator('[data-field="longitude"]').innerText()),
    ];
    expect(at.every(Number.isFinite)).toBe(true);
    expect(haversine(at, pin)).toBeGreaterThan(0.1); // the parcel is not where the map was
    await recenteredOn(page, at); // the map is centered on the parcel
    expect(await pinOf(page)).toEqual(pin); // the pin (and the search) did not move
    await expect(page.getByTestId("agent-turn")).toHaveCount(1);
  });

  /** Breakpoints of the aside (responsive-design-tests method): the answer's Sources are stacked at each. */
  const SOURCES_BREAKPOINTS = [
    { name: "desktop", viewport: { width: 1280, height: 900 } },
    { name: "tablet", viewport: { width: 768, height: 1024 } },
    { name: "phone (one column)", viewport: { width: 390, height: 844 } },
    { name: "widest one column", viewport: { width: 759, height: 900 } },
  ];
  const COLUMNS = ["ID", "Source", "License", "Attribution", "Collected at"];

  for (const bp of SOURCES_BREAKPOINTS)
    test(`37. ${bp.name} (${bp.viewport.width} px): the answer's Sources are stacked records, labelled, nothing cut off or one word per line`, async ({
      page,
    }) => {
      await page.setViewportSize(bp.viewport);
      await mockAnswers(page, [ANSWERED]);
      await page.goto(`/?lat=${VN.lat}&lon=${VN.lon}&z=13`);
      await ready(page);
      await page.getByTestId("map").click();
      await openAgent(page);
      await ask(page, QUESTION_1);
      const a = page.getByTestId("agent-answer");
      await expect(a).toHaveAttribute("data-status", "answered");
      await expand(a.getByTestId("agent-sources-details"));
      await a.scrollIntoViewIfNeeded();
      const answerBox = (await a.boundingBox())!;
      const tables = a.getByTestId("agent-sources");
      await expect(tables).toHaveCount(3);
      for (const t of await tables.all()) {
        await expect(t).toHaveCSS("display", "block");
        // Nothing to scroll sideways: the records fit the answer.
        expect(
          await t.evaluate(
            (el) =>
              el.parentElement!.scrollWidth <= el.parentElement!.clientWidth,
          ),
        ).toBe(true);
        for (const tr of await t.locator("tbody tr").all()) {
          const tds = tr.locator("td");
          await expect(tds).toHaveCount(5);
          for (let i = 0; i < 5; i++) {
            const td = tds.nth(i);
            await expect(td).toHaveCSS("display", "grid");
            expect(
              await td.evaluate(
                (el) => getComputedStyle(el, "::before").content,
              ),
            ).toBe(`"${COLUMNS[i]}"`);
            const box = (await td.boundingBox())!;
            expect(box.x + box.width).toBeLessThanOrEqual(
              answerBox.x + answerBox.width + 1,
            );
            expect(await splitWords(td)).toEqual([]);
            // Not one word per line: a value of several words shares lines.
            const words = ((await td.textContent()) ?? "").trim().split(/\s+/);
            if (words.length >= 4)
              expect(await lineCount(td)).toBeLessThan(words.length);
          }
          // "Collected at" is shown whole: each timestamp on one line.
          await expect(tds.nth(4)).toBeVisible();
          expect(await splitWords(tds.nth(4), "\\S+")).toEqual([]);
        }
      }
    });

  // The one-column layout (max-width 760px): the sticky controls covered the content below them (test 37 at
  // 390 px: <section class="controls"> intercepted the click on "Ask the agent"). Same steps as the local lane.
  for (const bp of LAYOUT_BREAKPOINTS)
    test(`42. ${bp.name} (${bp.viewport.width} px): ${bp.oneColumn ? "nothing covers the content below the controls; 'Ask the agent' opens with a plain click" : "the controls stay in place while the aside scrolls"}`, async ({
      page,
    }) => {
      await openLayout(page, bp);
      await expectLayout(page, bp);
    });
});
