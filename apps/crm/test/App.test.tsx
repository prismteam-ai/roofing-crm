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
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => {
  const maps: Array<{
    handlers: Record<string, Array<(e: unknown) => void>>;
    fire: (ev: string, e?: unknown) => void;
    clickAt: (x: number, y: number) => void;
    zoom: number;
  }> = [];
  const search = vi.fn();
  const points = vi.fn();
  const detail = vi.fn();
  const match = vi.fn();
  const runSummary = vi.fn();
  const easeTo = vi.fn();
  const leads = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { maps, search, points, detail, match, runSummary, easeTo, leads };
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
    addLayer() {}
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
  createApiClient: () =>
    Object.assign(() => undefined, {
      parcels: {
        search: { query: h.search },
        points: { query: h.points },
        detail: { query: h.detail },
        match: { query: h.match },
      },
      explorer: { runSummary: { query: h.runSummary } },
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
import { loadConfig } from "../src/config.ts";

const rule = {
  roll_year: 2026,
  threshold_years: 15,
  built_before_year: 2011,
  text: "older than 15 years means built before 2011",
};
const item = (id: string, d: number) => ({
  parcel_id: id,
  address: `${id} TEST ST`,
  year_built: 1980,
  roof_age_years_proxy: 46,
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
      "34.199000,-118.487000|1|15",
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
    expect(
      screen.getAllByTestId("lead-item").map((e) => e.dataset.parcel),
    ).toEqual(["0000000003"]);
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

    test("at the cap: 2,000 leads, none drawn, give 25 paced match calls (2 in flight at most, starts 250 ms apart)", async () => {
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
      expect(h.match).toHaveBeenCalledTimes(25);
      expect(
        h.match.mock.calls.every(
          ([v]) => (v as { parcel_ids: string[] }).parcel_ids.length <= 80,
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
      // Chunk 1 (80) is refused, chunk 2 (20) starts 250 ms later, chunk 1 is retried 1 s after its refusal.
      expect(h.match).toHaveBeenCalledTimes(3);
      expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(1000);
      expect(screen.queryByTestId("leads-search-error")).toBeNull();
      expect(screen.getByTestId("leads-count").textContent).toBe("2");
    });

    test("a second refusal is an error state, never a partial list", async () => {
      h.points.mockResolvedValue(capped());
      leadPages(100);
      h.match.mockImplementation(async (v: { parcel_ids: string[] }) => {
        if (v.parcel_ids.length === 80) throw throttled();
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
});
