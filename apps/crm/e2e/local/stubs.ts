/**
 * The local lane's stubs (*.local.ts): config.json, the data API, the leads API, the agent's warm-up and the basemap
 * style are answered here with dummy values; a request to any other host (or to /agent/answer) is aborted and fails
 * the test. No hosted call, no credentials. tRPC queries (GET) and mutations (POST), single or batched, are answered
 * from DATA, or from a test's own handler set with `stubs.answer`; every tRPC call is recorded in `stubs.calls`.
 */
import { expect, test, type Request, type Route } from "@playwright/test";

const DATA_API = "https://data-api.stub.invalid";
const LEADS_API = "https://leads-api.stub.invalid";
const AGENT_API = "https://agent-api.stub.invalid";
const TOKEN = "local-dummy-token";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
/** A basemap with nothing in it (the layout does not depend on the tiles). */
const BLANK_STYLE = { version: 8, sources: {}, layers: [] };

const rule = {
  roll_year: 2026,
  threshold_years: 15,
  built_before_year: 2011,
  text: "older than 15 years means built before 2011",
};
const PROXY =
  "PROXY: assessor year built / effective year built; not a roof installation date";
export const ids = Array.from({ length: 20 }, (_, i) =>
  String(i + 1).padStart(10, "0"),
);
const item = (id: string, i: number) => ({
  parcel_id: id,
  address: `${100 + i} TEST ST`,
  year_built: 1980,
  roof_age_years_proxy: 46,
  effective_roof_year: 1980,
  roof_age_years: 46,
  roof_age_basis: PROXY,
  roof_year_permit_number: null,
  permit_data_available: true,
  land_base_year: 1980,
  distance_miles: Number((0.05 * (i + 1)).toFixed(2)),
  latitude: 34.199 + 0.0005 * i,
  longitude: -118.487,
});
export const TS = "2026-11-16T12:00:00.000Z";
const DATA: Record<string, (input: Record<string, unknown>) => unknown> = {
  "explorer.runSummary": () => ({
    run: {
      run_id: "r",
      county: "Los Angeles",
      roll_year: "2026",
      scope: { jurisdiction: "all", zips: [] },
      row_counts: { parquet: 1000 },
      coverage: { with_year_built: 900, with_coordinates: 990 },
    },
    history: [],
  }),
  "explorer.sources": () => ({}),
  "parcels.search": () => ({
    count: ids.length,
    rule,
    items: ids.map(item),
    next_offset: null,
  }),
  "parcels.points": () => ({
    count: ids.length,
    encoding: "columnar-v1",
    precision: 5,
    id: ids,
    lat: ids.map((_, i) => 34.199 + 0.0005 * i),
    lon: ids.map(() => -118.487),
    long_open_permit: ids.map(() => 0),
    truncated: false,
    max_points: 25000,
  }),
  "parcels.match": () => ({ parcel_ids: [] }),
  // The leads list reads each shown lead's address at display time (never stored in the lead).
  "parcels.detail": (input) => {
    const parcel_id = String(input.parcel_id);
    const i = ids.indexOf(parcel_id);
    return {
      property: i < 0 ? { parcel_id } : { ...item(parcel_id, i) },
      provenance: { parcel_id, source_name: "stub" },
    };
  },
  "permits.longOpen": () => ({
    count: 0,
    rule: {
      reference_date: "2026-11-12",
      status_class: "open-issued",
      min_open_days: 1826,
      max_open_days: null,
      roof_age: null,
      text: "open-issued roofing permits open 5 years or more",
    },
    items: [],
    next_offset: null,
  }),
  "leads.list": () => ({
    items: ids.slice(0, 6).map((parcel_id) => ({
      parcel_id,
      status: "new",
      notes: "",
      created_at: TS,
      updated_at: TS,
    })),
    next_cursor: null,
  }),
};

type Handler = (input: Record<string, unknown>) => unknown;

/** tRPC over GET or POST (single or batched): each procedure answered from `answers`, an unknown one as NOT_FOUND. */
const trpc = (
  route: Route,
  req: Request,
  url: URL,
  answers: Record<string, Handler>,
  calls: { proc: string; input: Record<string, unknown> }[],
) => {
  const procs = decodeURIComponent(url.pathname.slice("/trpc/".length)).split(
    ",",
  );
  const input =
    req.method() === "POST"
      ? (req.postDataJSON() ?? {})
      : JSON.parse(url.searchParams.get("input") ?? "{}");
  const batch = url.searchParams.has("batch");
  const out = procs.map((p, k) => {
    const f = answers[p];
    const args = ((batch ? input[k] : input) ?? {}) as Record<string, unknown>;
    calls.push({ proc: p, input: args });
    return f
      ? { result: { data: f(args) } }
      : {
          error: {
            message: `no stub for ${p}`,
            code: -32004,
            data: { code: "NOT_FOUND", httpStatus: 404 },
          },
        };
  });
  return route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(batch ? out : out[0]),
  });
};

/**
 * Installs the stubs for every test in the calling file. A test may answer a procedure its own way with
 * `stubs.answer` (reset before each test) and read the tRPC calls the page made in `stubs.calls`.
 */
export function useLocalStubs() {
  const blocked: string[] = [];
  const stubs = {
    calls: [] as { proc: string; input: Record<string, unknown> }[],
    own: {} as Record<string, Handler>,
    answer(proc: string, f: Handler) {
      stubs.own[proc] = f;
    },
  };
  test.beforeEach(async ({ context, baseURL }) => {
    blocked.length = 0;
    stubs.calls.length = 0;
    stubs.own = {};
    const local = new URL(baseURL!).origin;
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body: unknown) =>
        route.fulfill({
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      if (url.origin === local)
        return url.pathname === "/config.json"
          ? json({
              client: "crm",
              apiUrl: DATA_API,
              leadsApiUrl: LEADS_API,
              agentApiUrl: AGENT_API,
              apiToken: TOKEN,
              mapKey: "local-dummy-map-key",
            })
          : route.continue();
      if (url.hostname === "maps.geo.eu-north-1.amazonaws.com")
        return json(BLANK_STYLE);
      if ([DATA_API, LEADS_API, AGENT_API].includes(url.origin)) {
        if (req.method() === "OPTIONS")
          return route.fulfill({ status: 204, headers: CORS });
        if (url.pathname.startsWith("/trpc/"))
          return trpc(route, req, url, { ...DATA, ...stubs.own }, stubs.calls);
        if (url.origin === AGENT_API && url.pathname === "/agent/warm")
          return json({ status: "warm" });
      }
      blocked.push(`${req.method()} ${req.url()}`);
      return route.abort("blockedbyclient");
    });
  });
  test.afterEach(() => {
    expect(blocked, "requests not answered by a local stub").toEqual([]);
  });
  return stubs;
}
