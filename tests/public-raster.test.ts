import { describe, it, expect } from "vitest";
import {
  openStreetMapProvider,
  OSM_ORIGIN,
  OSM_TEMPLATE,
  OSM_ATTRIBUTION,
} from "../packages/map-domain/src/basemap";
import { mapConfiguration } from "../packages/hosted-runtime/src/map-config";
const now = Date.parse("2026-10-27T23:00:00Z");
const origin = "https://dsynthetic123.cloudfront.net";
const config = {
  kind: "raster",
  id: "openstreetmap-standard",
  template: OSM_TEMPLATE,
  approvedOrigin: OSM_ORIGIN,
  attribution: OSM_ATTRIBUTION,
  maxZoom: 18,
  allowedOrigin: origin,
  expiresAt: new Date(now + 3600000).toISOString(),
};
describe("free review raster boundary", () => {
  it("accepts only exact provider, attribution, review origin and bounded expiry", () => {
    expect(openStreetMapProvider(config, origin, now)).toMatchObject({
      kind: "raster",
      template: OSM_TEMPLATE,
      maxZoom: 18,
    });
    for (const change of [
      { template: "https://evil.test/{z}/{x}/{y}" },
      { template: OSM_TEMPLATE + "?key=bad" },
      { approvedOrigin: "https://evil.test" },
      { attribution: "" },
      { maxZoom: 19 },
      { allowedOrigin: "https://other.cloudfront.net" },
      { expiresAt: "invalid" },
      { expiresAt: new Date(now).toISOString() },
      { expiresAt: new Date(now + 15 * 86400000).toISOString() },
      { apiKey: "forbidden" },
    ])
      expect(() =>
        openStreetMapProvider({ ...config, ...change }, origin, now),
      ).toThrow();
    expect(() => openStreetMapProvider(null, origin, now)).toThrow();
  });
  it("caches exact public configuration and rejects conflicting keyed provider", async () => {
    let calls = 0;
    const loader = mapConfiguration(
      "synthetic",
      {
        send: async () => {
          calls++;
          return { SecretString: JSON.stringify({ publicRasterMap: config }) };
        },
      } as never,
      () => now,
    );
    expect(await loader()).toEqual(config);
    await loader();
    expect(calls).toBe(1);
    const conflict = mapConfiguration(
      "synthetic",
      {
        send: async () => ({
          SecretString: JSON.stringify({
            publicRasterMap: config,
            locationMap: {},
          }),
        }),
      } as never,
      () => now,
    );
    await expect(conflict()).rejects.toThrow();
  });
});
