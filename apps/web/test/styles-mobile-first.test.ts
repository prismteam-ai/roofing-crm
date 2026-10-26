// Source rules for the style cleanup that follows the board match: tokens instead of raw pixel
// sizes, mobile-first (min-width) queries in the shell and map overlay stylesheets, and the
// parent focus ring wherever a text field suppresses its own outline. jsdom does not lay out, so
// these read the stylesheets, like styles-rules.test.ts and tablet-layout.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = (path: string): string => readFileSync(resolve(__dirname, "../src", path), "utf8");

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

describe("no raw pixel sizes on controls", () => {
  it("the radius field and its slider use space tokens (width 72 = 64 + 8, height 48)", () => {
    const css = src("components/Map/RadiusControl.module.css");
    expect(css).not.toMatch(/\b72px\b/);
    expect(css).not.toMatch(/(?:width|height): 48px/);
    expect(css).toMatch(/\.input \{[^}]*width: calc\(var\(--space-10\) \+ var\(--space-2\)\)/);
    expect(css).toMatch(/\.input \{[^}]*min-height: var\(--space-9\)/);
    expect(css).toMatch(/\.slider \{[^}]*min-height: var\(--space-9\)/);
  });

  it("the layer checkbox is space-5 square, and its row is a 48 px target", () => {
    const css = src("components/Map/LayersPopover.module.css");
    expect(css).not.toMatch(/\b20px\b/);
    expect(css).toMatch(/\.checkbox \{[^}]*width: var\(--space-5\);[^}]*height: var\(--space-5\)/);
    expect(css).toMatch(/\.row \{[^}]*min-height: var\(--space-9\)/);
  });

  it.each([
    "components/Map/GpsButton.module.css",
    "components/Map/LayersPopover.module.css",
    "components/Map/RadiusControl.module.css",
    "routes/Map/ResultsPanel.module.css",
    "routes/Map/SearchBox.module.css",
  ])("%s spells the 48 px tap target as var(--space-9)", (file) => {
    expect(src(file)).not.toMatch(/(?:width|height): 48px/);
  });
});

describe("shell and overlay stylesheets are mobile first", () => {
  const chip = src("components/AppShell/DataChip.module.css");
  const bar = src("components/AppShell/ShellTopBar.module.css");
  const crmMap = src("components/Map/CrmMap.module.css");

  it.each([
    ["DataChip.module.css", chip],
    ["CrmMap.module.css", crmMap],
  ])("%s has no max-width query", (_name, css) => {
    expect(css).not.toMatch(/@media[^{]*max-width/);
  });

  it("ShellTopBar keeps one max-width query, for Apps and Help (jsdom ignores media queries, so a display: none default would hide them from the shell unit tests)", () => {
    const queries = [...bar.matchAll(/@media[^{]*max-width[^{]*/g)].map((m) => m[0].trim());
    expect(queries).toEqual(["@media (max-width: 599px)"]);
    expect(media(bar, "(max-width: 599px)")).toMatch(/\.apps,\s*\.help \{\s*display: none;/);
  });

  it("the data chip shows the short run label by default and the long text from 840 px", () => {
    expect(chip).toMatch(/\.long \{\s*display: none;/);
    expect(chip).toMatch(/\.short \{\s*display: inline;/);
    const wide = media(chip, "(min-width: 840px)");
    expect(wide).toMatch(/\.long \{\s*display: inline;/);
    expect(wide).toMatch(/\.short \{\s*display: none;/);
  });

  it("the data panel docks under the bar by default and hangs from the chip from 600 px", () => {
    expect(chip).toMatch(
      /\.panel \{\s*position: fixed;\s*top: var\(--space-10\);\s*left: var\(--space-4\);\s*right: var\(--space-4\);/,
    );
    const tablet = media(chip, "(min-width: 600px)");
    expect(tablet).toMatch(/position: absolute;/);
    expect(tablet).toMatch(/top: calc\(100% \+ var\(--space-1\)\);/);
    expect(tablet).toMatch(/left: auto;/);
    expect(tablet).toMatch(/right: 0;/);
    expect(tablet).toMatch(
      /width: min\(calc\(100vw - var\(--space-8\)\), calc\(var\(--space-10\) \* 6\)\);/,
    );
  });

  it("the top bar hides the county label under 840 px and Apps and Help under 600 px", () => {
    expect(bar).toMatch(/\.county \{\s*display: none;/);
    expect(media(bar, "(min-width: 840px)")).toMatch(/\.county \{\s*display: inline-flex;/);
  });

  it("the pin crosshair shows by default (touch widths) and is hidden from 1280 px", () => {
    expect(crmMap).toMatch(/\.crosshair \{\s*display: block;/);
    expect(media(crmMap, "(min-width: 1280px)")).toMatch(/\.crosshair \{\s*display: none;/);
  });

  it("every min-width query in these files is a breakpoint listed in breakpoints.css", () => {
    const listed = src("styles/breakpoints.css");
    for (const css of [chip, bar, crmMap]) {
      for (const [, px] of css.matchAll(/@media \(min-width: (\d+)px\)/g)) {
        expect(listed, `${px} px`).toContain(`${px} px`);
      }
    }
  });
});

describe("a field that suppresses its own outline has a parent focus ring", () => {
  const ring = /outline: 3px solid var\(--md-sys-color-primary\);/;

  it("search box: the field draws the 3 px ring while the input has focus", () => {
    const css = src("routes/Map/SearchBox.module.css");
    expect(css).toMatch(/\.input:focus \{\s*outline: none;/);
    expect(/\.field:focus-within \{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(ring);
  });

  it("Ask composer: the card draws the 3 px ring (a border colour alone is not a focus ring)", () => {
    const css = src("routes/Ask/Ask.module.css");
    expect(css).toMatch(/\.input:focus-visible \{\s*outline: 0;/);
    const rule = /\.composer:focus-within \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(ring);
    expect(rule).toMatch(/outline-offset: 2px;/);
  });

  it.each([
    ["routes/Map/FilterSheet.module.css", "routes/Map/FilterSheet.tsx"],
    ["routes/Map/WhyPanel.module.css", "routes/Map/WhyPanel.tsx"],
  ])(
    "%s: only the panel itself drops its ring, and it is focused by script (tabIndex -1)",
    (cssFile, tsxFile) => {
      const css = src(cssFile);
      const suppressed = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*(?:none|0)\s*;[^}]*\}/g)].map(
        (m) => (m[1] ?? "").trim().split("\n").pop()?.trim(),
      );
      expect(suppressed).toEqual([".panel:focus"]);
      expect(src(tsxFile)).toMatch(/tabIndex=\{-1\}/);
    },
  );
});

describe("counts shown on the Filters controls are grouped like the rest of the page", () => {
  it("the phone sheet's chip and its Show button use thousands separators", () => {
    const tsx = src("routes/Map/FilterSheet.tsx");
    expect(tsx).toMatch(/\{matchCount\.toLocaleString\("en-US"\)\}/);
    expect(tsx).toMatch(/`Show \$\{matchCount\.toLocaleString\("en-US"\)\} /);
  });
});
