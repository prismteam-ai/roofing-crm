import { describe, expect, it } from "vitest";
import { COUNTIES, geocodePlace, OSCEOLA } from "@/lib/config/county";

describe("geocodePlace", () => {
  it("resolves names, aliases and embedded mentions", () => {
    expect(geocodePlace("Kissimmee")?.lat).toBe(28.2919);
    expect(geocodePlace("st cloud, FL")?.name).toBe("St. Cloud");
    expect(geocodePlace("within five miles of Celebration")?.name).toBe("Celebration");
  });
  it("returns null for unknown places", () => {
    expect(geocodePlace("Orlando")).toBeNull();
    expect(geocodePlace("")).toBeNull();
  });
});

describe("counties", () => {
  it("only Osceola is enabled", () => {
    expect(COUNTIES.filter((c) => c.enabled).map((c) => c.key)).toEqual([OSCEOLA.key]);
  });
});
