// No horizontal scroll at the narrow widths the e2e projects should cover (360, 600, 1280 px): a
// CSS-rule check that the page-level containers clip or shrink instead of growing past the
// viewport. The live check (scrollWidth against innerWidth at each width) belongs to e2e.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (file: string): string => readFileSync(join(__dirname, "../src", file), "utf8");

describe("no horizontal scroll at 360, 600 and 1280 px", () => {
  const map = css("routes/Map/Map.module.css");

  it("the map page clips its overflow and fills the shell", () => {
    expect((map.match(/\.page \{[^}]*\}/) ?? [""])[0]).toMatch(/overflow:\s*hidden/);
  });

  it("every map pane can shrink below its content (min-width 0)", () => {
    for (const rule of [".mapArea", ".resultsSlot", ".top", ".controls"]) {
      // Every rule for the pane (the wide layout restates some of them): one must let it shrink.
      const blocks = (map.match(new RegExp(`\\${rule} \\{[^}]*\\}`, "g")) ?? []).join("\n");
      expect(blocks, rule).toMatch(/min-width:\s*0|overflow/);
    }
  });

  it("the Filters sheet is never wider than the viewport", () => {
    const sheet = css("routes/Map/FilterSheet.module.css");
    expect((sheet.match(/\.open \{[^}]*\}/) ?? [""])[0]).toMatch(/width:\s*min\(100%/);
  });

  it("the phone toolbar wraps instead of overflowing", () => {
    expect((map.match(/\.controls \{[^}]*\}/) ?? [""])[0]).toMatch(/flex-wrap:\s*wrap/);
  });

  it("the legend card and the snackbar are bounded by the viewport", () => {
    expect(css("components/Map/MapLegend.module.css")).toMatch(/width:\s*min\(18rem,\s*60vw\)/);
    expect(css("routes/Map/Candidates/Snackbar.module.css")).toMatch(/max-width:\s*560px/);
  });
});
