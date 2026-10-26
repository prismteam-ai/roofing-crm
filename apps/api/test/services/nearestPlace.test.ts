// Drawer header "TCAD {id} · near {place}" (CRM-HANDOFF E-93; design-review-log row 67's gap):
// `nearestPlace` picks the closest travis-places@1.0.0 place centroid to a property's
// coordinates. The gazetteer holds centroid points only (no boundaries), so it can say "near",
// never "in" — this test pins that, the gazetteer provenance, and that the answer is the true
// minimum over every place (checked against a brute-force scan built from the gazetteer's own
// public API, so it stays valid if the gazetteer is regenerated).
import { describe, expect, it } from "vitest";
import { distanceMeters } from "@crm/domain";
import { gazetteer } from "@crm/oracle-views";
import { nearestPlace } from "../../src/services/agent/placeResolver.js";

const METERS_PER_MILE = 1609.344;

function bruteForceNearest(lat: number, lon: number): string {
  let best: { name: string; d: number } | undefined;
  for (const name of gazetteer.listPlaceNames()) {
    const found = gazetteer.lookup(name);
    if (found.status !== "found") continue;
    const d = distanceMeters({ lat, lng: lon }, { lat: found.point.lat, lng: found.point.lon });
    if (best === undefined || d < best.d) best = { name, d };
  }
  if (best === undefined) throw new Error("gazetteer has no places");
  return best.name;
}

describe("nearestPlace", () => {
  it("names the place whose centroid the point sits on, at 0 mi, with gazetteer provenance", () => {
    const near = nearestPlace({ lat: 30.447765, lon: -97.602116 });
    expect(near).toEqual({
      name: "Pflugerville",
      distanceMi: 0,
      source: "travis-places@1.0.0",
      sha256: gazetteer.GAZETTEER.sha256,
    });
    expect(near?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the bare place name (as the boards print it), never the Census LSAD form", () => {
    const near = nearestPlace({ lat: 30.4434, lon: -97.68 });
    expect(near?.name).toBe("Wells Branch");
    expect(near?.name).not.toMatch(/ (city|town|village|CDP)$/);
  });

  it("returns the true nearest centroid across a grid of Travis points", () => {
    for (let lat = 30.1; lat <= 30.6; lat += 0.05) {
      for (let lon = -98.1; lon <= -97.4; lon += 0.05) {
        expect(nearestPlace({ lat, lon })?.name).toBe(bruteForceNearest(lat, lon));
      }
    }
  });

  it("reports the distance in miles to one decimal place", () => {
    const point = { lat: 30.4118, lon: -97.7069 };
    const near = nearestPlace(point);
    expect(near).toBeDefined();
    const found = gazetteer.lookup(near?.name ?? "");
    if (found.status !== "found") throw new Error("nearest place not in gazetteer");
    const exact =
      distanceMeters(
        { lat: point.lat, lng: point.lon },
        { lat: found.point.lat, lng: found.point.lon },
      ) / METERS_PER_MILE;
    expect(near?.distanceMi).toBe(Math.round(exact * 10) / 10);
  });

  it("returns undefined for non-finite coordinates instead of guessing", () => {
    expect(nearestPlace({ lat: Number.NaN, lon: -97.7 })).toBeUndefined();
    expect(nearestPlace({ lat: 30.3, lon: Number.POSITIVE_INFINITY })).toBeUndefined();
  });
});
