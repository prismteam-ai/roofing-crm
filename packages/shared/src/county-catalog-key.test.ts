import { describe, expect, it } from "vitest";
import { parseCountyCatalogKey } from "./county-catalog-key.js";

describe("parseCountyCatalogKey", () => {
  it("accepts lee and chester catalog keys", () => {
    // Given published product county keys
    // When parseCountyCatalogKey normalizes each key
    // Then the result is the lowercase CountyCatalogKey
    expect(parseCountyCatalogKey("lee")).toBe("lee");
    expect(parseCountyCatalogKey("chester")).toBe("chester");
    expect(parseCountyCatalogKey("Lee")).toBe("lee");
  });

  it("rejects an empty string as unpublished / invalid", () => {
    // Given an empty catalog key input
    // When parseCountyCatalogKey runs
    // Then it throws (empty is never a published county key)
    expect(() => parseCountyCatalogKey("")).toThrow();
    expect(() => parseCountyCatalogKey("   ")).toThrow();
  });
});
