// CRM-HANDOFF rule 11, one overlay at a time: while the first-visit "What can I ask?" card is up,
// the map's legend, chips and controls step aside, and below 600 px the card keeps clear of the
// results sheet that floats over the bottom of the map. The layout is CSS, so these read the
// stylesheets (the live widths are proved by the Playwright responsive specs); the callback that
// tells the map the card is open is tested by rendering.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatCanIAsk } from "../../src/components/Onboarding/WhatCanIAsk.js";

const read = (path: string): string => readFileSync(join(__dirname, "../../src", path), "utf8");
const map = read("routes/Map/Map.module.css");
const card = read("components/Onboarding/WhatCanIAsk.module.css");

/** Every `@media (query) { ... }` block, found by brace matching. */
function blocks(css: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf("@media", from);
    if (start < 0) return found;
    let depth = 0;
    let end = css.length;
    for (let i = css.indexOf("{", start); i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    found.push(css.slice(start, end));
    from = end;
  }
}

/** The media block for `query` that holds the first-visit rules (a sheet has several per query). */
const welcomeBlock = (css: string, query: string): string =>
  blocks(css).find((b) => b.startsWith(`@media ${query}`) && b.includes("data-welcome")) ?? "";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("WhatCanIAsk reports whether it is open", () => {
  it("true while the card is up, false after Got it, and false when it unmounts", () => {
    const seen: boolean[] = [];
    const onOpenChange = vi.fn((open: boolean) => seen.push(open));
    const { unmount } = render(
      <MemoryRouter>
        <WhatCanIAsk onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    expect(seen.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(seen.at(-1)).toBe(false);
    unmount();
    expect(seen.at(-1)).toBe(false);
  });
});

describe("Map.tsx marks the page while the card is open", () => {
  const source = read("routes/Map/Map.tsx");

  it("sets data-welcome and the sheet's peek on the page, from the card's callback", () => {
    expect(source).toMatch(/<WhatCanIAsk onOpenChange=\{setWelcomeOpen\} \/>/);
    expect(source).toMatch(/"data-welcome": "open"/);
    expect(source).toMatch(/"data-sheet-peek": compactPeek \? "compact" : "results"/);
  });
});

describe("phones (under 600 px)", () => {
  const phone = welcomeBlock(map, "(max-width: 599.98px)");

  it("the floating overlay (Layers, legend, chips, radius) and the county hint step aside", () => {
    expect(phone).toMatch(
      /\.page\[data-welcome="open"\] \.overlay,\s*\.page\[data-welcome="open"\] \.countyCard \{[^}]*visibility:\s*hidden/,
    );
  });

  it("the card keeps clear of the results sheet: a reserve of the sheet's peek cap", () => {
    expect(phone).toMatch(/\.mapArea \{[^}]*--welcome-reserve:\s*40dvh/);
    expect(phone).toMatch(
      /\[data-sheet-peek="compact"\] \.mapArea \{[^}]*--welcome-reserve:\s*25dvh/,
    );
    expect(card).toMatch(
      /max-height:\s*calc\(100% - var\(--space-8\) - var\(--welcome-reserve, 0px\)\)/,
    );
  });

  it("the reserve matches the sheet's own peek caps (40% with results, 25% with a notice)", () => {
    const sheet = read("routes/Map/ResultsSheet.module.css");
    expect(sheet).toMatch(/max-height:\s*40%/);
    expect(sheet).toMatch(/\[data-peek="compact"\]\[data-sheet="peek"\] \{[^}]*max-height:\s*25%/);
  });
});

describe("tablets (600 to 1279 px)", () => {
  const tablet = welcomeBlock(map, "(min-width: 600px) and (max-width: 1279.98px)");

  it("the legend, the chip and the status cards step aside", () => {
    expect(tablet).toMatch(/\.page\[data-welcome="open"\] \.legendSlot/);
    expect(tablet).toMatch(/\.page\[data-welcome="open"\] \.chip/);
    expect(tablet).toMatch(/\.page\[data-welcome="open"\] \.statusStack/);
    expect(tablet).toMatch(/visibility:\s*hidden/);
  });

  it("the card never reserves sheet room here: the results panel is docked below the map", () => {
    expect(tablet).not.toMatch(/--welcome-reserve/);
  });
});

describe("desktop (1280 px and up) is untouched", () => {
  it("no data-welcome rule outside the phone and tablet blocks", () => {
    let rest = map;
    for (const query of [
      "(max-width: 599.98px)",
      "(min-width: 600px) and (max-width: 1279.98px)",
    ]) {
      rest = rest.replace(welcomeBlock(map, query), "");
    }
    expect(rest).not.toMatch(/data-welcome/);
  });
});
