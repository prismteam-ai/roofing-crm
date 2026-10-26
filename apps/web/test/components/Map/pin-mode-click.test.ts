// In pin mode a map click drops the pin even over a hexagon (the hexagon's zoom-in used to take
// the first click). Source-level guard: MapLibre is not run in unit tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../src/components/Map/CrmMap.tsx"), "utf8");

describe("pin mode click handling", () => {
  it("the general click handler skips the hexagon bail-out in pin mode", () => {
    expect(source).toMatch(/!pinModeRef\.current &&\s+onHexSelectRef\.current !== undefined/);
  });

  it("the hexagon's own handler does nothing in pin mode", () => {
    expect(source).toMatch(/if \(pinModeRef\.current\) return;\s+const props = event\.features/);
  });
});
