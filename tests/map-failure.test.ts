import { describe, expect, it } from "vitest";
import { mapFailureDisposition } from "../packages/map-domain/src/map-failure";

const descriptor =
  "https://maps.geo.us-east-2.amazonaws.com/v2/styles/Standard/descriptor";
describe("geographic map resource failures", () => {
  for (const ready of [false, true]) {
    for (const path of [
      "/v2/tiles/vector.basemap/12/1100/1500",
      "/v2/glyphs/Example/0-255.pbf",
      "/v2/styles/1_0_0/Standard/Light/Default/sprites/sprites.png",
    ]) {
      it(`keeps a ${ready ? "loaded" : "loading"} map after an individual ${path} failure`, () => {
        expect(
          mapFailureDisposition(
            {
              error: {
                status: 503,
                url: "https://maps.geo.us-east-2.amazonaws.com" + path,
              },
            },
            ready,
            descriptor,
          ),
        ).toBe("warning");
      });
    }
  }
  it("does not mistake an authorized tile's HTTP403 for a fatal descriptor rejection", () => {
    expect(
      mapFailureDisposition(
        {
          sourceId: "vector.basemap",
          error: {
            status: 403,
            url: "https://maps.geo.us-east-2.amazonaws.com/v2/tiles/vector.basemap/12/1100/1500",
          },
        },
        true,
        descriptor,
      ),
    ).toBe("warning");
  });
  for (const status of [400, 401, 403, 404]) {
    it(`reports a descriptor HTTP${status} as fatal without exposing its credential`, () => {
      expect(
        mapFailureDisposition(
          {
            error: { status, url: descriptor + "?key=synthetic-map-material" },
          },
          false,
          descriptor,
        ),
      ).toBe("fatal");
    });
  }
  it("retries a transient initial descriptor outage, but retains a working map for a later transient error", () => {
    const event = { error: { status: 503, url: descriptor } };
    expect(mapFailureDisposition(event, false, descriptor)).toBe(
      "retry-initial",
    );
    expect(mapFailureDisposition(event, true, descriptor)).toBe("warning");
  });
  it("rejects a malformed descriptor and does not classify an unknown resource as a fatal style", () => {
    expect(
      mapFailureDisposition(
        { error: { name: "SyntaxError", url: descriptor } },
        false,
        descriptor,
      ),
    ).toBe("fatal");
    expect(
      mapFailureDisposition(
        { error: { status: 403, url: "https://other.invalid/descriptor" } },
        false,
        descriptor,
      ),
    ).toBe("warning");
    expect(
      mapFailureDisposition(
        { error: new Error("Network error") },
        true,
        descriptor,
      ),
    ).toBe("warning");
    expect(mapFailureDisposition(null, false, descriptor)).toBe("warning");
  });
});
