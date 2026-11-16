// @vitest-environment jsdom
/**
 * Component test of the CRM main screen (React Testing Library on jsdom, fake timers).
 * Mocks:
 * - ../src/maplibre.ts: a minimal fake MapLibre (Map records event handlers and sources; Marker/NavigationControl no-ops).
 *   WebGL is not available in jsdom, and the test needs to fire "load" and "click" itself.
 * - ../src/config.ts: loadConfig resolves a fixed config (no network).
 * - @oracle-la/api-client: createApiClient returns a CALLABLE object, like the real tRPC v11 proxy
 *   (typeof client === "function"), with vi.fn() procedures.
 * - @roofing-crm/leads-client: createLeadsClient likewise (the schemas and notes rule stay real).
 * - The api-client mock also carries permits.longOpen / permits.forParcel (src/permitsApi.ts). The permit
 *   and search fixtures are typed with the client's contract types, so they carry the served field names.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  LongOpenItem,
  LongOpenResult,
  ParcelPermit,
  ParcelPermits,
  PermitContractor,
  SearchItem,
} from "@oracle-la/api-client";

const h = vi.hoisted(() => {
  const maps: Array<{
    handlers: Record<string, Array<(e: unknown) => void>>;
    layers: Array<{ id: string; source?: string; filter?: unknown }>;
    sources: Record<string, { data?: unknown }>;
    fire: (ev: string, e?: unknown) => void;
    clickAt: (x: number, y: number) => void;
    zoom: number;
  }> = [];
  const search = vi.fn();
  const points = vi.fn();
  const detail = vi.fn();
  const match = vi.fn();
  const runSummary = vi.fn();
  const sources = vi.fn();
  const longOpen = vi.fn();
  const forParcel = vi.fn();
  const easeTo = vi.fn();
  const fitBounds = vi.fn();
  /** The arguments of every createApiClient call (one per client created). */
  const clients: unknown[] = [];
  const leads = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    maps,
    search,
    points,
    detail,
    match,
    runSummary,
    sources,
    longOpen,
    forParcel,
    easeTo,
    fitBounds,
    clients,
    leads,
  };
});

vi.mock("../src/maplibre.ts", () => {
  // Linear projection for the stub: 1 px = 1e-5 degree around (34.2, -118.49), y grows southwards.
  const proj = (c: [number, number]) => ({
    x: (c[0] + 118.49) * 1e5,
    y: (34.2 - c[1]) * 1e5,
  });
  class Map {
    handlers: Record<string, Array<(e: unknown) => void>> = {};
    sources: Record<
      string,
      {
        setData: (d: unknown) => void;
        data?: {
          features?: Array<{
            properties: { id: string };
            geometry: { type: string; coordinates: [number, number] };
          }>;
        };
      }
    > = {};
    zoom = 17;
    constructor() {
      h.maps.push(this as never);
    }
    addControl() {}
    on(ev: string, a: unknown, b?: unknown) {
      const key = typeof a === "function" ? ev : `${ev}:${String(a)}`;
      (this.handlers[key] ??= []).push(
        (typeof a === "function" ? a : b) as (e: unknown) => void,
      );
    }
    addSource(id: string) {
      const src: Map["sources"][string] = {
        setData: (d) => (src.data = d as never),
      };
      this.sources[id] = src;
    }
    layers: Array<{ id: string; source?: string; filter?: unknown }> = [];
    addLayer(l: { id: string; source?: string; filter?: unknown }) {
      this.layers.push(l);
    }
    getSource(id: string) {
      return this.sources[id];
    }
    getZoom() {
      return this.zoom;
    }
    project(c: [number, number]) {
      return proj(c);
    }
    queryRenderedFeatures(
      box: [[number, number], [number, number]],
      opts: { layers: string[] },
    ) {
      if (!opts.layers.includes("points")) return [];
      return (this.sources.points?.data?.features ?? []).filter((f) => {
        const p = proj(f.geometry.coordinates);
        return (
          p.x >= box[0][0] &&
          p.x <= box[1][0] &&
          p.y >= box[0][1] &&
          p.y <= box[1][1]
        );
      });
    }
    easeTo(o: unknown) {
      h.easeTo(o);
    }
    fitBounds(b: unknown, o: unknown) {
      h.fitBounds(b, o);
    }
    remove() {}
    getCanvas() {
      return { style: {} };
    }
    getCenter() {
      return { lat: 0, lng: 0 };
    }
    fire(ev: string, e?: unknown) {
      for (const f of this.handlers[ev] ?? []) f(e);
    }
    /** A real map click at screen pixel (x, y). */
    clickAt(x: number, y: number) {
      this.fire("click", {
        point: { x, y },
        lngLat: { lng: x / 1e5 - 118.49, lat: 34.2 - y / 1e5 },
      });
    }
  }
  class Marker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  class NavigationControl {}
  return { Map, Marker, NavigationControl, GeoJSONSource: class {} };
});
vi.mock("../src/config.ts", () => ({
  loadConfig: vi.fn(async () => ({
    client: "crm",
    apiUrl: "https://api.test",
    apiToken: "t",
    mapKey: "k",
  })),
}));
vi.mock("@oracle-la/api-client", () => ({
  createApiClient: (opts: unknown) =>
    h.clients.push(opts) &&
    Object.assign(() => undefined, {
      parcels: {
        search: { query: h.search },
        points: { query: h.points },
        detail: { query: h.detail },
        match: { query: h.match },
      },
      explorer: {
        runSummary: { query: h.runSummary },
        sources: { query: h.sources },
      },
      permits: {
        longOpen: { query: h.longOpen },
        forParcel: { query: h.forParcel },
      },
    }),
}));

vi.mock("@roofing-crm/leads-client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createLeadsClient: () =>
    Object.assign(() => undefined, {
      leads: {
        list: { query: h.leads.list },
        get: { query: h.leads.get },
        create: { mutate: h.leads.create },
        update: { mutate: h.leads.update },
        delete: { mutate: h.leads.delete },
      },
    }),
}));

import { App } from "../src/App.tsx";
import { ANSWERED, CITED_PARCEL, QUESTION_1 } from "../e2e/agent-fixtures.ts";
import {
  DEFAULT_MIN_DAYS,
  DEFAULT_WINDOW,
  MAX_DAYS,
  MAX_YEARS,
  yearsToDays,
} from "../src/permitDisplay.ts";
import { loadConfig } from "../src/config.ts";
import { MATCH_CHUNK } from "../src/leadsInSearch.ts";
import { OWNERSHIP_TEXTS, PROXY_NOTE } from "../src/ownership.ts";

const rule = {
  roll_year: 2026,
  threshold_years: 15,
  built_before_year: 2011,
  text: "older than 15 years means built before 2011",
};
/** The two roof-age basis labels as stored and served (roof_age_basis); clients test the first word. */
const PROXY =
  "PROXY: assessor year built / effective year built; not a roof installation date";
const PERMIT =
  "PERMIT: latest finaled LADBS roofing permit (status date); a roof coating alone does not count";
const item = (id: string, d: number): SearchItem => ({
  parcel_id: id,
  address: `${id} TEST ST`,
  year_built: 1980,
  roof_age_years_proxy: 46,
  effective_roof_year: 1980,
  roof_age_years: 46,
  roof_age_basis: PROXY,
  roof_year_permit_number: null,
  permit_data_available: true,
  land_base_year: 1980,
  distance_miles: d,
  latitude: 34.2,
  longitude: -118.49,
});
/** explorer.runSummary of a made-up county run: 1,000 parcels, 900 with year built, 990 with coordinates. */
const RUN = {
  run: {
    run_id: "r",
    county: "Los Angeles",
    roll_year: "2026",
    scope: { jurisdiction: "all", zips: [] },
    row_counts: { parquet: 1000 },
    coverage: { with_year_built: 900, with_coordinates: 990 },
  },
  history: [],
};
/** Permit answers with nothing in them (the default for the tests that are not about permits). */
const EMPTY_LONG_OPEN: LongOpenResult = {
  count: 0,
  rule: {
    reference_date: "2026-11-12",
    status_class: "open-issued",
    min_open_days: 1826,
    max_open_days: null,
    roof_age: null,
    text: "",
  },
  items: [],
  next_offset: null,
};
const NO_PERMITS: ParcelPermits = {
  parcel_id: "0000000001",
  permit_data_available: true,
  jurisdiction: "LOS ANGELES",
  effective_roof_year: 1980,
  roof_age_basis: PROXY,
  roof_year_permit_number: null,
  permits: [],
  bbb: { available: false, reason: "no BBB data source" },
};
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("CRM main screen", () => {
  // Stub pixels: 1 px = 1e-5 degree; 0000000001 at (0, 0), 0000000002 at (4, 0), 0000000003 at (1000, -1000).
  const PTS = {
    id: ["0000000001", "0000000002", "0000000003"],
    lat: [34.2, 34.2, 34.21],
    lon: [-118.49, -118.48996, -118.48],
  };
  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.easeTo.mockReset();
    h.match.mockReset();
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.longOpen.mockReset().mockResolvedValue(EMPTY_LONG_OPEN);
    h.forParcel.mockReset().mockResolvedValue(NO_PERMITS);
    h.search.mockReset().mockResolvedValue({
      count: 3,
      rule,
      items: [
        item("0000000001", 0.1),
        item("0000000002", 0.1),
        item("0000000003", 0.9),
      ],
      next_offset: null,
    });
    h.detail
      .mockReset()
      .mockImplementation(async ({ parcel_id }: { parcel_id: string }) => ({
        property: {
          parcel_id,
          address: `${parcel_id} TEST ST`,
          year_built: 1980,
          roof_age_basis: "PROXY",
          roll_year: 2026,
        },
        provenance: {
          parcel_id,
          source_name: "Test Source",
          source_request_url: "https://example.test/q",
          source_retrieved_at: "2026-11-11T16:17:40.932Z",
          source_page_sha256: "a".repeat(64),
        },
      }));
    h.points.mockReset().mockResolvedValue({
      count: 3,
      encoding: "columnar-v1",
      precision: 5,
      ...PTS,
      truncated: false,
      max_points: 25000,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** Render, load the map, drop a pin on empty map at (300, 100) and wait for the results. */
  const setup = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    act(() => map.clickAt(300, 100));
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(1);
    return map;
  };

  test("a pin produces rendered results with exactly one API call per input change, and none while idle", async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    expect(screen.getByTestId("result-count").textContent).toContain(
      "0 results",
    );

    act(() => map.clickAt(300, 100)); // empty map: drops the pin
    await wait(100);
    expect(h.search).toHaveBeenCalledTimes(0); // still inside the 250 ms debounce
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.points).toHaveBeenCalledTimes(1);
    const q0 = h.search.mock.calls[0]![0];
    expect(q0.lat).toBeCloseTo(34.199, 9);
    expect(q0.lon).toBeCloseTo(-118.487, 9);
    expect(q0).toMatchObject({ radius_miles: 1, threshold_years: 15 });
    expect(screen.getByTestId("map").dataset.circleRadiusMiles).toBe("1.000"); // the drawn circle
    expect(screen.getAllByTestId("result")).toHaveLength(3);
    expect(screen.getByTestId("result-count").textContent).toBe("3 results");

    await wait(5000); // idle: no further calls (regression test for the 250 ms re-query loop)
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.points).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("radius"), { target: { value: "5" } });
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.points).toHaveBeenCalledTimes(2);
    expect(h.search.mock.calls[1]![0]).toMatchObject({ radius_miles: 5 });
    expect(screen.getByTestId("map").dataset.circleRadiusMiles).toBe("5.000");
    await wait(5000);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.points).toHaveBeenCalledTimes(2);
  });

  test("a) a real map click on a point opens its details (no pin drop)", async () => {
    const map = await setup();
    // Render marker on "idle": the search key of the drawn points and the zoom.
    act(() => map.fire("idle"));
    expect(screen.getByTestId("map").dataset.renderedSearch).toBe(
      "34.19900,-118.48700|1|15",
    );
    expect(screen.getByTestId("map").dataset.renderedZoom).toBe("17");
    await act(async () => {
      map.clickAt(1000, -1000);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.detail).toHaveBeenCalledTimes(1);
    expect(h.detail).toHaveBeenCalledWith({ parcel_id: "0000000003" });
    expect(screen.getByTestId("detail").textContent).toContain(
      "0000000003 TEST ST",
    );
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(1); // the pin did not move
  });

  test("b) a click 3 px off a point still opens its details", async () => {
    const map = await setup();
    await act(async () => {
      map.clickAt(1003, -1000);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.detail).toHaveBeenCalledWith({ parcel_id: "0000000003" });
    expect(
      screen.getByTestId("detail").querySelector('[data-field="parcel_id"]')!
        .textContent,
    ).toBe("0000000003");
  });

  test("c) a click on empty map drops the pin", async () => {
    const map = await setup();
    act(() => map.clickAt(500, 500));
    await wait(300);
    expect(h.detail).not.toHaveBeenCalled();
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.search.mock.calls[1]![0].lon).toBeCloseTo(-118.485, 9);
    // Re-centring keeps the current zoom (no globe zoom adjustment on a latitude pan).
    expect(h.easeTo).toHaveBeenLastCalledWith({
      center: [-118.485, 34.195],
      zoom: 17,
      duration: 0,
    });
  });

  test("d) below the detail zoom, a click on a point drops the pin", async () => {
    const map = await setup();
    map.zoom = 15;
    act(() => map.clickAt(1000, -1000));
    await wait(300);
    expect(h.detail).not.toHaveBeenCalled();
    expect(h.search).toHaveBeenCalledTimes(2);
  });

  test("e) with several points inside the tolerance, the nearest one opens", async () => {
    const map = await setup();
    await act(async () => {
      map.clickAt(3, 1); // 0000000001 is 3.2 px away, 0000000002 is 1.4 px away
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.detail).toHaveBeenCalledTimes(1);
    expect(h.detail).toHaveBeenCalledWith({ parcel_id: "0000000002" });
  });
});

