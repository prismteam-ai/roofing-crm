// The results sheet (below 1280 px, where the Ask AI panel, the results and the candidate cards
// sit) must scroll inside itself. The sheet is capped with a percentage of the page, and a browser
// that cannot resolve that percentage (an iPad's Safari, when the page height is not definite) lets
// the sheet grow past the page, where the page's overflow:hidden cuts the content off and nothing
// scrolls. So the sheet's body carries its own cap in viewport units, which always resolve.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../../src/routes/Map/ResultsSheet.module.css"), "utf8");
const block = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (css.match(new RegExp(`${escaped} \\{[^}]*\\}`)) ?? [""])[0];
};

describe("ResultsSheet scroll container", () => {
  it("the body scrolls on its own and is bounded by the sheet's own cap", () => {
    const body = block(".body");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/max-height:\s*calc\(var\(--sheet-cap\)\s*-\s*var\(--space-9\)\)/);
  });

  it("every sheet state defines the cap in dvh (the percentage max-height stays beside it)", () => {
    for (const selector of [
      ".sheet",
      '.sheet[data-peek="compact"][data-sheet="peek"]',
      '.sheet[data-sheet="full"]',
    ]) {
      const rule = block(selector);
      expect(rule, selector).toMatch(/--sheet-cap:\s*[^;]*dvh/);
      expect(rule, selector).toMatch(/max-height:/);
    }
    // The phone's peek is the base 40 percent; tablets dock the panel instead of a 50 percent peek.
    expect(css).not.toMatch(/--sheet-cap:\s*50dvh/);
  });

  it("the short-landscape peek keeps a cap too", () => {
    expect(css).toMatch(/--sheet-cap:\s*calc\(var\(--space-9\) \* 2 \+ var\(--space-2\)\)/);
  });

  it("from 1280 px the sheet is the static pane and the body is not capped", () => {
    const wide = css.slice(css.indexOf("@media (min-width: 1280px)"));
    expect(wide).toMatch(/\.body \{[^}]*max-height:\s*none/);
  });

  it("from 600 px the panel is docked under the map: not capped, scrolling in its own body", () => {
    const docked = css.slice(
      css.indexOf("@media (min-width: 600px) and (max-width: 1279.98px)"),
      css.indexOf("@media (min-width: 1280px)"),
    );
    expect(docked).toMatch(/\.body \{[^}]*max-height:\s*none/);
    expect(docked).toMatch(/\.body \{[^}]*flex:\s*1 1 0/);
    expect(docked).toMatch(/grid-area:\s*results/);
    expect(docked).toMatch(/position:\s*static/);
    expect(docked).toMatch(/\.handle \{[^}]*display:\s*none/);
    // The body keeps its own overflow rule from the base block.
    expect(block(".body")).toMatch(/overflow-y:\s*auto/);
  });
});

describe("Candidate list sheet scroll", () => {
  const map = readFileSync(join(__dirname, "../../src/routes/Map/Map.module.css"), "utf8");
  const list = readFileSync(
    join(__dirname, "../../src/routes/Map/Candidates/CandidateList.module.css"),
    "utf8",
  );

  it("the list pane is a flex column and the list fills it without a percentage height", () => {
    expect((map.match(/\.listPane \{[^}]*\}/) ?? [""])[0]).toMatch(/display:\s*flex/);
    expect((list.match(/\.list \{[^}]*\}/) ?? [""])[0]).toMatch(/flex:\s*1 1 0/);
  });

  it("the list's own body is the scroll container", () => {
    const body = (list.match(/\.body \{[^}]*\}/) ?? [""])[0];
    expect(body).toMatch(/overflow:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/);
  });
});
