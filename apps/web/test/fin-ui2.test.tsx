// Final-evaluation front-end fixes (branch fin-ui2): card layout, phone list, first-visit card,
// the drawer closing on an ask, and the ring fit.
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { unionBox } from "../src/components/Map/bounds.js";
import { WhatCanIAsk } from "../src/components/Onboarding/WhatCanIAsk.js";
import { isDismissed, resetDismissedForPage } from "../src/components/Onboarding/firstVisit.js";
import { useMapMode } from "../src/routes/Map/mapMode.js";

afterEach(cleanup);

const css = (rel: string): string => readFileSync(resolve(__dirname, "../src", rel), "utf8");
const block = (source: string, selector: string): string => {
  const at = source.indexOf(`\n${selector} {`);
  expect(at, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return source.slice(at, source.indexOf("}", at));
};

describe("shared match card layout (item 2)", () => {
  const source = css("routes/Map/ResultRow.module.css");
  it("the header wraps and the distance can shrink and wrap, so it never overlaps the address", () => {
    expect(block(source, ".head")).toMatch(/flex-wrap:\s*wrap/);
    const distance = block(source, ".distance");
    expect(distance).toMatch(/min-width:\s*0/);
    expect(distance).toMatch(/overflow-wrap:\s*anywhere/);
    expect(distance).not.toMatch(/white-space:\s*nowrap/);
    expect(block(source, ".title")).toMatch(/min-width:\s*0/);
    expect(block(source, ".title")).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("phone candidate list (item 3)", () => {
  const source = css("routes/Map/Candidates/CandidateList.module.css");
  it("below 600 px a row is a grid whose address spans wide columns and wraps at words", () => {
    const at = source.indexOf(
      "@media (max-width: 599.98px)",
      source.indexOf("Phone (below 600 px)"),
    );
    expect(at).toBeGreaterThan(0);
    const phone = source.slice(at);
    expect(phone).toMatch(/\.table tbody tr \{[^}]*display:\s*grid/);
    expect(phone).toMatch(/\.cAddress \{[^}]*grid-column:\s*2 \/ span 2/);
    expect(phone).toMatch(/overflow-wrap:\s*break-word/);
  });
  it("the table columns are untouched from 768 px up (the phone rules are all under 600)", () => {
    expect(source).toMatch(/@media \(min-width: 768px\) \{\s*\.wide768 \{\s*display: table-cell/);
  });
});

describe("first-visit card (item 4)", () => {
  const renderCard = (): void => {
    render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(WhatCanIAsk)));
  };
  it("caps its height at 40 percent of the phone viewport and keeps Close pinned", () => {
    const source = css("components/Onboarding/WhatCanIAsk.module.css");
    const phone = source.slice(source.indexOf("@media (max-width: 599.98px)"));
    expect(phone).toMatch(/max-height:\s*min\(40dvh/);
    expect(phone).toMatch(/\.header \{[^}]*position:\s*sticky/);
  });
  it.each([["Close"], ["Got it"]])("%s dismisses it and it stays dismissed", (name) => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(isDismissed()).toBe(true);
    cleanup();
    renderCard();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("stays dismissed for the page and the tab even when localStorage is blocked", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      },
    });
    try {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Got it" }));
      expect(isDismissed()).toBe(true);
      // A new page load (the in-page flag gone): the tab's sessionStorage still remembers.
      resetDismissedForPage();
      expect(isDismissed()).toBe(true);
    } finally {
      if (original !== undefined) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("asking from the drawer (item 5)", () => {
  const wrapper =
    (url: string) =>
    ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: [url] }, children);
  it("clearQuestion with closeDrawer drops q and sel, keeping the pin and radius", () => {
    const { result } = renderHook(() => ({ mode: useMapMode(), loc: useLocation() }), {
      wrapper: wrapper("/?mode=ai&q=Tell%20me&lat=30.4&lng=-97.6&r=5&sel=bafkreiabc"),
    });
    act(() => result.current.mode.clearQuestion({ closeDrawer: true }));
    const params = new URLSearchParams(result.current.loc.search);
    expect(params.has("q")).toBe(false);
    expect(params.has("sel")).toBe(false);
    expect(params.get("lat")).toBe("30.4");
    expect(params.get("r")).toBe("5");
    expect(params.get("mode")).toBe("ai");
  });
  it("without closeDrawer the selection is kept", () => {
    const { result } = renderHook(() => ({ mode: useMapMode(), loc: useLocation() }), {
      wrapper: wrapper("/?mode=ai&q=x&sel=bafkreiabc"),
    });
    act(() => result.current.mode.clearQuestion());
    expect(new URLSearchParams(result.current.loc.search).get("sel")).toBe("bafkreiabc");
  });
  it("Map hands closeDrawer: askNow to clearQuestion (source rule)", () => {
    expect(css("routes/Map/Map.tsx")).toMatch(/clearQuestion\(\{ closeDrawer: askNow \}\)/);
  });
});

describe("ring fit (item 6)", () => {
  const ring: [[number, number], [number, number]] = [
    [-97.8, 30.3],
    [-97.6, 30.5],
  ];
  it("unionBox keeps the whole ring when the results are a small cluster inside it", () => {
    expect(unionBox(ring, [{ lat: 30.4, lng: -97.7 }])).toEqual(ring);
  });
  it("unionBox widens to results outside the ring", () => {
    expect(unionBox(ring, [{ lat: 30.6, lng: -97.5 }])).toEqual([
      [-97.8, 30.3],
      [-97.5, 30.6],
    ]);
  });
  it("CrmMap fits results together with the ring, and refits the ring on a radius change", () => {
    const source = css("components/Map/CrmMap.tsx");
    expect(source).toMatch(/unionBox\(/);
    expect(source).toMatch(/lastFitRadiusRef/);
  });
});

describe("Matches pane side padding (responsive review)", () => {
  it("the wide Matches pane adds no side padding of its own: the list's 16 px puts the card where a filter result sits", () => {
    const source = css("routes/Map/Map.module.css");
    const block = /\.matchesPane \{[^}]*\}/.exec(source)?.[0] ?? "";
    expect(block).toMatch(/padding: 0 0 var\(--space-4\);/);
    expect(block).not.toMatch(/padding: 0 var\(--space-4\) /);
  });
});

describe("Matches tab geometry (responsive review)", () => {
  it("the Matches tab panel bleeds out of the page padding so its list sits like the filter results", () => {
    expect(css("routes/Ask/AskPanel.tsx")).toMatch(/data-tab=\{tab\}/);
    expect(css("routes/Ask/Ask.module.css")).toMatch(
      /\.answer\[data-tab="matches"\] \{\s*margin-inline: calc\(-1 \* var\(--space-4\)\);/,
    );
  });
});
