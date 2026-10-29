import { describe, expect, it } from "vitest";
import wire from "./fixtures/amazon-location-standard-wire-paths.json";
import {
  amazonLocationProvider,
  locationRequest,
  locationResourceClass,
  LOCATION_ORIGIN,
} from "../packages/map-domain/src/basemap";
const origin = "https://dsynthetic.cloudfront.net";
const provider = amazonLocationProvider(
  {
    kind: "amazon-location",
    apiKey: "synthetic-not-service-map-key",
    allowedOrigin: origin,
    region: "us-east-2",
    style: "Standard",
    expiresAt: "2026-11-01T00:00:00.000Z",
    restrictionsDigest: "a".repeat(64),
  },
  origin,
  Date.parse("2026-10-28T00:00:00.000Z"),
);
describe("actual AWS Standard descriptor path projection", () => {
  it("accepts captured versioned sprites and browser-expanded PNG/JSON at both densities", () => {
    expect(wire.descriptorVersion).toBe(8);
    expect(wire.layerCount).toBe(160);
    for (const suffix of ["", ".png", ".json", "@2x.png", "@2x.json"]) {
      const path = wire.sprite + suffix;
      expect(locationResourceClass(path)).toBe("sprite");
      const request = locationRequest(provider, LOCATION_ORIGIN + path);
      expect(new URL(request.url).pathname).toBe(path);
      expect(new URL(request.url).searchParams.get("key")).toBe(
        provider.apiKey,
      );
      expect(request.referrerPolicy).toBe("strict-origin-when-cross-origin");
      expect(request.credentials).toBe("same-origin");
    }
  });
  it("accepts the documented unversioned Standard Light Default path and retained tile/glyph classes", () => {
    for (const path of [
      wire.sprite.replace("4_1_0-beta_1/", "") + ".json",
      wire.glyphs
        .replace("{fontstack}", "Amazon%20Ember%20Regular")
        .replace("{range}", "0-255"),
      wire.tiles
        .replace("{z}", "11")
        .replace("{x}", "550")
        .replace("{y}", "740"),
    ])
      expect(() => locationRequest(provider, path)).not.toThrow();
  });
  it.each(["4_2_0", "4_2_0-rc_1", "5_10_12-beta_99", "6_0_0-alpha_2"])(
    "admits a bounded future rolling provider version without changing the resource class: %s",
    (version) => {
      const path = wire.sprite.replace("4_1_0-beta_1", version) + ".json";
      expect(locationResourceClass(path)).toBe("sprite");
      expect(() => locationRequest(provider, path)).not.toThrow();
    },
  );
  it.each([
    wire.sprite.replace("4_1_0-beta_1", "unreviewed-version") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4444_2_0") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2_0-preview_1") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2_0-rc_1234") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2_0/../4_1_0-beta_1") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2_0/%2e%2e/4_1_0-beta_1") + ".json",
    wire.sprite.replace("4_1_0-beta_1", "4_2_0%2fmalicious") + ".json",
    wire.sprite.replace("Standard", "Hybrid") + ".json",
    wire.sprite.replace("Light", "Dark") + ".json",
    wire.sprite.replace("Default", "Unreviewed") + ".json",
    wire.sprite + ".svg",
    wire.sprite + ".png/extra",
    wire.sprite + ".json?redirect=https://unapproved.invalid",
    wire.sprite + ".json#fragment",
    "/v2/styles/Standard/sprites/sprite.json",
    "/v2/geocode/search",
    "https://maps.geo.us-east-1.amazonaws.com" + wire.sprite + ".png",
    "https://unapproved.invalid" + wire.sprite + ".png",
    "http://maps.geo.us-east-2.amazonaws.com" + wire.sprite + ".png",
    "https://user:password@maps.geo.us-east-2.amazonaws.com" +
      wire.sprite +
      ".png",
  ])(
    "rejects unrelated path, host, scheme, credential, query or fragment: %s",
    (resource) => {
      expect(() => locationRequest(provider, resource)).toThrow(
        "outside the exact approved Amazon Location paths",
      );
    },
  );
});