describe("the ownership filter on the search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.easeTo.mockReset();
    h.match.mockReset();
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.longOpen.mockReset().mockResolvedValue(EMPTY_LONG_OPEN);
    h.forParcel.mockReset().mockResolvedValue(NO_PERMITS);
    vi.mocked(loadConfig).mockResolvedValue({
      client: "crm",
      apiUrl: "https://api.test",
      apiToken: "t",
      mapKey: "k",
    });
    // The API states the basis it applied with the contract's texts (null without one).
    h.search
      .mockReset()
      .mockImplementation(
        async (i: { ownership_basis?: keyof typeof OWNERSHIP_TEXTS }) => ({
          count: i.ownership_basis ? 1 : 2,
          rule,
          ownership: i.ownership_basis
            ? {
                basis: i.ownership_basis,
                ...OWNERSHIP_TEXTS[i.ownership_basis],
                proxy_note: PROXY_NOTE,
              }
            : null,
          items: [item("0000000001", 0.1)],
          next_offset: null,
        }),
      );
    h.points.mockReset().mockResolvedValue({
      count: 1,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000001"],
      lat: [34.2],
      lon: [-118.49],
      permit_data_available: [1],
      long_open_permit: [0],
      long_open: { min_open_days: 1826, max_open_days: null },
      ownership: null,
      truncated: false,
      max_points: 25000,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.mocked(loadConfig).mockReset();
  });
  const pinned = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    act(() => map.clickAt(300, 100));
    await wait(300);
    return map;
  };
  const last = (f: typeof h.search) =>
    f.mock.lastCall![0] as Record<string, unknown>;

  test("off by default: no basis is sent to search or points, and none is stated", async () => {
    await pinned();
    expect(
      (screen.getByTestId("ownership-on") as HTMLInputElement).checked,
    ).toBe(false);
    expect(screen.queryAllByTestId("ownership-basis")).toHaveLength(0);
    expect("ownership_basis" in last(h.search)).toBe(false);
    expect("ownership_basis" in last(h.points)).toBe(false);
    expect(screen.queryByTestId("ownership-rules")).toBeNull();
    expect(screen.getByTestId("results-showing").textContent).not.toMatch(
      /ownership/,
    );
    expect(screen.getByTestId("result-count").textContent).toBe("2 results");
  });

  test("turned on, 'both' is preselected; the three bases' texts, weaknesses and the proxy note are the contract's, in one collapsed details; search and points get the basis and the results state the API's basis", async () => {
    const map = await pinned();
    fireEvent.click(screen.getByTestId("ownership-on"));
    expect(
      screen.getAllByTestId("ownership-basis").map((e) => e.dataset.basis),
    ).toEqual(["both", "recording", "base_year"]);
    expect(
      (screen.getByTestId("ownership-basis-both") as HTMLInputElement).checked,
    ).toBe(true);
    const bases = ["both", "recording", "base_year"] as const;
    const rules = screen.getByTestId("ownership-rules") as HTMLDetailsElement;
    expect(rules.tagName).toBe("DETAILS");
    expect(rules.open).toBe(false);
    expect(
      within(rules)
        .getAllByTestId("ownership-basis-rule")
        .map((e) => e.dataset.basis),
    ).toEqual(bases);
    expect(
      screen.getAllByTestId("ownership-text").map((e) => e.textContent),
    ).toEqual(bases.map((b) => OWNERSHIP_TEXTS[b].text));
    expect(
      screen.getAllByTestId("ownership-weakness").map((e) => e.textContent),
    ).toEqual(bases.map((b) => `Weakness: ${OWNERSHIP_TEXTS[b].weakness}`));
    expect(screen.getByTestId("ownership-proxy-note").textContent).toBe(
      PROXY_NOTE,
    );
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(last(h.search)).toMatchObject({ ownership_basis: "both" });
    expect(last(h.points)).toMatchObject({ ownership_basis: "both" });
    expect(screen.getByTestId("results-showing").textContent).toMatch(
      / · ownership filter: both$/,
    );
    expect(screen.getByTestId("result-count").textContent).toBe("1 results");
    // The search key carries the basis (the map's render marker shows it).
    act(() => map.fire("idle"));
    expect(screen.getByTestId("map").dataset.renderedSearch).toBe(
      "34.19900,-118.48700|1|15|both",
    );
    // Another basis: one new search, stated as the API's.
    fireEvent.click(screen.getByTestId("ownership-basis-recording"));
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(3);
    expect(last(h.search)).toMatchObject({ ownership_basis: "recording" });
    expect(last(h.points)).toMatchObject({ ownership_basis: "recording" });
    expect(screen.getByTestId("results-showing").textContent).toMatch(
      / · ownership filter: recording$/,
    );
    // Off again: no basis is sent and none is stated; the key is the one without the filter.
    fireEvent.click(screen.getByTestId("ownership-on"));
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(4);
    expect("ownership_basis" in last(h.search)).toBe(false);
    expect(screen.queryByTestId("ownership-rules")).toBeNull();
    act(() => map.fire("idle"));
    expect(screen.getByTestId("map").dataset.renderedSearch).toBe(
      "34.19900,-118.48700|1|15",
    );
    await wait(5000);
    expect(h.search).toHaveBeenCalledTimes(4);
  });
});

describe("layout: controls, rule texts and lists", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.forParcel.mockReset().mockResolvedValue(NO_PERMITS);
    h.longOpen.mockReset().mockResolvedValue({
      ...EMPTY_LONG_OPEN,
      rule: { ...EMPTY_LONG_OPEN.rule, text: "API LONG-OPEN RULE TEXT" },
    });
    vi.mocked(loadConfig).mockResolvedValue({
      client: "crm",
      apiUrl: "https://api.test",
      apiToken: "t",
      mapKey: "k",
    });
    h.search
      .mockReset()
      .mockImplementation(
        async (i: { ownership_basis?: keyof typeof OWNERSHIP_TEXTS }) => ({
          count: 2,
          rule,
          ownership: i.ownership_basis
            ? {
                basis: i.ownership_basis,
                ...OWNERSHIP_TEXTS[i.ownership_basis],
                proxy_note: PROXY_NOTE,
              }
            : null,
          items: [item("0000000001", 0.1), item("0000000002", 0.2)],
          next_offset: null,
        }),
      );
    h.points.mockReset().mockResolvedValue({
      count: 2,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000001", "0000000002"],
      lat: [34.2, 34.2],
      lon: [-118.49, -118.48],
      truncated: false,
      max_points: 25000,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.mocked(loadConfig).mockReset();
  });
  const pinned = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    act(() => map.clickAt(300, 100));
    await wait(300);
    return map;
  };
  /** How many times a text occurs in the page. */
  const occurrences = (text: string) =>
    document.body.textContent!.split(text).length - 1;

  test("each rule text is in the page once, inside a collapsed details element (roof age, ownership, long-open, the API's long-open rule)", async () => {
    await pinned();
    fireEvent.click(screen.getByTestId("ownership-on"));
    await wait(300);
    await flush();
    const texts = [
      rule.text,
      ...(["both", "recording", "base_year"] as const).flatMap((b) => [
        OWNERSHIP_TEXTS[b].text,
        OWNERSHIP_TEXTS[b].weakness,
      ]),
      PROXY_NOTE,
      "Only permits with status class Open (issued) count as open.",
      "API LONG-OPEN RULE TEXT",
    ];
    for (const t of texts) {
      expect([t, occurrences(t)]).toEqual([t, 1]);
      // The innermost element holding the text.
      const holder = [...document.querySelectorAll("aside *")].find(
        (e) =>
          e.textContent!.includes(t) &&
          ![...e.children].some((c) => c.textContent!.includes(t)),
      )!;
      const details = holder.closest("details")!;
      expect(details.classList.contains("rule-details")).toBe(true);
      expect(details.open).toBe(false);
    }
    expect(
      [...document.querySelectorAll("details.rule-details")].map(
        (d) => (d as HTMLElement).dataset.testid,
      ),
    ).toEqual(["rule-details", "ownership-rules", "permits-rule-details"]);
  });

  test("the controls are one block at the top of the aside; results, permits and leads lists are closed until opened, with their counts in the summary", async () => {
    await pinned();
    const controls = document.querySelector("aside > section.controls")!;
    expect(controls).toBe(document.querySelector("aside")!.firstElementChild);
    for (const id of [
      "gps",
      "radius",
      "threshold",
      "ownership-on",
      "data-notice",
    ])
      expect(controls.contains(screen.getByTestId(id))).toBe(true);
    const results = screen.getByTestId("results-details") as HTMLDetailsElement;
    expect(results.open).toBe(false);
    expect(results.querySelector("summary")!.textContent).toBe(
      "Results 2 · showing 1–2 by distance",
    );
    expect(results.contains(screen.getAllByTestId("result")[0]!)).toBe(true);
    const permits = screen.getByTestId("permits-details") as HTMLDetailsElement;
    expect(permits.open).toBe(false);
    expect(permits.querySelector("summary")!.textContent).toBe(
      "Permits 0 long-open permits · showing 0–0",
    );
    // An opened list stays open through a new search.
    results.open = true;
    permits.open = true;
    fireEvent.change(screen.getByTestId("radius"), {
      target: { value: "2" },
    });
    await wait(300);
    await flush();
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(
      (screen.getByTestId("results-details") as HTMLDetailsElement).open,
    ).toBe(true);
    expect(
      (screen.getByTestId("permits-details") as HTMLDetailsElement).open,
    ).toBe(true);
  });

  test("after 'Use my location' the map zooms to the radius circle and the open details panel closes; the pin is rounded to 5 decimals", async () => {
    h.detail.mockReset().mockResolvedValue({
      property: { parcel_id: "0000000001", roll_year: 2026 },
      provenance: { parcel_id: "0000000001", source_name: "Test Source" },
    });
    await pinned();
    fireEvent.click(screen.getAllByTestId("result")[0]!);
    await flush();
    expect(screen.getByTestId("detail")).toBeTruthy();
    fireEvent.change(screen.getByTestId("radius"), {
      target: { value: "2" },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 34.1234567, longitude: -118.3456789 } }),
      },
    });
    try {
      h.fitBounds.mockClear();
      h.easeTo.mockClear();
      fireEvent.click(screen.getByTestId("gps"));
      await wait(300);
      expect(screen.queryByTestId("detail")).toBeNull();
      expect(screen.getByTestId("map").dataset.pinLat).toBe("34.12346");
      expect(screen.getByTestId("map").dataset.pinLon).toBe("-118.34568");
      expect(last(h.search)).toMatchObject({
        lat: 34.12346,
        lon: -118.34568,
        radius_miles: 2,
      });
      // Fitted to the circle (2 miles each way: about 0.029 degrees of latitude), not panned.
      expect(h.easeTo).not.toHaveBeenCalled();
      expect(h.fitBounds).toHaveBeenCalledTimes(1);
      const [[sw, ne], opts] = h.fitBounds.mock.calls[0]! as [
        [[number, number], [number, number]],
        unknown,
      ];
      expect((sw[1] + ne[1]) / 2).toBeCloseTo(34.12346, 3);
      expect((sw[0] + ne[0]) / 2).toBeCloseTo(-118.34568, 3);
      expect(ne[1] - sw[1]).toBeCloseTo((2 * 2) / 69.05, 2);
      expect(opts).toMatchObject({ duration: 0 });
    } finally {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });
  const last = (f: typeof h.search) =>
    f.mock.lastCall![0] as Record<string, unknown>;
});

