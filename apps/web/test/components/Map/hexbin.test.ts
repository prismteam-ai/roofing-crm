// The zoomed-out overview (design-review-log row 10, CRM-HANDOFF E-67/E-72): properties are
// aggregated into hexagons coloured by median roof age. Pure math — no map, no DOM.
import { describe, expect, it } from "vitest";
import {
  OVERVIEW_MAX_ZOOM,
  hexbin,
  hexCellsToFeatureCollection,
  isOverviewView,
  isOverviewZoom,
  overviewToHexCells,
  overviewPermitPoints,
  type HexPoint,
} from "../../../src/components/Map/hexbin.js";
import { HEX_OVERVIEW_MAX_ZOOM, hexAxialOf } from "@crm/domain";
import { permitOpenBucket, roofAgeBucket } from "../../../src/format/index.js";

const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

function at(p: { lat: number; lng: number }, roofAgeYears: number | null): HexPoint {
  return { lat: p.lat, lng: p.lng, roofAgeYears };
}

describe("hexbin", () => {
  it("puts nearby points in one cell and far-apart points in separate cells", () => {
    const cells = hexbin(
      [
        at(PFLUGERVILLE, 10),
        at({ lat: PFLUGERVILLE.lat + 0.0005, lng: PFLUGERVILLE.lng }, 20),
        at(AUSTIN, 30),
      ],
      { zoom: 9 },
    );
    expect(cells).toHaveLength(2);
    const counts = cells.map((c) => c.count).sort();
    expect(counts).toEqual([1, 2]);
  });

  it("reports the median roof age, ignoring properties with no published roof age", () => {
    const [cell] = hexbin([at(AUSTIN, 10), at(AUSTIN, 30), at(AUSTIN, 20), at(AUSTIN, null)], {
      zoom: 9,
    });
    expect(cell?.count).toBe(4);
    expect(cell?.withRoofAge).toBe(3);
    expect(cell?.medianRoofAge).toBe(20);
  });

  it("averages the two middle values for an even count, and is null when no age is published", () => {
    const [even] = hexbin([at(AUSTIN, 10), at(AUSTIN, 21)], { zoom: 9 });
    expect(even?.medianRoofAge).toBe(15.5);
    const [none] = hexbin([at(AUSTIN, null)], { zoom: 9 });
    expect(none?.medianRoofAge).toBeNull();
  });

  it("counts the aged-roof share against the threshold", () => {
    const [cell] = hexbin([at(AUSTIN, 10), at(AUSTIN, 15), at(AUSTIN, 30), at(AUSTIN, null)], {
      zoom: 9,
      agedYears: 15,
    });
    expect(cell?.agedCount).toBe(2);
  });

  it("draws a closed six-sided ring around a centre inside the cell", () => {
    const [cell] = hexbin([at(AUSTIN, 10)], { zoom: 9 });
    expect(cell?.ring).toHaveLength(7);
    expect(cell?.ring[0]).toEqual(cell?.ring[6]);
    const lngs = cell?.ring.map((p) => p[0]) ?? [];
    const lats = cell?.ring.map((p) => p[1]) ?? [];
    expect(Math.min(...lngs)).toBeLessThan(AUSTIN.lng);
    expect(Math.max(...lngs)).toBeGreaterThan(AUSTIN.lng);
    expect(Math.min(...lats)).toBeLessThan(AUSTIN.lat);
    expect(Math.max(...lats)).toBeGreaterThan(AUSTIN.lat);
  });

  it("uses smaller cells as the zoom increases", () => {
    const pts = [at(AUSTIN, 10), at({ lat: AUSTIN.lat + 0.02, lng: AUSTIN.lng }, 10)];
    expect(hexbin(pts, { zoom: 5 })).toHaveLength(1);
    expect(hexbin(pts, { zoom: 12 })).toHaveLength(2);
  });

  it("returns no cells for no points", () => {
    expect(hexbin([], { zoom: 9 })).toEqual([]);
  });

  it("aggregates a full-county-sized set (441,961 rows) in well under two seconds", () => {
    const n = 441_961;
    const pts: HexPoint[] = new Array(n);
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let i = 0; i < n; i += 1) {
      pts[i] = {
        lat: 30.0 + rand() * 0.7,
        lng: -98.2 + rand() * 0.8,
        roofAgeYears: rand() < 0.1 ? null : Math.floor(rand() * 40),
      };
    }
    const started = performance.now();
    const cells = hexbin(pts, { zoom: 9 });
    const elapsed = performance.now() - started;
    expect(cells.reduce((sum, c) => sum + c.count, 0)).toBe(n);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("shared grid", () => {
  it("bins on @crm/domain's grid, the one search.countyOverview's SQL is pinned to", () => {
    expect(OVERVIEW_MAX_ZOOM).toBe(HEX_OVERVIEW_MAX_ZOOM);
    const [cell] = hexbin([at(AUSTIN, 10)], { zoom: 9 });
    const { q, r } = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
    expect(cell?.id).toBe(`9:${String(q)}:${String(r)}`);
  });
});

describe("overviewToHexCells (search.countyOverview cells)", () => {
  const { q, r } = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
  const serverCell = {
    q,
    r,
    lat: 30.26,
    lng: -97.74,
    count: 4,
    withRoofAge: 3,
    medianRoofAge: 21,
    agedCount: 2,
  };

  it("draws the same hexagon the client binning draws for the same point", () => {
    const [server] = overviewToHexCells([serverCell], 9);
    const [client] = hexbin([at(AUSTIN, 21)], { zoom: 9 });
    expect(server?.id).toBe(client?.id);
    expect(server?.ring).toEqual(client?.ring);
    expect(server?.center).toEqual([-97.74, 30.26]);
    expect(server).toMatchObject({ count: 4, withRoofAge: 3, medianRoofAge: 21, agedCount: 2 });
  });

  it("feeds the existing feature collection (colour token from the median)", () => {
    const fc = hexCellsToFeatureCollection(overviewToHexCells([serverCell], 9));
    expect(fc.features[0]?.properties.token).toBe("--viz-roof-age-20-24");
  });

  it("turns cells with counted permits into weighted cluster points at the cell centre", () => {
    const points = overviewPermitPoints([
      { ...serverCell, openPermits: 2, stalledPermits: 1, maxOpenDays: 900 },
      { ...serverCell, q: q + 1, openPermits: 0, stalledPermits: 0, maxOpenDays: null },
      serverCell,
    ]);
    expect(points).toEqual([{ lat: 30.26, lng: -97.74, permits: 3, openDays: 900 }]);
  });
});

describe("overview zoom", () => {
  it("is the overview below the threshold and individual pins at or above it", () => {
    expect(isOverviewZoom(9)).toBe(true);
    expect(isOverviewZoom(OVERVIEW_MAX_ZOOM - 0.01)).toBe(true);
    expect(isOverviewZoom(OVERVIEW_MAX_ZOOM)).toBe(false);
    expect(isOverviewZoom(14)).toBe(false);
  });
});

describe("overview view", () => {
  it("is the county hexagons only while zoomed out with no search centre", () => {
    expect(isOverviewView(9, false)).toBe(true);
    expect(isOverviewView(10.4, false)).toBe(true);
    // A dropped pin or GPS fix is a radius search: its results show as markers at any zoom.
    expect(isOverviewView(10.4, true)).toBe(false);
    expect(isOverviewView(8, true)).toBe(false);
    expect(isOverviewView(12, false)).toBe(false);
  });
});

describe("hexCellsToFeatureCollection", () => {
  it("emits one polygon per cell with its count, median and colour token", () => {
    const cells = hexbin([at(AUSTIN, 22), at(PFLUGERVILLE, null)], { zoom: 9 });
    const fc = hexCellsToFeatureCollection(cells);
    expect(fc.features).toHaveLength(2);
    const aged = fc.features.find((f) => f.properties.medianRoofAge === 22);
    expect(aged?.properties.token).toBe("--viz-roof-age-20-24");
    expect(aged?.geometry.type).toBe("Polygon");
    const unknown = fc.features.find((f) => f.properties.medianRoofAge === null);
    expect(unknown?.properties.token).toBe("none");
  });
});

describe("scales", () => {
  it("buckets roof age and permit open duration into the Atlas viz tokens", () => {
    expect(roofAgeBucket(0)?.token).toBe("--viz-roof-age-0-9");
    expect(roofAgeBucket(14)?.token).toBe("--viz-roof-age-10-14");
    expect(roofAgeBucket(25)?.token).toBe("--viz-roof-age-25-plus");
    expect(roofAgeBucket(null)).toBeNull();
    expect(permitOpenBucket(100)?.token).toBe("--viz-permit-open-lt-1y");
    expect(permitOpenBucket(1826)?.token).toBe("--viz-permit-open-3-5y");
    expect(permitOpenBucket(1827)?.token).toBe("--viz-permit-open-gt-5y");
    expect(permitOpenBucket(null)).toBeNull();
  });
});
