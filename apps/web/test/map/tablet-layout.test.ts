// The tablet map layout (boards CrmMap768 and CrmCandidates768): below 1280 px and from 600 px the
// results are a panel docked under the map instead of a bottom sheet over it; the Radius card sits
// bottom-right, the legend card bottom-left and open; Triage is an icon at 768 px and up. The
// layout is CSS, so these read the stylesheets (the live widths are proved by the Playwright
// screenshots of 768 and 1032 px); the behaviours behind them are unit-tested beside this file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGEND_OPEN_QUERY } from "../../src/components/Map/legendState";

const read = (path: string): string => readFileSync(join(__dirname, "../../src", path), "utf8");
const map = read("routes/Map/Map.module.css");
const radius = read("components/Map/RadiusControl.module.css");
const panel = read("routes/Map/ResultsPanel.module.css");
const list = read("routes/Map/Candidates/CandidateList.module.css");

/** The text of the first `@media (query) { ... }` block, found by brace matching. */
function media(css: string, query: string): string {
  const start = css.indexOf(`@media ${query}`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  return "";
}

describe("A1 docked split from 600 to 1279 px", () => {
  const docked = media(map, "(min-width: 600px) and (max-width: 1279.98px)");

  it("gives the map about 45 percent and the docked panel the rest, in one grid", () => {
    expect(docked).toMatch(
      /\.page\[data-view="map"\] \{[^}]*grid-template-rows:\s*auto auto minmax\(0, 11fr\) minmax\(0, 10fr\)/,
    );
    expect(docked).toMatch(/"map"\s*"results"/);
  });

  it("keeps the panel in the page when there is nothing to list, so the area never collapses", () => {
    expect(docked).toMatch(
      /\.resultsSlot\[data-empty="true"\] > \.paneBody \{[^}]*display:\s*contents/,
    );
  });

  it("Field triage takes the same docked area", () => {
    expect(docked).toMatch(/\.triageDock \{[^}]*position:\s*static[^}]*grid-area:\s*results/);
  });

  it("phones (under 600 px) keep the bottom sheet: no docked rows outside the media block", () => {
    expect(map.replace(docked, "")).not.toMatch(/minmax\(0, 11fr\)/);
  });
});

describe("A2 and A3 map overlay from 600 px", () => {
  const overlay = media(map, "(min-width: 600px)");

  it("puts the legend bottom-left and the Radius card bottom-right of the map", () => {
    expect(overlay).toMatch(/"legend radius"/);
    expect(overlay).toMatch(
      /\.radiusOverlay \{[^}]*grid-area:\s*radius[^}]*align-self:\s*end[^}]*justify-self:\s*end/,
    );
  });

  it("shows the Radius caption from 600 px; only phones hide it", () => {
    expect(radius).toMatch(/@media \(max-width: 599\.98px\) \{\s*\.origin \{/);
  });

  it("opens the legend by default from 600 px (phones stay collapsed)", () => {
    expect(LEGEND_OPEN_QUERY).toBe("(min-width: 600px)");
  });
});

describe("C5 Triage entry", () => {
  it("is the filled phone button, and an icon button from 768 px (the word stays for screen readers)", () => {
    const tablet = media(panel, "(min-width: 768px)");
    expect(tablet).toMatch(/\.triage \{[^}]*background:\s*transparent/);
    expect(tablet).toMatch(/\.triageText \{[^}]*clip-path:\s*inset\(50%\)/);
  });
});

describe("D1 Candidate list at 768 px", () => {
  const tablet = media(list, "(min-width: 768px) and (max-width: 1239.98px)");

  it("fits the table in the pane: address note and permit wrap, # waits for 840 px, Lat, lon for 1032 px", () => {
    expect(tablet).toMatch(/\.cAddress \{[^}]*min-width:\s*0/);
    expect(tablet).toMatch(/\.cPermit \{[^}]*min-width:\s*0/);
    expect(media(list, "(min-width: 840px)")).toMatch(/\.wide840 \{[^}]*display:\s*table-cell/);
    expect(media(list, "(min-width: 1032px)")).toMatch(/\.wide1032 \{[^}]*display:\s*table-cell/);
  });

  it("hides Lat, lon below 1032 px, where the coordinates ride on the address line", () => {
    expect(list).toMatch(/\.wide1032 \{\s*display:\s*none/);
    expect(media(list, "(min-width: 1032px)")).toMatch(/\.narrowOnly \{[^}]*display:\s*none/);
  });
});

describe("D2 Candidate list at 1240-1639 px (three-pane list area)", () => {
  const wide = media(list, "(min-width: 1240px) and (max-width: 1639.98px)");

  it("drops the Basis column and lets address and permit wrap, so the actions are never pushed out of the list", () => {
    expect(wide).toMatch(/td\.wide1240 \{[^}]*display:\s*none/);
    expect(wide).toMatch(/\.title,\s*\.sub \{[^}]*white-space:\s*normal/);
    expect(wide).toMatch(/\.cPermit \{[^}]*min-width:\s*0/);
  });
});