describe("leads (with leadsApiUrl in config.json)", () => {
  const T0 = "2026-11-12T10:00:00.000Z";
  const T1 = "2026-11-12T10:05:00.000Z";
  const lead = (parcel_id: string, status = "new", updated_at = T0) => ({
    parcel_id,
    status,
    notes: "",
    created_at: T0,
    updated_at,
  });
  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.match.mockReset();
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.longOpen.mockReset().mockResolvedValue(EMPTY_LONG_OPEN);
    h.forParcel.mockReset().mockResolvedValue(NO_PERMITS);
    vi.mocked(loadConfig).mockResolvedValue({
      client: "crm",
      apiUrl: "https://api.test",
      leadsApiUrl: "https://leads.test",
      apiToken: "t",
      mapKey: "k",
    });
    h.search.mockReset().mockResolvedValue({
      count: 1,
      rule,
      items: [item("0000000003", 0.9)],
      next_offset: null,
    });
    h.points.mockReset().mockResolvedValue({
      count: 1,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000003"],
      lat: [34.21],
      lon: [-118.48],
      truncated: false,
      max_points: 25000,
    });
    h.detail
      .mockReset()
      .mockImplementation(async ({ parcel_id }: { parcel_id: string }) => ({
        property: {
          parcel_id,
          address: `${parcel_id} TEST ST`,
          roll_year: 2026,
        },
        provenance: { parcel_id, source_name: "Test Source" },
      }));
    for (const f of Object.values(h.leads)) f.mockReset();
    h.leads.list.mockResolvedValue({
      items: [lead("0000000003", "contacted"), lead("0000000009", "won")],
      next_cursor: null,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.mocked(loadConfig).mockReset();
  });
  const start = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    return map;
  };
  /** Drop a pin (so the points are drawn), then click the point 0000000003. */
  const openDetail = async (map: (typeof h.maps)[number]) => {
    act(() => map.clickAt(300, 100));
    await wait(300);
    await act(async () => {
      map.clickAt(1000, -1000); // the point 0000000003
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  test("create a lead from the parcel detail; it appears in the list", async () => {
    h.leads.list.mockResolvedValue({ items: [], next_cursor: null });
    h.leads.get.mockResolvedValue(null);
    h.leads.create.mockImplementation(
      async (v: { parcel_id: string; status: string; notes: string }) => ({
        ...v,
        created_at: T0,
        updated_at: T0,
      }),
    );
    const map = await start();
    await openDetail(map);
    expect(h.leads.get).toHaveBeenCalledWith({ parcel_id: "0000000003" });
    fireEvent.change(screen.getByTestId("lead-notes"), {
      target: { value: "Original roof." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-create"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.leads.create).toHaveBeenCalledWith({
      parcel_id: "0000000003",
      status: "new",
      notes: "Original roof.",
    });
    expect(screen.getByTestId("lead-save")).toBeTruthy();
    // The stored timestamp is shown as its date (YYYY-MM-DD), in the editor and the list.
    expect(screen.getByTestId("lead-updated").textContent).toMatch(
      /^Updated \d{4}-\d{2}-\d{2}$/,
    );
    expect(
      [...screen.getAllByTestId("lead-item")[0]!.querySelectorAll("td")].map(
        (td) => td.textContent,
      ),
    ).toEqual(["0000000003", "new", "2026-11-12", "—"]);
    expect(
      screen.getAllByTestId("lead-item").map((e) => e.dataset.parcel),
    ).toEqual(["0000000003"]);
  });

  test("a lead created from a permit row records that permit (source_permit); the editor shows it read only and the list has a Permit column; opened any other way, none is sent", async () => {
    const PERMIT = "16016-10000-24567";
    h.longOpen.mockResolvedValue({
      ...EMPTY_LONG_OPEN,
      count: 1,
      items: [
        {
          permit_number: PERMIT,
          address: "1 ROOF ST",
          postal_code: "91405",
          source_permit_type: "Bldg-Alter/Repair",
          source_permit_sub_type: "1 or 2 Family Dwelling",
          source_status_desc: "Issued",
          permit_status_class: "open-issued",
          application_received_date: "2010-02-01",
          permit_issue_date: "2010-03-01",
          status_date: "2010-03-01",
          open_since: "2010-03-01",
          open_days: 6000,
          roofing_work: true,
          roof_coating_only: false,
          join_method: "direct",
          building_level: false,
          parcel_count: 1,
          parcel_id: "0000000003",
          distance_miles: 0.9,
          effective_roof_year: 1980,
          roof_age_basis: PROXY,
          roof_year_permit_number: null,
        },
      ],
    } as LongOpenResult);
    h.leads.list.mockResolvedValue({
      items: [
        { ...lead("0000000009", "won"), source_permit: "11111-22222-33333" },
      ],
      next_cursor: null,
    });
    h.leads.get.mockResolvedValue(null);
    h.leads.create.mockImplementation(
      async (v: { parcel_id: string; status: string; notes: string }) => ({
        ...v,
        created_at: T0,
        updated_at: T0,
      }),
    );
    const map = await start();
    await flush();
    const permitCell = (parcel: string) =>
      screen
        .getAllByTestId("lead-item")
        .find((r) => r.dataset.parcel === parcel)!
        .querySelector('[data-testid="lead-permit"]')!.textContent;
    expect(
      [...screen.getByTestId("leads").querySelectorAll("thead th")].map(
        (th) => th.textContent,
      ),
    ).toEqual(["Parcel", "Status", "Updated", "Permit"]);
    expect(permitCell("0000000009")).toBe("11111-22222-33333");
    h.leads.delete.mockResolvedValue({
      parcel_id: "0000000003",
      deleted: true,
    });
    // Opened from its map point (not a permit row): no permit is shown or sent.
    act(() => map.clickAt(300, 100));
    await wait(300);
    await flush();
    await act(async () => {
      map.clickAt(1000, -1000); // the point 0000000003
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(screen.getByTestId("lead").dataset.parcel).toBe("0000000003");
    expect(screen.queryByTestId("lead-source-permit")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-create"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.leads.create).toHaveBeenCalledTimes(1);
    expect("source_permit" in h.leads.create.mock.lastCall![0]).toBe(false);
    expect(permitCell("0000000003")).toBe("—");
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-delete"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("lead-create")).toBeTruthy();
    // Opened from the permit's row: the editor says the permit is recorded, and the create sends it.
    await act(async () => {
      fireEvent.click(screen.getByTestId("permit-row"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(screen.getByTestId("lead").dataset.parcel).toBe("0000000003");
    expect(screen.getByTestId("lead-source-permit").textContent).toBe(
      `A lead created here records permit ${PERMIT}`,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-create"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.leads.create).toHaveBeenLastCalledWith({
      parcel_id: "0000000003",
      status: "new",
      notes: "",
      source_permit: PERMIT,
    });
    // Read only: shown as text, never a field.
    const shown = screen.getByTestId("lead-source-permit");
    expect(shown.textContent).toBe(`From permit ${PERMIT}`);
    expect(shown.querySelector("input, textarea, select")).toBeNull();
    expect(
      screen
        .getByTestId("lead")
        .querySelector(
          'input[name="source_permit"], [data-field="source_permit"]',
        ),
    ).toBeNull();
    expect(permitCell("0000000003")).toBe(PERMIT);
  });

  test("notes with a parcel ID or a phone number are refused in the UI with the reason", async () => {
    h.leads.get.mockResolvedValue(null);
    const map = await start();
    await openDetail(map);
    fireEvent.change(screen.getByTestId("lead-notes"), {
      target: { value: "same as 2319005018" },
    });
    expect(screen.getByTestId("lead-notes-problem").textContent).toMatch(
      /10-digit parcel ID/,
    );
    expect(screen.getByTestId("lead-notes-hint").textContent).toMatch(
      /^No owner names or contact details\./,
    );
    expect(
      (screen.getByTestId("lead-create") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(h.leads.create).not.toHaveBeenCalled();
  });

  test("a CONFLICT on save shows 'Changed elsewhere, reload'; Reload reads the lead again", async () => {
    h.leads.get.mockResolvedValueOnce(lead("0000000003", "contacted"));
    h.leads.update.mockRejectedValue(
      Object.assign(new Error("conflict"), { data: { code: "CONFLICT" } }),
    );
    const map = await start();
    await openDetail(map);
    fireEvent.change(screen.getByTestId("lead-status"), {
      target: { value: "won" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-save"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.leads.update).toHaveBeenCalledWith({
      parcel_id: "0000000003",
      expected_updated_at: T0,
      status: "won",
      notes: "",
    });
    expect(screen.getByTestId("lead-conflict").textContent).toContain(
      "Changed elsewhere, reload",
    );
    h.leads.get.mockResolvedValueOnce(lead("0000000003", "qualified", T1));
    await act(async () => {
      fireEvent.click(screen.getByTestId("lead-reload"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.leads.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("lead-conflict")).toBeNull();
    expect((screen.getByTestId("lead-status") as HTMLSelectElement).value).toBe(
      "qualified",
    );
  });

  /** A list page of 100 leads with IDs from `first`, and the given next cursor. */
  const page = (first: number, next_cursor: string | null) => ({
    items: Array.from({ length: 100 }, (_, i) =>
      lead(String(first + i).padStart(10, "0")),
    ),
    next_cursor,
  });

  test("the leads list reads every page until the cursor ends, with no cap notice", async () => {
    h.leads.list
      .mockResolvedValueOnce(page(0, "0000000099"))
      .mockResolvedValueOnce(page(100, "0000000199"))
      .mockResolvedValueOnce(page(200, null));
    await start();
    await flush();
    expect(h.leads.list).toHaveBeenCalledTimes(3);
    expect(h.leads.list.mock.calls.map((c) => c[0])).toEqual([
      { limit: 100, cursor: undefined },
      { limit: 100, cursor: "0000000099" },
      { limit: 100, cursor: "0000000199" },
    ]);
    expect(screen.getByTestId("leads-count").textContent).toBe("300");
    expect(screen.queryByTestId("leads-cap-notice")).toBeNull();
  });

  test("when 20 pages of 100 still leave a cursor, the list stops and shows the cap notice", async () => {
    // A cursor that never ends: every page has 100 new leads and a next cursor.
    let n = 0;
    h.leads.list.mockImplementation(async () => {
      const p = page(n, String(n + 99).padStart(10, "0"));
      n += 100;
      return p;
    });
    await start();
    await flush();
    expect(h.leads.list).toHaveBeenCalledTimes(20);
    expect(screen.getByTestId("leads-count").textContent).toBe("2000");
    expect(screen.getByTestId("leads-cap-notice").textContent).toMatch(
      /^Showing the first 2,000 leads\./,
    );
  });

  test("'Leads in this search' keeps the leads whose parcel is in the current result; status filter", async () => {
    const map = await start();
    await flush();
    expect(screen.getByTestId("leads-count").textContent).toBe("2");
    expect(
      (screen.getByTestId("leads-in-search") as HTMLInputElement).disabled,
    ).toBe(true);
    act(() => map.clickAt(300, 100));
    await wait(300);
    fireEvent.click(screen.getByTestId("leads-in-search"));
    expect(
      screen.getAllByTestId("lead-item").map((e) => e.dataset.parcel),
    ).toEqual(["0000000003"]);
    fireEvent.click(screen.getByTestId("leads-in-search"));
    fireEvent.change(screen.getByTestId("leads-status-filter"), {
      target: { value: "won" },
    });
    expect(
      screen.getAllByTestId("lead-item").map((e) => e.dataset.parcel),
    ).toEqual(["0000000009"]);
  });

  describe("county notices and 'Leads in this search' when the points are capped", () => {
    /** 25,000 drawn of 30,000 matching; the drawn IDs are 0000000003 and 0000000004. */
    const capped = (ids = ["0000000003", "0000000004"]) => ({
      count: 30000,
      encoding: "columnar-v1",
      precision: 5,
      id: ids,
      lat: ids.map(() => 34.21),
      lon: ids.map(() => -118.48),
      truncated: true,
      max_points: 25000,
    });
    /** n leads in pages of 100, IDs from 1,000,000 (none of them drawn). */
    const leadPages = (n: number) => {
      const pages = Array.from({ length: Math.ceil(n / 100) }, (_, i) => ({
        items: Array.from({ length: Math.min(100, n - i * 100) }, (_, j) =>
          lead(String(1_000_000 + i * 100 + j).padStart(10, "0")),
        ),
        next_cursor: i * 100 + 100 < n ? `c${i}` : null,
      }));
      let k = 0;
      h.leads.list.mockImplementation(async () => pages[k++]);
    };
    const throttled = () =>
      Object.assign(new Error("Too Many Requests"), {
        data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
      });
    /** Start, drop a pin (search + points) and turn on "Leads in this search". */
    const searchAndFilter = async () => {
      const map = await start();
      await flush();
      act(() => map.clickAt(300, 100));
      await wait(300);
      fireEvent.click(screen.getByTestId("leads-in-search"));
      await flush();
    };

    test("the data notice comes from the run summary: county-wide, parcels, no-year-built share", async () => {
      await start();
      await flush();
      const text = screen.getByTestId("data-notice").textContent!;
      expect(text).toMatch(
        /Los Angeles County Assessor roll 2026, county-wide, 1,000 parcels/,
      );
      expect(text).not.toMatch(/pilot|91405/);
      expect(screen.getByTestId("data-no-year-built-pct").textContent).toBe(
        "10.00%",
      );
      expect(screen.getByTestId("data-coverage").textContent).toMatch(
        /10\.00% of parcels have no year built in the assessor roll and 1\.00% have no coordinates; they never appear in roof-age results\./,
      );
    });

    test("the data notice states the permit coverage from the run summary; the lead list says what it filters by", async () => {
      // A run without permit coverage: no permit line.
      await start();
      await flush();
      expect(screen.queryByTestId("data-permit-coverage")).toBeNull();
      cleanup();
      h.maps.length = 0;
      h.runSummary.mockResolvedValue({
        ...RUN,
        run: {
          ...RUN.run,
          coverage: {
            ...RUN.run.coverage,
            permit_data: {
              parcels_with_permit_data: 400,
              parcels_without_permit_data: 600,
              parcels_with_permits: 150,
            },
          },
        },
      });
      await start();
      await flush();
      expect(screen.getByTestId("data-permit-coverage").textContent).toBe(
        "Permit coverage: LADBS building permits, City of Los Angeles only: 400 of the 1,000 parcels have permit data (150 with at least one permit).",
      );
      expect(screen.getByTestId("data-permit-parcels").textContent).toBe("400");
      expect(screen.getByTestId("leads-permit-filter-note").textContent).toBe(
        "permit status Leads filter by status, by this search (radius, roof age and ownership) and by a long-open roofing permit in the map's open-duration window, which the data API checks; not by other permit statuses: open a lead to see its parcel's permits.",
      );
      expect(document.body.textContent).not.toMatch(/not harvested/i);
    });

    test("the long-open count beside the results badge equals the legend; 'of the M drawn' when the points are truncated; hidden when none is marked", async () => {
      // An API without the column: the legend says so and no badge shows.
      const map = await start();
      act(() => map.clickAt(300, 100));
      await wait(300);
      expect(screen.getByTestId("legend-long-open-unavailable")).toBeTruthy();
      expect(screen.queryByTestId("result-long-open")).toBeNull();
      // Marked, none in the window: the legend says 0, no badge.
      h.points.mockResolvedValue({
        ...capped(),
        long_open_permit: [0, 0],
        long_open: { min_open_days: 1826, max_open_days: null },
      });
      fireEvent.change(screen.getByTestId("radius"), {
        target: { value: "9" },
      });
      await wait(300);
      expect(screen.getByTestId("legend-long-open").dataset.count).toBe("0");
      expect(screen.queryByTestId("result-long-open")).toBeNull();
      // Truncated, one marked: "1 of the 2 drawn", the legend's number.
      h.points.mockResolvedValue({
        ...capped(),
        long_open_permit: [1, 0],
        long_open: { min_open_days: 1826, max_open_days: null },
      });
      fireEvent.change(screen.getByTestId("radius"), {
        target: { value: "10" },
      });
      await wait(300);
      expect(screen.getByTestId("result-long-open").textContent).toBe(
        "1 of the 2 drawn with a long-open roofing permit (open at least 1,826 days)",
      );
      expect(screen.getByTestId("result-long-open-count").textContent).toBe(
        screen.getByTestId("legend-long-open-count").textContent,
      );
      expect(screen.getByTestId("legend-long-open").textContent).toBe(
        "Has a long-open roofing permit (open at least 1,826 days): 1 of the 2 parcels drawn",
      );
    });

    test("truncated points show the nearest-N-of-M notice; untruncated points do not", async () => {
      const map = await start();
      act(() => map.clickAt(300, 100));
      await wait(300);
      expect(screen.queryByTestId("points-truncated")).toBeNull();
      h.points.mockResolvedValue(capped());
      fireEvent.change(screen.getByTestId("radius"), {
        target: { value: "10" },
      });
      await wait(300);
      expect(screen.getByTestId("points-truncated").textContent).toBe(
        "Map shows the nearest 25,000 of 30,000 matching parcels; the count and the list cover all 30,000.",
      );
    });

    test("a missing year built shows 'not in source' in the parcel detail", async () => {
      h.leads.get.mockResolvedValue(null);
      const map = await start();
      await openDetail(map);
      expect(
        screen.getByTestId("detail").querySelector('[data-field="year_built"]')!
          .textContent,
      ).toBe("not in source");
    });

    test("not truncated: the drawn IDs decide and no match call is made", async () => {
      await searchAndFilter();
      await wait(2000);
      expect(h.match).not.toHaveBeenCalled();
      expect(
        screen.getAllByTestId("lead-item").map((e) => e.dataset.parcel),
      ).toEqual(["0000000003"]);
    });

    test("truncated, all leads drawn: no match call", async () => {
      h.points.mockResolvedValue(capped(["0000000003", "0000000009"]));
      await searchAndFilter();
      await wait(2000);
      expect(h.match).not.toHaveBeenCalled();
      expect(screen.getByTestId("leads-count").textContent).toBe("2");
    });

    test("at the cap: 2,000 leads, none drawn, give 28 paced match calls of at most MATCH_CHUNK (72, the API's MAX_MATCH_IDS) IDs (2 in flight at most, starts 250 ms apart)", async () => {
      h.points.mockResolvedValue(capped());
      leadPages(2000);
      const starts: number[] = [];
      let inFlight = 0;
      let maxInFlight = 0;
      const asked: string[] = [];
      h.match.mockImplementation(
        async (v: { parcel_ids: string[]; radius_miles: number }) => {
          starts.push(Date.now());
          asked.push(...v.parcel_ids);
          maxInFlight = Math.max(maxInFlight, ++inFlight);
          // 1 s per call: the 250 ms spacing alone would allow 4 in flight, so only the limit keeps it at 2.
          await new Promise((r) => setTimeout(r, 1000));
          inFlight--;
          // Every third parcel matches.
          return { parcel_ids: v.parcel_ids.filter((id) => +id % 3 === 0) };
        },
      );
      await searchAndFilter();
      expect(screen.getByTestId("leads-checking").textContent).toBe(
        "checking 2,000 leads…",
      );
      expect(screen.queryAllByTestId("lead-item")).toHaveLength(0); // never a partial list
      await wait(30_000);
      expect(MATCH_CHUNK).toBe(72);
      expect(h.match).toHaveBeenCalledTimes(Math.ceil(2000 / MATCH_CHUNK));
      expect(h.match).toHaveBeenCalledTimes(28);
      expect(
        h.match.mock.calls.every(
          ([v]) =>
            (v as { parcel_ids: string[] }).parcel_ids.length <= MATCH_CHUNK,
        ),
      ).toBe(true);
      expect(new Set(asked).size).toBe(2000);
      expect(maxInFlight).toBe(2);
      for (let i = 1; i < starts.length; i++)
        expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(250);
      const want = Array.from({ length: 2000 }, (_, i) => 1_000_000 + i).filter(
        (n) => n % 3 === 0,
      ).length;
      expect(screen.queryByTestId("leads-checking")).toBeNull();
      expect(screen.getByTestId("leads-count").textContent).toBe(String(want));
    });

    test("a TOO_MANY_REQUESTS answer is retried once after 1 s", async () => {
      h.points.mockResolvedValue(capped());
      leadPages(100);
      const starts: number[] = [];
      h.match.mockImplementation(async (v: { parcel_ids: string[] }) => {
        starts.push(Date.now());
        if (starts.length === 1) throw throttled();
        return { parcel_ids: v.parcel_ids.slice(0, 1) };
      });
      await searchAndFilter();
      await wait(5000);
      // Chunk 1 (72) is refused, chunk 2 (28) starts 250 ms later, chunk 1 is retried 1 s after its refusal.
      expect(h.match).toHaveBeenCalledTimes(3);
      expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(1000);
      expect(screen.queryByTestId("leads-search-error")).toBeNull();
      expect(screen.getByTestId("leads-count").textContent).toBe("2");
    });

    test("a second refusal is an error state, never a partial list", async () => {
      h.points.mockResolvedValue(capped());
      leadPages(100);
      h.match.mockImplementation(async (v: { parcel_ids: string[] }) => {
        if (v.parcel_ids.length === MATCH_CHUNK) throw throttled();
        return { parcel_ids: v.parcel_ids };
      });
      await searchAndFilter();
      await wait(5000);
      expect(screen.getByTestId("leads-search-error").textContent).toMatch(
        /^Could not check 100 leads against this search: Too Many Requests/,
      );
      expect(screen.queryAllByTestId("lead-item")).toHaveLength(0);
      expect(screen.queryByTestId("leads-checking")).toBeNull();
    });
  });
  describe("'Has a long-open roofing permit': always through parcels.match", () => {
    type MatchCall = Record<string, unknown> & { parcel_ids: string[] };
    const calls = () => h.match.mock.calls.map(([v]) => v as MatchCall);
    const listed = () =>
      screen.queryAllByTestId("lead-item").map((e) => e.dataset.parcel);
    /** parcels.match as the API answers it: the given IDs among `hits`, with the window echoed. */
    const answer =
      (hits: string[]) =>
      async (
        v: MatchCall & { min_open_days?: number; max_open_days?: number },
      ) => ({
        parcel_ids: v.parcel_ids.filter((id) => hits.includes(id)),
        long_open: v.long_open_permit
          ? {
              min_open_days: v.min_open_days ?? 1826,
              max_open_days: v.max_open_days ?? null,
            }
          : null,
        ownership: null,
      });

    test("with 'Leads in this search' off: the lead IDs, long_open_permit and the map's window only (no search needed); the list is the API's answer", async () => {
      h.match.mockImplementation(answer(["0000000009"]));
      const map = await start();
      await flush();
      expect(screen.getByTestId("leads-long-open-window").textContent).toBe(
        " (open at least 1,826 days)",
      );
      fireEvent.click(screen.getByTestId("leads-long-open"));
      await wait(300);
      expect(calls()).toEqual([
        {
          long_open_permit: true,
          min_open_days: 1826,
          parcel_ids: ["0000000003", "0000000009"],
        },
      ]);
      expect(listed()).toEqual(["0000000009"]);
      expect(screen.getByTestId("leads-count").textContent).toBe("1");
      // Off: every lead again, no call.
      fireEvent.click(screen.getByTestId("leads-long-open"));
      expect(listed()).toHaveLength(2);
      // On again with the same window: the answer is kept, no new call; a search does not change the
      // question while "Leads in this search" is off.
      fireEvent.click(screen.getByTestId("leads-long-open"));
      act(() => map.clickAt(300, 100));
      await wait(300);
      expect(h.match).toHaveBeenCalledTimes(1);
      expect(listed()).toEqual(["0000000009"]);
      // A maximum in the long-open list (the map's window): asked again with it.
      fireEvent.change(screen.getByTestId("permits-max-years"), {
        target: { value: "10" },
      });
      await wait(300);
      expect(h.match).toHaveBeenCalledTimes(2);
      expect(calls()[1]).toEqual({
        long_open_permit: true,
        min_open_days: 1826,
        max_open_days: 3653,
        parcel_ids: ["0000000003", "0000000009"],
      });
      expect(screen.getByTestId("leads-long-open-window").textContent).toBe(
        " (open 1,826 to 3,653 days)",
      );
    });

    test("with 'Leads in this search' on: the search filter, the lead IDs and the window go to parcels.match, also when the drawn points would answer (no browser-side path)", async () => {
      // The drawn point is marked long-open; the API says no lead passes: the list follows the API.
      h.points.mockResolvedValue({
        count: 1,
        encoding: "columnar-v1",
        precision: 5,
        id: ["0000000003"],
        lat: [34.21],
        lon: [-118.48],
        permit_data_available: [1],
        long_open_permit: [1],
        long_open: { min_open_days: 1826, max_open_days: null },
        ownership: null,
        truncated: false,
        max_points: 25000,
      });
      h.match.mockImplementation(answer([]));
      const map = await start();
      await flush();
      act(() => map.clickAt(300, 100));
      await wait(300);
      fireEvent.click(screen.getByTestId("leads-in-search"));
      await wait(300);
      expect(h.match).not.toHaveBeenCalled(); // "Leads in this search" alone: the drawn IDs
      expect(listed()).toEqual(["0000000003"]);
      fireEvent.click(screen.getByTestId("leads-long-open"));
      await wait(300);
      expect(h.match).toHaveBeenCalledTimes(1);
      const c = calls()[0]!;
      expect(c).toMatchObject({
        radius_miles: 1,
        threshold_years: 15,
        long_open_permit: true,
        min_open_days: 1826,
        parcel_ids: ["0000000003", "0000000009"],
      });
      expect(c.lat).toBeCloseTo(34.199, 9);
      expect(c.lon).toBeCloseTo(-118.487, 9);
      expect("ownership_basis" in c).toBe(false);
      expect("max_open_days" in c).toBe(false);
      expect(listed()).toEqual([]);
      expect(screen.getByTestId("leads-count").textContent).toBe("0");
      // The ownership filter is part of the search: the next question carries it.
      h.match.mockImplementation(answer(["0000000003"]));
      fireEvent.click(screen.getByTestId("ownership-on"));
      await wait(300);
      expect(h.match).toHaveBeenCalledTimes(2);
      expect(calls()[1]).toMatchObject({
        ownership_basis: "both",
        long_open_permit: true,
        parcel_ids: ["0000000003", "0000000009"],
      });
      expect(listed()).toEqual(["0000000003"]);
    });

    test("leads go in chunks of MATCH_CHUNK; an invalid window makes no call and says so", async () => {
      const ids = Array.from({ length: 150 }, (_, i) =>
        String(2_000_000 + i).padStart(10, "0"),
      );
      h.leads.list
        .mockResolvedValueOnce({
          items: ids.slice(0, 100).map((id) => lead(id)),
          next_cursor: "c0",
        })
        .mockResolvedValueOnce({
          items: ids.slice(100).map((id) => lead(id)),
          next_cursor: null,
        });
      h.match.mockImplementation(answer(ids.filter((_, i) => i % 2 === 0)));
      const map = await start();
      await flush();
      fireEvent.click(screen.getByTestId("leads-long-open"));
      await wait(2000);
      expect(calls().map((c) => c.parcel_ids.length)).toEqual([
        MATCH_CHUNK,
        MATCH_CHUNK,
        150 - 2 * MATCH_CHUNK,
      ]);
      expect(calls().every((c) => c.long_open_permit === true)).toBe(true);
      expect(new Set(calls().flatMap((c) => c.parcel_ids)).size).toBe(150);
      expect(screen.getByTestId("leads-count").textContent).toBe("75");
      // A maximum below the minimum (set in the long-open list, shown once a pin is dropped): no call,
      // nothing listed, the list says why.
      act(() => map.clickAt(300, 100));
      await wait(300);
      expect(h.match).toHaveBeenCalledTimes(3);
      fireEvent.change(screen.getByTestId("permits-max-years"), {
        target: { value: "3" },
      });
      await wait(2000);
      expect(h.match).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("leads-window-invalid")).toBeTruthy();
      expect(screen.queryByTestId("leads-long-open-window")).toBeNull();
      expect(listed()).toEqual([]);
    });
  });
});

describe("permits and the effective roof year", () => {
  /** Every fixture carries a description; it must never reach the DOM. */
  const SENTINEL = "SENTINEL-DESCRIPTION";
  /**
   * A long-open item (permits.longOpen), with an extra work_desc the UI must ignore (the API serves none;
   * the fixture carries one to prove the UI would not show it).
   */
  const lo = (
    permit_number: string,
    open_days: number,
    distance_miles: number,
    extra: Partial<LongOpenItem> = {},
  ): LongOpenItem & { work_desc: string } => ({
    permit_number,
    address: `${permit_number} ROOF ST`,
    postal_code: "91405",
    source_permit_type: "Bldg-Alter/Repair",
    source_permit_sub_type: "1 or 2 Family Dwelling",
    source_status_desc: "Issued",
    permit_status_class: "open-issued",
    application_received_date: "2010-02-01",
    permit_issue_date: "2010-03-01",
    status_date: "2010-03-01",
    open_since: "2010-03-01",
    open_days,
    roofing_work: true,
    roof_coating_only: false,
    join_method: "direct",
    building_level: false,
    parcel_count: 1,
    parcel_id: "0000000001",
    distance_miles,
    effective_roof_year: 1980,
    roof_age_basis: PROXY,
    roof_year_permit_number: null,
    work_desc: SENTINEL,
    ...extra,
  });
  /** Longest open first, as the API sorts by default; 120 in all, next page at 50. */
  const LONG_OPEN: LongOpenResult = {
    count: 120,
    rule: { ...EMPTY_LONG_OPEN.rule, text: "API RULE TEXT" },
    items: [
      lo("P-3", 6000, 0.8),
      lo("P-1", 4000, 0.2, {
        building_level: true,
        parcel_count: 12,
        join_method: "condo-building",
        roof_coating_only: true,
      }),
      lo("P-2", 2000, 0.5, { roofing_work: false }),
    ],
    next_offset: 50,
  };
  const contractor = (
    extra: Partial<PermitContractor> = {},
  ): PermitContractor => ({
    contractors_business_name: "ACME ROOFING INC",
    license_identifier: "123456",
    source_license_type: "C-39 ROOFING",
    license_class: "C39",
    license_class_note: null,
    is_owner_builder: false,
    license_expiration_date: "2027-01-31",
    city_name: "VAN NUYS",
    state_code: "CA",
    contractor_identity_key: "123456",
    canonical_business_name: "ACME ROOFING INC",
    name_variant_count: 1,
    identity_permit_count: 1,
    ...extra,
  });
  /** A permit of the parcel (permits.forParcel), with an extra work_desc the UI must ignore. */
  const pp = (
    permit_number: string,
    source_status_desc: string,
    permit_status_class: ParcelPermit["permit_status_class"],
    open_days: number | null,
    contractors: PermitContractor[],
  ): ParcelPermit & { work_desc: string } => ({
    permit_number,
    address: "0000000001 TEST ST",
    postal_code: "91405",
    source_permit_type: "Bldg-Alter/Repair",
    source_permit_sub_type: "1 or 2 Family Dwelling",
    source_status_desc,
    permit_status_class,
    application_received_date: "2012-04-01",
    permit_issue_date: "2012-05-01",
    status_date: "2013-06-01",
    open_since: open_days === null ? null : "2012-05-01",
    open_days,
    roofing_work: false,
    roof_coating_only: false,
    join_method: "direct",
    building_level: false,
    parcel_count: 1,
    contractors,
    work_desc: SENTINEL,
  });
  const PARCEL_PERMITS: ParcelPermits = {
    parcel_id: "0000000001",
    permit_data_available: true,
    jurisdiction: "LOS ANGELES",
    effective_roof_year: 2009,
    roof_age_basis: PERMIT,
    roof_year_permit_number: "09016-10000-01234",
    permits: [
      {
        ...pp("A-1", "Issued", "open-issued", 3000, [contractor()]),
        roofing_work: true,
      },
      pp("A-2", "Plan Check", "open-application", 400, []),
      pp("A-3", "Permit Finaled", "closed", null, [
        contractor({
          contractors_business_name: null,
          license_identifier: null,
          license_class: null,
          source_license_type: null,
          license_class_note: "owner-builder",
          is_owner_builder: true,
          contractor_identity_key: null,
          canonical_business_name: null,
          name_variant_count: null,
          identity_permit_count: null,
        }),
      ]),
      pp("A-4", "CofO in Progress", "unclear", null, []),
      pp("A-5", "Odd Status", "unmapped", null, []),
    ],
    bbb: { available: false, reason: "no BBB data source" },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.easeTo.mockReset();
    h.match.mockReset();
    vi.mocked(loadConfig).mockResolvedValue({
      client: "crm",
      apiUrl: "https://api.test",
      apiToken: "t",
      mapKey: "k",
    });
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.search.mockReset().mockResolvedValue({
      count: 3,
      rule,
      items: [
        {
          ...item("0000000001", 0.1),
          effective_roof_year: 2009,
          roof_age_years: 17,
          roof_age_basis: PERMIT,
          roof_year_permit_number: "09016-10000-01234",
        },
        {
          ...item("0000000002", 0.2),
          year_built: 1962,
          roof_age_years_proxy: 64,
          effective_roof_year: 1962,
          roof_age_years: 64,
        },
        {
          // No year built: only a permit gives this parcel a roof year.
          ...item("0000000003", 0.9),
          year_built: null,
          roof_age_years_proxy: null,
          effective_roof_year: 2005,
          roof_age_years: 21,
          roof_age_basis: PERMIT,
          roof_year_permit_number: "05016-10000-00042",
        },
      ],
      next_offset: null,
    });
    h.points.mockReset().mockResolvedValue({
      count: 3,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000001", "0000000002", "0000000003"],
      lat: [34.2, 34.2, 34.21],
      lon: [-118.49, -118.48996, -118.48],
      truncated: false,
      max_points: 25000,
    });
    h.detail
      .mockReset()
      .mockImplementation(async ({ parcel_id }: { parcel_id: string }) => ({
        property: {
          parcel_id,
          address: `${parcel_id} TEST ST`,
          year_built: 1980,
          roof_age_basis: PERMIT,
          effective_roof_year: 2009,
          roof_year_permit_number: "09016-10000-01234",
          permit_data_available: true,
          roll_year: 2026,
        },
        provenance: { parcel_id, source_name: "Test Source" },
      }));
    h.longOpen.mockReset().mockResolvedValue(LONG_OPEN);
    h.forParcel.mockReset().mockResolvedValue(PARCEL_PERMITS);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** Render, load the map, drop a pin at (300, 100) and wait past the debounce. */
  const pinned = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    act(() => map.clickAt(300, 100));
    await wait(300);
    return map;
  };
  /** Open the detail of the first result row. */
  const openFirst = async () => {
    await act(async () => {
      fireEvent.click(screen.getAllByTestId("result")[0]!);
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
  };
  const field = (name: string) =>
    screen.getByTestId("detail").querySelector(`[data-field="${name}"]`)!
      .textContent;
  const lastLongOpen = () =>
    h.longOpen.mock.calls.at(-1)![0] as Record<string, unknown>;
  const setInput = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } });

  test("results show the roof year with its basis; the rule before the answer describes the effective roof year", async () => {
    render(<App />);
    await flush();
    expect(screen.getByTestId("rule").textContent).toBe(
      "Roof age counts from the effective roof year: the later of the assessor year built and the year of the latest finaled roofing permit. Older than 15 years means an effective roof year before roll year − 15.",
    );
    const map = h.maps[0]!;
    map.fire("load");
    act(() => map.clickAt(300, 100));
    await wait(300);
    const rows = screen.getAllByTestId("result").map((r) => r.textContent);
    expect(rows[0]).toContain("built 1980 · roof year 2009 (permit)");
    expect(rows[1]).toContain("built 1962 · roof year 1962 (year built)");
    expect(rows[2]).toContain(
      "year built not in source · roof year 2005 (permit)",
    );
  });

  test("the parcel detail shows the effective roof year, its basis and the roof-year permit", async () => {
    await pinned();
    await openFirst();
    expect(field("effective_roof_year")).toBe("2009");
    expect(field("roof_year_permit_number")).toBe("09016-10000-01234");
    // One basis row: the existing roof_age_basis row, with the label as served.
    expect(field("roof_age_basis")).toBe(PERMIT);
    const basisRows = [...screen.getByTestId("detail").querySelectorAll("dt")]
      .map((d) => d.textContent)
      .filter((t) => /roof/i.test(t!) && /basis/i.test(t!));
    expect(basisRows).toEqual(["Roof-age basis"]);
    const text = screen.getByTestId("detail").textContent!;
    expect(text).not.toContain("Roof age is a proxy from year built");
    expect(text).toContain(
      "Roof age counts from the effective roof year: the later of the assessor year built and the year of the latest finaled roofing permit.",
    );
  });

  test("longOpen: 5 years (1,826 days) by default, longest open first, with pin, radius and roof age, no max_open_days; one call per change", async () => {
    await pinned();
    expect(h.longOpen).toHaveBeenCalledTimes(1);
    const q = lastLongOpen();
    expect(q.lat).toBeCloseTo(34.199, 9);
    expect(q.lon).toBeCloseTo(-118.487, 9);
    expect(q).toMatchObject({
      radius_miles: 1,
      threshold_years: 15,
      min_open_days: 1826,
      sort: "open_days",
      offset: 0,
      limit: 50,
    });
    expect("max_open_days" in q).toBe(false);
    // The CRM's default equals the API's (DEFAULT_MIN_DAYS is typed as the API's DEFAULT_MIN_OPEN_DAYS).
    expect(yearsToDays(DEFAULT_WINDOW.minYears)).toBe(DEFAULT_MIN_DAYS);
    expect(screen.getByTestId("permits-rule").textContent).toContain(
      "at least 5 years (1,826 days)",
    );
    expect(screen.getByTestId("permits-rule").textContent).toContain(
      "Only permits with status class Open (issued) count as open.",
    );
    await wait(5000); // idle: no further calls
    expect(h.longOpen).toHaveBeenCalledTimes(1);
    setInput("radius", "5");
    setInput("threshold", "30");
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(lastLongOpen()).toMatchObject({
      radius_miles: 5,
      threshold_years: 30,
    });
    await wait(5000);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
  });

  test("a maximum sends max_open_days; a maximum below the minimum shows a message and makes no call", async () => {
    await pinned();
    setInput("permits-max-years", "10");
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
    expect(lastLongOpen()).toMatchObject({
      min_open_days: 1826,
      max_open_days: 3653,
    });
    expect(screen.getByTestId("permits-rule").textContent).toContain(
      "at most 10 years (3,653 days)",
    );
    setInput("permits-max-years", "3");
    expect(screen.getByTestId("permits-window-error").textContent).toMatch(
      /maximum \(3 years\) is below the minimum \(5 years\)/,
    );
    await wait(2000);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
    expect(screen.queryAllByTestId("permit-row")).toHaveLength(0);
    setInput("permits-max-years", ""); // cleared: no maximum again
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(3);
    expect("max_open_days" in lastLongOpen()).toBe(false);
    expect(screen.queryByTestId("permits-window-error")).toBeNull();
  });

  test("a new minimum re-queries once; Next uses next_offset; 'Nearest first' sends sort distance from offset 0", async () => {
    await pinned();
    setInput("permits-min-years", "8");
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
    expect(lastLongOpen()).toMatchObject({ min_open_days: 2922, offset: 0 });
    await act(async () => {
      fireEvent.click(screen.getByTestId("permits-next"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.longOpen).toHaveBeenCalledTimes(3);
    expect(lastLongOpen()).toMatchObject({
      min_open_days: 2922,
      sort: "open_days",
      offset: 50,
      limit: 50,
    });
    expect(screen.getByTestId("permits-count").textContent).toContain(
      "showing 51–53",
    );
    setInput("permits-sort", "distance");
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(4);
    expect(lastLongOpen()).toMatchObject({
      sort: "distance",
      offset: 0,
      min_open_days: 2922,
    });
    await wait(2000);
    expect(h.longOpen).toHaveBeenCalledTimes(4);
  });

  test("rows keep the API order (longest first), are highlighted as long-open, and the count is the API's", async () => {
    await pinned();
    const rows = screen.getAllByTestId("permit-row");
    expect(rows.map((r) => r.dataset.permit)).toEqual(["P-3", "P-1", "P-2"]);
    expect(rows.map((r) => r.dataset.openDays)).toEqual([
      "6000",
      "4000",
      "2000",
    ]);
    for (const r of rows) {
      expect(r.classList.contains("long-open")).toBe(true);
      expect(r.textContent).toContain("long-open");
    }
    const count = screen.getByTestId("permits-count");
    expect(count.dataset.count).toBe("120");
    expect(count.textContent).toMatch(/^120 long-open permits/);
    expect(rows[0]!.textContent).toContain("P-3 ROOF ST");
    expect(rows[0]!.textContent).toContain(
      "Issued · Open (issued) · open 16.4 years (6,000 days)",
    );
    expect(rows[0]!.textContent).toContain("issued 2010-03-01 · 0.8 mi");
    expect(rows[1]!.textContent).toContain(
      "join condo building · building-level (12 units)",
    );
    expect(rows[0]!.textContent).not.toContain("building-level");
    // The roofing flag: roofing, roofing through the roof-coating phrase only, not roofing (a row the
    // server's roofing filter no longer sends). The list is roofing work only, so plain roofing has no tag.
    expect(rows.map((r) => r.dataset.roofing)).toEqual([
      "true",
      "true",
      "false",
    ]);
    expect(
      rows.map(
        (r) => within(r).queryByTestId("permit-roofing")?.textContent ?? null,
      ),
    ).toEqual([null, "roof coating only", "not roofing work"]);
    expect(screen.getByTestId("permits-api-rule").textContent).toBe(
      "API RULE TEXT",
    );
  });

  test("detail permits: the five status classes, contractors, 'Contractor not published', BBB not available, long-open highlight", async () => {
    await pinned();
    await openFirst();
    expect(h.forParcel).toHaveBeenCalledTimes(1);
    expect(h.forParcel).toHaveBeenCalledWith({ parcel_id: "0000000001" });
    const section = screen.getByTestId("parcel-permits");
    const permits = within(section).getAllByTestId("parcel-permit");
    expect(
      within(section)
        .getAllByTestId("permit-status-class")
        .map((e) => e.textContent),
    ).toEqual([
      "Open (issued)",
      "Open (application stage)",
      "Closed",
      "Unclear (neither open nor closed)",
      "Unmapped status",
    ]);
    // Long-open: open-issued and 3,000 days within the default window (at least 1,826).
    expect(permits.map((p) => p.dataset.longOpen)).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(permits[0]!.classList.contains("long-open")).toBe(true);
    const a1 = within(permits[0]!);
    expect(a1.getByTestId("contractor-name").textContent).toBe(
      "ACME ROOFING INC",
    );
    expect(a1.getByTestId("contractor-license").textContent).toBe("123456");
    expect(permits[0]!.textContent).toContain("license 123456");
    expect(permits[0]!.textContent).toContain("license expires 2027-01-31");
    expect(permits[0]!.textContent).toContain("VAN NUYS, CA");
    expect(a1.getByTestId("permit-roofing").textContent).toBe("roofing");
    expect(within(permits[1]!).queryByTestId("permit-roofing")).toBeNull();
    expect(a1.getByTestId("contractor-class").textContent).toBe(
      "C39 [C-39 ROOFING]",
    );
    expect(
      permits[0]!.querySelector('[data-field="open_days"]')!.textContent,
    ).toBe("8.2 years (3,000 days)");
    expect(
      permits[2]!.querySelector('[data-field="open_days"]')!.textContent,
    ).toBe("not open");
    expect(
      within(permits[2]!).getByTestId("contractor-owner-builder"),
    ).toBeTruthy();
    expect(
      within(permits[2]!).getByTestId("contractor-class").textContent,
    ).toBe("— (owner-builder)");
    expect(
      within(permits[1]!).getByTestId("contractor-not-published").textContent,
    ).toBe("Contractor not published");
    expect(within(section).getByTestId("bbb-rating").textContent).toBe(
      "not available (no BBB data source)",
    );
    expect(section.textContent).toContain("BBB rating");
    // A maximum of 7 years (2,557 days) takes the 3,000-day permit out of the long-open window.
    setInput("permits-max-years", "7");
    expect(
      within(screen.getByTestId("parcel-permits"))
        .getAllByTestId("parcel-permit")
        .map((p) => p.dataset.longOpen),
    ).toEqual(["false", "false", "false", "false", "false"]);
  });

  test("no permits: outside the City of Los Angeles the no-permit-data marker, inside 'No permits on record'", async () => {
    h.forParcel.mockResolvedValueOnce({
      permit_data_available: false,
      jurisdiction: "BURBANK",
      permits: [],
      bbb: { available: false, reason: "no BBB data source" },
    });
    await pinned();
    await openFirst();
    expect(screen.getByTestId("no-permit-data").textContent).toBe(
      "No permit data: outside the City of Los Angeles (jurisdiction: BURBANK)",
    );
    expect(screen.queryByTestId("no-permits")).toBeNull();
    h.forParcel.mockResolvedValueOnce(NO_PERMITS);
    await act(async () => {
      fireEvent.click(screen.getAllByTestId("result")[1]!);
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(h.forParcel).toHaveBeenLastCalledWith({ parcel_id: "0000000002" });
    expect(screen.getByTestId("no-permits").textContent).toBe(
      "No permits on record for this parcel.",
    );
    expect(screen.queryByTestId("no-permit-data")).toBeNull();
  });

  test("permit descriptions are never shown or requested", async () => {
    await pinned();
    await openFirst();
    expect(screen.getAllByTestId("permit-row")).toHaveLength(3);
    expect(screen.getAllByTestId("parcel-permit")).toHaveLength(5);
    expect(document.body.textContent).not.toContain(SENTINEL);
    expect(document.body.innerHTML).not.toContain(SENTINEL);
    const keysDeep = (v: unknown): string[] =>
      v && typeof v === "object"
        ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)])
        : [];
    const procedures = [
      h.search,
      h.points,
      h.detail,
      h.match,
      h.runSummary,
      h.longOpen,
      h.forParcel,
    ];
    const keys = procedures.flatMap((p) => p.mock.calls.flatMap(keysDeep));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => /desc/i.test(k))).toEqual([]);
  });

  test("a longOpen failure shows inside the permits section only; the rest of the app keeps working", async () => {
    h.longOpen.mockRejectedValue(new Error("No procedure found on path"));
    await pinned();
    const section = screen.getByTestId("permits-list");
    expect(within(section).getByTestId("permits-error").textContent).toBe(
      "Permits unavailable: No procedure found on path",
    );
    expect(screen.queryByTestId("error")).toBeNull();
    expect(screen.getAllByTestId("result")).toHaveLength(3);
    expect(screen.getByTestId("result-count").textContent).toBe("3 results");
    await openFirst();
    expect(field("parcel_id")).toBe("0000000001");
    expect(screen.getAllByTestId("parcel-permit")).toHaveLength(5);
  });

  test("a forParcel failure shows inside the detail's permits section only", async () => {
    h.forParcel.mockRejectedValue(new Error("No procedure found on path"));
    await pinned();
    await openFirst();
    const section = screen.getByTestId("parcel-permits");
    expect(
      within(section).getByTestId("parcel-permits-error").textContent,
    ).toBe("Permits unavailable: No procedure found on path");
    expect(screen.queryByTestId("error")).toBeNull();
    expect(screen.queryByTestId("bbb-rating")).toBeNull();
    expect(field("parcel_id")).toBe("0000000001");
    expect(field("effective_roof_year")).toBe("2009");
    expect(screen.getAllByTestId("permit-row")).toHaveLength(3);
  });

  test("against an API client without the permit routes, both sections show an error and nothing else breaks", async () => {
    // A call that throws before any request (as on a client object without `permits`) is caught the same way.
    h.longOpen.mockImplementation(() => {
      throw new TypeError("permits is not available");
    });
    h.forParcel.mockImplementation(() => {
      throw new TypeError("permits is not available");
    });
    await pinned();
    expect(screen.getByTestId("permits-error").textContent).toMatch(
      /^Permits unavailable: /,
    );
    await openFirst();
    expect(screen.getByTestId("parcel-permits-error").textContent).toMatch(
      /^Permits unavailable: /,
    );
    expect(screen.queryByTestId("error")).toBeNull();
    expect(screen.getAllByTestId("result")).toHaveLength(3);
  });

  test("the list is titled 'Long-open roofing permits' and says roofing work only; the detail highlights only roofing work", async () => {
    h.forParcel.mockResolvedValue({
      ...PARCEL_PERMITS,
      permits: [
        // Open-issued for 3,000 days, but not roofing work: never long-open.
        pp("A-6", "Issued", "open-issued", 3000, []),
        ...PARCEL_PERMITS.permits,
      ],
    });
    await pinned();
    expect(screen.getByTestId("permits-heading").textContent).toBe(
      "Long-open roofing permits",
    );
    expect(screen.getByTestId("permits-rule").textContent).toContain(
      "Roofing work only: a permit that is not roofing work never counts; a roof-coating-only permit counts and is tagged.",
    );
    await openFirst();
    const permits = within(screen.getByTestId("parcel-permits")).getAllByTestId(
      "parcel-permit",
    );
    expect(permits.map((p) => [p.dataset.permit, p.dataset.longOpen])).toEqual([
      ["A-6", "false"],
      ["A-1", "true"],
      ["A-2", "false"],
      ["A-3", "false"],
      ["A-4", "false"],
      ["A-5", "false"],
    ]);
    expect(permits[0]!.classList.contains("long-open")).toBe(false);
  });

  test("the map highlights parcels with a long-open roofing permit: points get the list's window in days, and the legend counts the highlighted parcels drawn", async () => {
    const pts = (long_open_permit: Array<0 | 1>, max: number | null) => ({
      count: 3,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000001", "0000000002", "0000000003"],
      lat: [34.2, 34.2, 34.21],
      lon: [-118.49, -118.48996, -118.48],
      permit_data_available: [1, 1, 1],
      long_open_permit,
      long_open: { min_open_days: 1826, max_open_days: max },
      truncated: false,
      max_points: 25000,
    });
    h.points.mockResolvedValue(pts([1, 0, 1], null));
    const map = await pinned();
    // One call each; the points carry the long-open list's window in days (default 1,826, no maximum).
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.points).toHaveBeenCalledTimes(1);
    const p0 = h.points.mock.calls[0]![0] as Record<string, unknown>;
    expect(p0).toMatchObject({
      radius_miles: 1,
      threshold_years: 15,
      min_open_days: 1826,
    });
    expect(p0.lat).toBeCloseTo(34.199, 9);
    expect("max_open_days" in p0).toBe(false);
    expect(lastLongOpen().min_open_days).toBe(p0.min_open_days);
    // A distinct layer over the points, for the features marked long_open = 1.
    expect(map.layers.map((l) => l.id)).toEqual([
      "radius-fill",
      "radius-line",
      "points",
      "points-long-open",
    ]);
    expect(map.layers[3]).toMatchObject({
      source: "points",
      filter: ["==", ["get", "long_open"], 1],
    });
    const features = () =>
      (
        map.sources.points!.data as {
          features: Array<{ properties: { id: string; long_open: number } }>;
        }
      ).features.map((f) => [f.properties.id, f.properties.long_open]);
    expect(features()).toEqual([
      ["0000000001", 1],
      ["0000000002", 0],
      ["0000000003", 1],
    ]);
    const legend = () => screen.getByTestId("legend-long-open");
    expect(legend().dataset.count).toBe("2");
    expect(screen.getByTestId("map-legend").textContent).toContain(
      "Parcel within the radius whose roof is older than 15 years",
    );
    expect(legend().textContent).toBe(
      "Has a long-open roofing permit (open at least 1,826 days): 2 of the 3 parcels drawn",
    );
    // Beside the results badge: the legend's number and window (the points are not truncated: no "of the M").
    const badge = () => screen.getByTestId("result-long-open");
    const badgeEqualsLegend = () => {
      expect(badge().dataset.count).toBe(legend().dataset.count);
      expect(screen.getByTestId("result-long-open-count").textContent).toBe(
        screen.getByTestId("legend-long-open-count").textContent,
      );
      expect(badge().dataset.window).toBe(legend().dataset.window);
    };
    badgeEqualsLegend();
    expect(badge().textContent).toBe(
      "2 with a long-open roofing permit (open at least 1,826 days)",
    );
    act(() => map.fire("idle"));
    expect(screen.getByTestId("map").dataset.renderedLongOpen).toBe("1826|");

    // A maximum: the points are asked again with the same days as the list; the search is not.
    h.points.mockResolvedValue(pts([0, 0, 1], 3653));
    setInput("permits-max-years", "10");
    await wait(300);
    await flush();
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(h.points).toHaveBeenCalledTimes(2);
    const p1 = h.points.mock.calls[1]![0] as Record<string, unknown>;
    expect(p1).toMatchObject({
      radius_miles: 1,
      threshold_years: 15,
      min_open_days: 1826,
      max_open_days: 3653,
    });
    expect(p1.lat).toBeCloseTo(34.199, 9);
    expect(lastLongOpen()).toMatchObject({
      min_open_days: 1826,
      max_open_days: 3653,
    });
    expect(legend().dataset.count).toBe("1");
    expect(legend().textContent).toContain("open 1,826 to 3,653 days");
    badgeEqualsLegend();
    expect(badge().textContent).toBe(
      "1 with a long-open roofing permit (open 1,826 to 3,653 days)",
    );
    expect(features().map((f) => f[1])).toEqual([0, 0, 1]);
    act(() => map.fire("idle"));
    expect(screen.getByTestId("map").dataset.renderedLongOpen).toBe(
      "1826|3653",
    );
    await wait(5000); // idle: no further calls
    expect(h.points).toHaveBeenCalledTimes(2);

    // An invalid window: no call; the map keeps the last valid highlight and says so.
    setInput("permits-max-years", "3");
    await wait(2000);
    expect(h.points).toHaveBeenCalledTimes(2);
    expect(legend().dataset.count).toBe("1");
    expect(screen.getByTestId("legend-window-invalid").textContent).toBe(
      "The open-duration window is invalid; the map keeps the last valid one.",
    );
    badgeEqualsLegend();
    // A new search meanwhile uses the last valid window.
    setInput("radius", "2");
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.points).toHaveBeenCalledTimes(3);
    expect(h.points.mock.calls[2]![0]).toMatchObject({
      radius_miles: 2,
      min_open_days: 1826,
      max_open_days: 3653,
    });
  });

  test("a long-open row opens its parcel's detail, the same panel as a map click", async () => {
    h.longOpen.mockResolvedValue({
      ...LONG_OPEN,
      items: [
        LONG_OPEN.items[0]!,
        { ...LONG_OPEN.items[1]!, parcel_id: "0000000002" },
        LONG_OPEN.items[2]!,
      ],
    });
    await pinned();
    const rows = screen.getAllByTestId("permit-row");
    expect(rows.map((r) => r.dataset.parcel)).toEqual([
      "0000000001",
      "0000000002",
      "0000000001",
    ]);
    expect(screen.getByTestId("permits-open-hint").textContent).toBe(
      "Click a permit to open its parcel; a building-level permit opens its nearest unit.",
    );
    await act(async () => {
      fireEvent.click(rows[1]!);
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(h.detail).toHaveBeenCalledTimes(1);
    expect(h.detail).toHaveBeenCalledWith({ parcel_id: "0000000002" });
    expect(field("parcel_id")).toBe("0000000002");
    expect(h.forParcel).toHaveBeenLastCalledWith({ parcel_id: "0000000002" });
    expect(screen.getAllByTestId("parcel-permit")).toHaveLength(5);
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(1); // the pin did not move
  });

  test("the parcel detail shows the land base year, with a note that it is not a sale date", async () => {
    h.detail.mockImplementation(
      async ({ parcel_id }: { parcel_id: string }) => ({
        property: { parcel_id, land_base_year: 1975, roll_year: 2026 },
        provenance: { parcel_id, source_name: "Test Source" },
      }),
    );
    await pinned();
    await openFirst();
    expect(field("land_base_year")).toBe("1975");
    expect(screen.getByTestId("detail").textContent).toContain(
      "The land base year is the assessor roll's year of the last reassessment (a fiscal-year label), not a sale date either.",
    );
  });

  test("a long-open permit's contractors show the identity (key, canonical name, name-variant count); a license without a name shows no name; a row without a license has none; variants are never listed", async () => {
    h.forParcel.mockResolvedValue({
      ...PARCEL_PERMITS,
      permits: [
        {
          ...pp("A-1", "Issued", "open-issued", 3000, [
            contractor({
              contractors_business_name: "ACME ROOFING",
              canonical_business_name: "ACME ROOFING INC",
              name_variant_count: 3,
              identity_permit_count: 12,
            }),
            contractor({
              contractors_business_name: null,
              license_identifier: "777777",
              contractor_identity_key: "777777",
              canonical_business_name: null,
              name_variant_count: 0,
              identity_permit_count: 2,
            }),
            contractor({
              contractors_business_name: null,
              license_identifier: null,
              license_class: null,
              source_license_type: null,
              license_class_note: "owner-builder",
              is_owner_builder: true,
              contractor_identity_key: null,
              canonical_business_name: null,
              name_variant_count: null,
              identity_permit_count: null,
            }),
          ]),
          roofing_work: true,
        },
      ],
    });
    await pinned();
    await openFirst();
    const permit = within(screen.getByTestId("parcel-permits")).getByTestId(
      "parcel-permit",
    );
    expect(permit.dataset.longOpen).toBe("true");
    const rows = within(permit).getAllByTestId("contractor");
    expect(rows).toHaveLength(3);
    const ids = rows.map((r) =>
      r.querySelector('[data-testid="contractor-identity"]'),
    );
    expect(ids[0]!.getAttribute("data-key")).toBe("123456");
    expect(ids[0]!.textContent).toBe(
      " · identity 123456 · canonical name ACME ROOFING INC · name variants 3",
    );
    expect(
      within(rows[0]!).getByTestId("contractor-name-variants").dataset.count,
    ).toBe("3");
    // A license without a name: its key and count, and no name at all (never a guessed one).
    expect(ids[1]!.getAttribute("data-key")).toBe("777777");
    expect(ids[1]!.textContent).toBe(" · identity 777777 · name variants 0");
    expect(
      within(rows[1]!).queryByTestId("contractor-canonical-name"),
    ).toBeNull();
    // No license number: no identity.
    expect(ids[2]).toBeNull();
    // Only the row's own name and the canonical name appear; no list of variants.
    expect(rows[0]!.textContent!.match(/ACME ROOFING/g)).toHaveLength(2);
  });

  test("the placeholders no longer list permit sections or the agent", async () => {
    render(<App />);
    await flush();
    const cards = screen.getAllByTestId("future").map((c) => c.textContent);
    expect(cards).toHaveLength(2);
    expect(cards.join(" ")).not.toMatch(/permit/i);
    expect(cards.join(" ")).not.toMatch(/RAG|agent/i);
    // The 10-year ownership filter is on the search now; only the out-of-area owner stays unavailable.
    expect(cards.join(" ")).toMatch(/Out-of-area owner: not available/);
    expect(cards.join(" ")).not.toMatch(/10 years|>10|ownership/i);
    expect(cards.join(" ")).toMatch(/Outreach/);
  });

  /**
   * Number fields as text entries: a field can be emptied and retyped and shows what was
   * typed (before, a cleared field put back 1, so "8" typed after clearing came out as "18"). The search runs
   * on each change: an empty or invalid value shows a plain message and sends nothing (the search keeps its
   * last valid value).
   */
  const retype = (testId: string, text: string) => {
    const el = screen.getByTestId(testId) as HTMLInputElement;
    fireEvent.change(el, { target: { value: "" } });
    expect(el.value).toBe("");
    fireEvent.change(el, { target: { value: el.value + text } });
    expect(el.value).toBe(text);
  };

  test("roof age: cleared and retyped, it shows what was typed and the search sends it; the slider follows", async () => {
    await pinned();
    expect(h.search).toHaveBeenCalledTimes(1);
    retype("threshold", "20");
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(2);
    expect(h.search.mock.lastCall![0]).toMatchObject({ threshold_years: 20 });
    expect(lastLongOpen()).toMatchObject({ threshold_years: 20 });
    expect(
      (screen.getByLabelText("Roof age threshold slider") as HTMLInputElement)
        .value,
    ).toBe("20");
    expect(screen.queryByTestId("threshold-error")).toBeNull();
    // The slider writes the field.
    setInput("threshold", "20");
    fireEvent.change(screen.getByLabelText("Roof age threshold slider"), {
      target: { value: "35" },
    });
    expect((screen.getByTestId("threshold") as HTMLInputElement).value).toBe(
      "35",
    );
    await wait(300);
    expect(h.search.mock.lastCall![0]).toMatchObject({ threshold_years: 35 });
  });

  test.each([
    [
      "",
      "Roof older than (years) is empty: enter a whole number from 1 to 120.",
    ],
    ["0", "Roof older than (years) must be a whole number from 1 to 120."],
    ["121", "Roof older than (years) must be a whole number from 1 to 120."],
    ["2.5", "Roof older than (years) must be a whole number from 1 to 120."],
  ])(
    "roof age %j: a plain message, nothing sent; the search keeps the last valid value",
    async (text, message) => {
      await pinned();
      setInput("threshold", text);
      await wait(2000);
      expect(h.search).toHaveBeenCalledTimes(1);
      expect(h.longOpen).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId("threshold") as HTMLInputElement).value).toBe(
        text,
      );
      expect(screen.getByTestId("threshold-error").textContent).toBe(
        `${message} The search keeps 15 years until then.`,
      );
      setInput("threshold", "16");
      await wait(300);
      expect(h.search).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("threshold-error")).toBeNull();
    },
  );

  test("open at least (years): cleared and retyped, it shows what was typed and the list sends it", async () => {
    await pinned();
    retype("permits-min-years", "8");
    await wait(300);
    expect(h.longOpen).toHaveBeenCalledTimes(2);
    expect(lastLongOpen()).toMatchObject({ min_open_days: 2922 });
    expect(screen.queryByTestId("permits-window-error")).toBeNull();
  });

  test("at most (years): cleared and retyped, it shows what was typed and the list sends it", async () => {
    await pinned();
    setInput("permits-max-years", "12");
    await wait(300);
    retype("permits-max-years", "10");
    await wait(300);
    expect(lastLongOpen()).toMatchObject({
      min_open_days: 1826,
      max_open_days: 3653,
    });
  });

  test.each([
    [
      "permits-min-years",
      "",
      "Open at least (years) is empty: enter a whole number from 1 to 100.",
    ],
    [
      "permits-min-years",
      "0",
      "Open at least (years) must be a whole number from 1 to 100.",
    ],
    [
      "permits-min-years",
      "5.5",
      "Open at least (years) must be a whole number from 1 to 100.",
    ],
    [
      "permits-max-years",
      "101",
      "At most (years, optional) must be a whole number from 1 to 100.",
    ],
    [
      "permits-max-years",
      "0",
      "At most (years, optional) must be a whole number from 1 to 100.",
    ],
  ])(
    "%s %j: a plain message and no call; the map keeps its last valid window and says so",
    async (testId, text, message) => {
      await pinned();
      expect(h.points).toHaveBeenCalledTimes(1);
      setInput(testId, text);
      await wait(2000);
      expect(h.longOpen).toHaveBeenCalledTimes(1);
      expect(h.points).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId(testId) as HTMLInputElement).value).toBe(text);
      expect(screen.getByTestId("permits-window-error").textContent).toBe(
        message,
      );
      expect(screen.getByTestId("permits-rule").textContent).toContain(
        "Long-open: in the open-duration window above, once it is valid, within 1 miles",
      );
      expect(screen.queryAllByTestId("permit-row")).toHaveLength(0);
      expect(screen.getByTestId("legend-window-invalid")).toBeTruthy();
    },
  );

  test("the arrows step whole units: roof age by 1 year (1 to 120), the window by 1 year (1 to 100)", async () => {
    await pinned();
    const attrs = (id: string) => {
      const el = screen.getByTestId(id) as HTMLInputElement;
      return [el.type, el.step, el.min, el.max];
    };
    expect(attrs("threshold")).toEqual(["number", "1", "1", "120"]);
    expect(attrs("permits-min-years")).toEqual(["number", "1", "1", "100"]);
    expect(attrs("permits-max-years")).toEqual(["number", "1", "1", "100"]);
    // 100 years is the API's largest window (MAX_DAYS is typed as the API's MAX_OPEN_DAYS).
    expect(yearsToDays(MAX_YEARS)).toBe(MAX_DAYS);
  });
});

describe("Ask the agent in the aside (with agentApiUrl in config.json)", () => {
  const AGENT_URL = "https://agent.test";
  /** Requests the agent client sent (the fake fetch); /agent/answer replies come from `answers`. */
  let agentRequests: Array<{ method: string; path: string; body?: unknown }>;
  let answers: unknown[];
  const PARCEL_AT = { lat: 34.2011, lon: -118.4652 };
  beforeEach(() => {
    vi.useFakeTimers();
    h.maps.length = 0;
    h.clients.length = 0;
    h.easeTo.mockReset();
    h.match.mockReset();
    h.sources.mockReset().mockResolvedValue({ sources: [] });
    h.runSummary.mockReset().mockResolvedValue(RUN);
    h.longOpen.mockReset().mockResolvedValue(EMPTY_LONG_OPEN);
    h.forParcel.mockReset().mockResolvedValue(NO_PERMITS);
    h.search.mockReset().mockResolvedValue({
      count: 1,
      rule,
      items: [item("0000000003", 0.9)],
      next_offset: null,
    });
    h.points.mockReset().mockResolvedValue({
      count: 1,
      encoding: "columnar-v1",
      precision: 5,
      id: ["0000000003"],
      lat: [34.21],
      lon: [-118.48],
      truncated: false,
      max_points: 25000,
    });
    h.detail
      .mockReset()
      .mockImplementation(async ({ parcel_id }: { parcel_id: string }) => ({
        property: {
          parcel_id,
          address: `${parcel_id} TEST ST`,
          latitude: PARCEL_AT.lat,
          longitude: PARCEL_AT.lon,
          roll_year: 2026,
        },
        provenance: { parcel_id, source_name: "Test Source" },
      }));
    vi.mocked(loadConfig).mockResolvedValue({
      client: "crm",
      apiUrl: "https://api.test",
      agentApiUrl: AGENT_URL,
      apiToken: "t",
      mapKey: "k",
    });
    agentRequests = [];
    answers = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.origin).toBe(AGENT_URL);
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer t",
        );
        agentRequests.push({
          method: init?.method ?? "GET",
          path: url.pathname,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.pathname === "/agent/warm")
          return new Response(JSON.stringify({ status: "warm" }), {
            status: 200,
          });
        if (url.pathname === "/agent/answer" && answers.length)
          return new Response(JSON.stringify(answers.shift()), {
            status: 200,
          });
        throw new Error(`unexpected agent request ${url.pathname}`);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(loadConfig).mockReset();
  });
  const start = async () => {
    render(<App />);
    await flush();
    const map = h.maps[0]!;
    map.fire("load");
    return map;
  };
  const openSection = async () => {
    fireEvent.click(screen.getByTestId("agent-open"));
    await flush();
  };
  const ask = async (q: string) => {
    fireEvent.change(screen.getByRole("textbox", { name: /question/i }), {
      target: { value: q },
    });
    fireEvent.click(screen.getByTestId("agent-send"));
    await flush();
  };

  test.each([
    ["without agentApiUrl", undefined],
    ["with an empty agentApiUrl", ""],
  ])(
    "%s the section is hidden and nothing is warmed (no disabled agent card either)",
    async (_label, agentApiUrl) => {
      vi.mocked(loadConfig).mockResolvedValue({
        client: "crm",
        apiUrl: "https://api.test",
        apiToken: "t",
        mapKey: "k",
        ...(agentApiUrl === undefined ? {} : { agentApiUrl }),
      });
      await start();
      expect(screen.queryByTestId("ask-agent")).toBeNull();
      expect(
        screen
          .getAllByTestId("future")
          .map((c) => c.textContent)
          .join(" "),
      ).not.toMatch(/agent|RAG/i);
      await wait(1000);
      expect(agentRequests).toEqual([]);
      expect(h.sources).not.toHaveBeenCalled();
    },
  );

  test("the section sits in the aside right below the controls, collapsed; opening it warms the agent and two data API requests (explorer.sources), each from a client of its own", async () => {
    await start();
    const section = screen.getByTestId("ask-agent");
    expect(section.closest("aside")).toBeTruthy();
    expect(section.previousElementSibling!.classList.contains("controls")).toBe(
      true,
    );
    expect(screen.getByTestId("agent-open").getAttribute("aria-expanded")).toBe(
      "false",
    );
    await wait(1000);
    expect(agentRequests).toEqual([]);
    expect(h.sources).not.toHaveBeenCalled();
    const clientsBefore = h.clients.length;
    await openSection();
    expect(agentRequests).toEqual([
      { method: "GET", path: "/agent/warm", body: undefined },
    ]);
    expect(h.sources).toHaveBeenCalledTimes(2);
    // Two new data API clients, one per warm-up request: each request goes out on its own (never batched).
    expect(h.clients.slice(clientsBefore)).toEqual([
      { apiUrl: "https://api.test", apiToken: "t" },
      { apiUrl: "https://api.test", apiToken: "t" },
    ]);
  });

  test("the center is the map pin ('map pin'); after 'Use my location' it is 'my location'", async () => {
    const map = await start();
    await openSection();
    expect(screen.getByTestId("agent-center").textContent).toMatch(
      /^Center: none yet/,
    );
    act(() => map.clickAt(300, 100)); // drops the pin at (34.199, -118.487)
    await wait(300);
    expect(screen.getByTestId("agent-center").textContent).toBe(
      "Center: map pin (34.19900, -118.48700)",
    );
    answers.push(ANSWERED, ANSWERED);
    await ask(QUESTION_1);
    const body = (agentRequests.find((r) => r.path === "/agent/answer")!.body ??
      {}) as { center: { lat: number; lon: number; label: string } };
    expect(body.center.label).toBe("map pin");
    expect(body.center.lat).toBeCloseTo(34.199, 9);
    expect(body.center.lon).toBeCloseTo(-118.487, 9);

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 34.1, longitude: -118.3 } }),
      },
    });
    try {
      fireEvent.click(screen.getByTestId("gps"));
      await wait(300);
      expect(screen.getByTestId("agent-center").textContent).toBe(
        "Center: my location (34.10000, -118.30000)",
      );
      await ask(QUESTION_1);
      expect(
        agentRequests.filter((r) => r.path === "/agent/answer")[1]!.body,
      ).toMatchObject({
        center: { lat: 34.1, lon: -118.3, label: "my location" },
      });
      // A pin dropped on the map afterwards is a "map pin" again.
      act(() => map.clickAt(300, 100));
      await wait(300);
      expect(screen.getByTestId("agent-center").textContent).toBe(
        "Center: map pin (34.19900, -118.48700)",
      );
    } finally {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });

  test("the screen's radius and last valid threshold go with every question and show under the box", async () => {
    const map = await start();
    await openSection();
    act(() => map.clickAt(300, 100));
    await wait(300);
    expect(screen.getByTestId("agent-screen").textContent).toBe(
      "Radius: 1 mi. Roof older than: 15 years.",
    );
    fireEvent.change(screen.getByTestId("radius"), {
      target: { value: "2.5" },
    });
    fireEvent.change(screen.getByTestId("threshold"), {
      target: { value: "25" },
    });
    // An invalid threshold: the search and the agent keep the last valid one (25).
    fireEvent.change(screen.getByTestId("threshold"), {
      target: { value: "500" },
    });
    await wait(300);
    expect(screen.getByTestId("threshold-error")).toBeTruthy();
    expect(screen.getByTestId("agent-screen").textContent).toBe(
      "Radius: 2.5 mi. Roof older than: 25 years.",
    );
    answers.push(ANSWERED);
    await ask(QUESTION_1);
    const body = agentRequests.find((r) => r.path === "/agent/answer")!
      .body as { screen: unknown };
    expect(body.screen).toEqual({ radius_miles: 2.5, threshold_years: 25 });
  });

  test("a parcel ID in Sources opens its detail (as a map click does) and pans the map to it; the pin and the search stay", async () => {
    const map = await start();
    act(() => map.clickAt(300, 100));
    await wait(300);
    expect(h.search).toHaveBeenCalledTimes(1);
    const pin = [
      screen.getByTestId("map").dataset.pinLat,
      screen.getByTestId("map").dataset.pinLon,
    ];
    await openSection();
    answers.push(ANSWERED);
    await ask(QUESTION_1);
    h.easeTo.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId("agent-parcel-link"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.detail).toHaveBeenCalledExactlyOnceWith({
      parcel_id: CITED_PARCEL,
    });
    expect(
      screen.getByTestId("detail").querySelector('[data-field="parcel_id"]')!
        .textContent,
    ).toBe(CITED_PARCEL);
    expect(h.easeTo).toHaveBeenCalledExactlyOnceWith({
      center: [PARCEL_AT.lon, PARCEL_AT.lat],
      zoom: 17,
      duration: 0,
    });
    await wait(300);
    expect([
      screen.getByTestId("map").dataset.pinLat,
      screen.getByTestId("map").dataset.pinLon,
    ]).toEqual(pin);
    expect(h.search).toHaveBeenCalledTimes(1);
    // The conversation is still there.
    expect(screen.getAllByTestId("agent-turn")).toHaveLength(1);
  });

  test("a parcel whose detail has no coordinates opens without a pan; a failed detail neither opens nor pans", async () => {
    await start();
    await openSection();
    answers.push(ANSWERED, ANSWERED);
    await ask(QUESTION_1);
    h.detail.mockResolvedValueOnce({
      property: { parcel_id: CITED_PARCEL, latitude: null, longitude: null },
      provenance: { parcel_id: CITED_PARCEL, source_name: "Test Source" },
    });
    h.easeTo.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId("agent-parcel-link"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("detail")).toBeTruthy();
    expect(h.easeTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    h.detail.mockRejectedValueOnce(new Error("HTTP 503"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("agent-parcel-link"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("detail")).toBeNull();
    expect(h.easeTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("error").textContent).toBe("HTTP 503");
  });
});
