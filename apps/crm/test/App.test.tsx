// @vitest-environment jsdom
/**
 * Component test of the CRM main screen (React Testing Library on jsdom, fake timers).
 * Mocks:
 * - ../src/maplibre.ts: a minimal fake MapLibre (Map records event handlers and sources; Marker/NavigationControl no-ops).
 *   WebGL is not available in jsdom, and the test needs to fire "load" and "click" itself.
 * - ../src/config.ts: loadConfig resolves a fixed config (no network).
 * - @oracle-la/api-client: createApiClient returns a CALLABLE object, like the real tRPC v11 proxy
 *   (typeof client === "function"), with vi.fn() procedures.
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
  return { maps, search, points, detail };
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
    easeTo() {}
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
      },
    }),
}));

import { App } from "../src/App.tsx";

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
