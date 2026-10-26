// The map's mode (`mode=map|filters|ai`) and the agent's question (`q`) in the URL, beside the
// centre, radius, filters, view and triage keys: reload, back and a shared link reopen the same
// state (Ask in the map, CRM-HANDOFF section 4.7 and the URL table).
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import {
  newThreadId,
  parseMapMode,
  patchMapMode,
  readThreadId,
  useMapMode,
} from "../../src/routes/Map/mapMode.js";

const params = (s: string): URLSearchParams => new URLSearchParams(s);

describe("parseMapMode", () => {
  it("defaults to the map with no question", () => {
    expect(parseMapMode(params(""))).toEqual({ mode: "map", q: null });
  });

  it("reads mode and q", () => {
    expect(parseMapMode(params("mode=ai&q=roofs%20older%20than%2015"))).toEqual({
      mode: "ai",
      q: "roofs older than 15",
    });
    expect(parseMapMode(params("mode=filters")).mode).toBe("filters");
  });

  it("ignores an unknown mode and an empty question", () => {
    expect(parseMapMode(params("mode=wat&q=%20%20"))).toEqual({ mode: "map", q: null });
  });
});

describe("patchMapMode", () => {
  it("sets the mode, keeps every other key, and leaves the default out", () => {
    const base = params("lat=30.4&lng=-97.6&r=5&view=list&roof=15");
    const ai = patchMapMode(base, { mode: "ai" });
    expect(ai.get("mode")).toBe("ai");
    for (const key of ["lat", "lng", "r", "view", "roof"]) expect(ai.get(key)).toBe(base.get(key));
    expect(patchMapMode(ai, { mode: "map" }).has("mode")).toBe(false);
  });

  it("sets and clears q", () => {
    const withQ = patchMapMode(params("mode=ai"), { q: "hello" });
    expect(withQ.get("q")).toBe("hello");
    expect(patchMapMode(withQ, { q: null }).has("q")).toBe(false);
  });

  it("leaving AI mode drops the question with it", () => {
    const left = patchMapMode(params("mode=ai&q=hello"), { mode: "map" });
    expect(left.has("q")).toBe(false);
  });
});

describe("useMapMode", () => {
  function wrapper(url: string) {
    return ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: [url] }, children);
  }

  it("setMode writes the URL and keeps the rest", () => {
    const { result } = renderHook(() => ({ mode: useMapMode(), loc: useLocation() }), {
      wrapper: wrapper("/?lat=30.4&lng=-97.6&r=5"),
    });
    expect(result.current.mode.mode).toBe("map");
    act(() => result.current.mode.setMode("ai"));
    expect(result.current.mode.mode).toBe("ai");
    expect(result.current.loc.search).toContain("lat=30.4");
    act(() => result.current.mode.setMode("map"));
    expect(result.current.loc.search).not.toContain("mode");
  });
});

describe("the map's agent thread", () => {
  it("is kept for the browser session and replaced on request", () => {
    sessionStorage.clear();
    const first = readThreadId();
    expect(first.length).toBeGreaterThan(8);
    expect(readThreadId()).toBe(first);
    const next = newThreadId();
    expect(next).not.toBe(first);
    expect(readThreadId()).toBe(next);
  });
});
