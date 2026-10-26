// CSS-level rules the Atlas audit and the accessibility sweep depend on. jsdom does not lay out,
// so these read the source: a rule that returns here shows up as a hosted-audit failure.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = (path: string): string => readFileSync(resolve(__dirname, "../src", path), "utf8");

describe("shared base rules (tokens.css)", () => {
  const tokens = src("styles/tokens.css");

  it("stops animations under reduced motion instead of shortening them", () => {
    const rule = /prefers-reduced-motion: reduce\) \{([^}]*)\}\s*\}?/.exec(tokens)?.[1] ?? "";
    expect(rule).toMatch(/animation:\s*none\s*!important/);
    expect(rule).not.toMatch(/animation-duration/);
  });

  it("draws the focus ring 3 px wide", () => {
    expect(tokens).toMatch(/:focus-visible \{ outline: 3px solid/);
  });

  it("form controls inherit the page's font and colour", () => {
    expect(tokens).toMatch(
      /button, input, select, textarea \{ font-family: inherit; font-size: inherit; color: inherit; \}/,
    );
  });
});

describe("no module stylesheet uses a spacing the Atlas audit rejects", () => {
  const files = [
    "routes/SignIn/SignIn.module.css",
    "routes/Leads/Leads.module.css",
    "routes/Leads/LeadFilters.module.css",
    "components/AppShell/RoadmapItem.module.css",
    "components/AppShell.module.css",
  ];
  it.each(files)("%s has no negative margin and no margin-left auto", (file) => {
    const css = src(file);
    expect(css).not.toMatch(/margin[a-z-]*:[^;]*calc\(-1/);
    expect(css).not.toMatch(/margin[a-z-]*:\s*-\d/);
    expect(css).not.toMatch(/margin-left:\s*auto/);
  });

  it("state layers are container tokens, not a blend of on-surface at an opacity", () => {
    for (const file of [
      "components/AppShell/RoadmapItem.module.css",
      "components/AppShell.module.css",
      "components/AppShell/MoreSheet.module.css",
      "components/AppShell/AppLinks.module.css",
      "components/AppShell/ShellTopBar.module.css",
      "components/AppShell/DataChip.module.css",
      "routes/Leads/Leads.module.css",
    ]) {
      expect(src(file), file).not.toMatch(/color-mix\([^)]*on-surface/);
      expect(src(file), file).not.toMatch(/color-mix\([^)]*primary\)\s*38%/);
    }
  });
});

describe("tap targets", () => {
  it("a lead card's link stretches over the whole card", () => {
    const css = src("routes/Leads/Leads.module.css");
    expect(css).toMatch(/\.row \{\s*position: relative;/);
    expect(css).toMatch(/\.cardLink::after \{[^}]*position: absolute;[^}]*inset: 0;/);
  });

  it("the citation number is an inline-level link (an atomic nowrap box, so it never clips) with a 48 px hit area", () => {
    const css = src("routes/Ask/Ask.module.css");
    expect(css).toMatch(/\.citeRef \{[^}]*display: inline-flex;/);
    expect(css).toMatch(/\.citeRef \{[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.citeRef::after \{[^}]*height: var\(--space-9\)/);
  });
});

describe("sign-in", () => {
  it("keeps the label readable while signing in (no opacity on the disabled submit)", () => {
    const css = src("routes/SignIn/SignIn.module.css");
    const rule = /\.submit:disabled \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).not.toMatch(/opacity/);
    expect(rule).toMatch(/color: var\(--md-sys-color-on-surface\)/);
  });
});

describe("map layout", () => {
  it("three panes start at 1280 px, where the map keeps a usable width", () => {
    const css = src("routes/Map/Map.module.css");
    expect(css).toMatch(/@media \(min-width: 1280px\)/);
    expect(css).not.toMatch(/min-width: 840px/);
    expect(src("routes/Map/Map.tsx")).toMatch(/WIDE_QUERY = "\(min-width: 1280px\)"/);
  });

  it("the overlay's layout boxes let clicks through to the map", () => {
    const css = src("routes/Map/Map.module.css");
    expect(css).toMatch(/\.layersRow,\s*\.legendSlot \{\s*pointer-events: none;/);
  });
});
