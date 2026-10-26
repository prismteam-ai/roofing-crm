// The hexagon grid both the web map (client fallback binning) and the API's
// `search.countyOverview` DuckDB SQL use. These golden vectors pin the cell math; the API's
// test (apps/api/test/countyOverview.test.ts) checks its SQL twin against `hexAxialOf` itself.
import { describe, expect, it } from "vitest";
import {
  HEX_OVERVIEW_MAX_ZOOM,
  HEX_RADIUS_PX,
  HEX_TILE_PX,
  hexAxialOf,
  hexCellCenter,
  hexCellId,
  hexCellRing,
  hexWorldSize,
} from "../src/hexGrid.js";

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };

describe("hex grid", () => {
  it("fixes the grid constants the client and server share", () => {
    expect(HEX_TILE_PX).toBe(256);
    expect(HEX_RADIUS_PX).toBe(24);
    expect(HEX_OVERVIEW_MAX_ZOOM).toBe(11);
    expect(hexWorldSize(9)).toBe(131_072);
    expect(hexWorldSize(9.7)).toBe(131_072); // whole-number zoom
  });

  it("assigns fixed points to fixed axial cells (golden vectors)", () => {
    expect(hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9)).toEqual({ q: -29, r: 1499 });
    expect(hexAxialOf(PFLUGERVILLE.lat, PFLUGERVILLE.lng, 9)).toEqual({ q: -27, r: 1497 });
    expect(hexAxialOf(AUSTIN.lat, AUSTIN.lng, 10)).toEqual({ q: -58, r: 2998 });
    expect(hexAxialOf(AUSTIN.lat, AUSTIN.lng, 6)).toEqual({ q: -4, r: 188 });
  });

  it("puts a cell's own centre back into that cell", () => {
    for (const zoom of [6, 8, 9, 10]) {
      const { q, r } = hexAxialOf(AUSTIN.lat, AUSTIN.lng, zoom);
      const [lng, lat] = hexCellCenter(q, r, zoom);
      expect(hexAxialOf(lat, lng, zoom)).toEqual({ q, r });
    }
  });

  it("draws a closed seven-point ring around the centre", () => {
    const { q, r } = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
    const ring = hexCellRing(q, r, 9);
    expect(ring).toHaveLength(7);
    expect(ring[0]).toEqual(ring[6]);
    const [cLng, cLat] = hexCellCenter(q, r, 9);
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    expect(Math.min(...lngs)).toBeLessThan(cLng);
    expect(Math.max(...lngs)).toBeGreaterThan(cLng);
    expect(Math.min(...lats)).toBeLessThan(cLat);
    expect(Math.max(...lats)).toBeGreaterThan(cLat);
  });

  it("names a cell by zoom and axial coordinates", () => {
    expect(hexCellId(9, -29, 1499)).toBe("9:-29:1499");
    expect(hexCellId(9.6, -29, 1499)).toBe("9:-29:1499");
  });
});
