// Recent and saved Map searches: storage rules (cap, dedupe, order, version, corrupt data, blocked
// storage).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RECENT,
  MAX_SAVED,
  RECENT_KEY,
  SAVED_KEY,
  clearRecent,
  defaultSavedName,
  loadRecent,
  loadSaved,
  pushRecent,
  pushSaved,
  recentToOption,
  removeRecent,
  removeSaved,
  resetSearchMemory,
  savedId,
  toRecent,
  viewDetail,
  type RecentSearch,
} from "../../src/routes/Map/recentSearches";

const place = (n: number): RecentSearch => ({
  id: `place-${String(n)}`,
  kind: "place",
  label: `Place ${String(n)}`,
  point: { lat: 30 + n / 100, lng: -97 },
});

beforeEach(() => {
  localStorage.clear();
  resetSearchMemory();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function blockStorage(): void {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
}

describe("recent searches", () => {
  it("uses versioned keys", () => {
    expect(RECENT_KEY).toMatch(/\.v1$/);
    expect(SAVED_KEY).toMatch(/\.v1$/);
    pushRecent(place(1));
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null") as { v: number };
    expect(stored.v).toBe(1);
  });

  it("starts empty", () => {
    expect(loadRecent()).toEqual([]);
  });

  it("keeps newest first", () => {
    pushRecent(place(1));
    pushRecent(place(2));
    expect(loadRecent().map((e) => e.id)).toEqual(["place-2", "place-1"]);
  });

  it("de-duplicates by id and moves the repeat to the top", () => {
    pushRecent(place(1));
    pushRecent(place(2));
    const next = pushRecent(place(1));
    expect(next.map((e) => e.id)).toEqual(["place-1", "place-2"]);
    expect(loadRecent()).toHaveLength(2);
  });

  it("caps the list at 8, dropping the oldest", () => {
    for (let i = 1; i <= MAX_RECENT + 3; i += 1) pushRecent(place(i));
    const ids = loadRecent().map((e) => e.id);
    expect(ids).toHaveLength(MAX_RECENT);
    expect(ids[0]).toBe(`place-${String(MAX_RECENT + 3)}`);
    expect(ids).not.toContain("place-1");
  });

  it("removes one entry and clears all", () => {
    pushRecent(place(1));
    pushRecent(place(2));
    expect(removeRecent("place-1").map((e) => e.id)).toEqual(["place-2"]);
    expect(removeRecent("missing")).toHaveLength(1);
    expect(clearRecent()).toEqual([]);
    expect(loadRecent()).toEqual([]);
  });

  it("reads corrupt JSON as empty and recovers on the next write", () => {
    localStorage.setItem(RECENT_KEY, "{not json");
    expect(loadRecent()).toEqual([]);
    pushRecent(place(1));
    expect(loadRecent()).toHaveLength(1);
  });

  it("ignores another version or a wrong shape", () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ v: 2, items: [place(1)] }));
    expect(loadRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify([place(1)]));
    expect(loadRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify({ v: 1, items: "x" }));
    expect(loadRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, "null");
    expect(loadRecent()).toEqual([]);
  });

  it("drops invalid entries and keeps the valid ones, capped on load", () => {
    const many = Array.from({ length: 12 }, (_, i) => place(i + 1));
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify({
        v: 1,
        items: [
          null,
          { id: "x", kind: "address", label: "x" },
          { id: "p", kind: "place", label: "no point" },
          { id: "t", kind: "tcad", label: "no lookup" },
          { id: "", kind: "tcad", label: "t", lookup: "1" },
          ...many,
        ],
      }),
    );
    const loaded = loadRecent();
    expect(loaded).toHaveLength(MAX_RECENT);
    expect(loaded[0]?.id).toBe("place-1");
  });

  it("works with storage blocked, for the page lifetime", () => {
    blockStorage();
    expect(loadRecent()).toEqual([]);
    expect(() => pushRecent(place(1))).not.toThrow();
    pushRecent(place(2));
    expect(loadRecent().map((e) => e.id)).toEqual(["place-2", "place-1"]);
    expect(removeRecent("place-2").map((e) => e.id)).toEqual(["place-1"]);
    expect(clearRecent()).toEqual([]);
    expect(loadRecent()).toEqual([]);
  });

  it("works when only writing is blocked (quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    pushRecent(place(1));
    expect(loadRecent().map((e) => e.id)).toEqual(["place-1"]);
  });

  it("round-trips permit and TCAD entries", () => {
    pushRecent({ id: "permit-1", kind: "permit", label: "Permit 1", lookup: "2026-1 BP" });
    pushRecent({ id: "tcad-1", kind: "tcad", label: "TCAD 1", lookup: "138273", detail: "d" });
    const [tcad, permit] = loadRecent();
    expect(tcad?.lookup).toBe("138273");
    expect(tcad?.detail).toBe("d");
    expect(permit?.lookup).toBe("2026-1 BP");
  });
});

describe("recent <-> option", () => {
  it("stores runnable options and rejects the rest", () => {
    expect(
      toRecent({ id: "place-1", kind: "place", label: "A", point: { lat: 30, lng: -97 } }),
    ).toMatchObject({ id: "place-1", kind: "place" });
    expect(toRecent({ id: "permit-1", kind: "permit", label: "P", lookup: "2026-1 BP" })).not.toBe(
      null,
    );
    expect(toRecent({ id: "a", kind: "address", label: "1 Main St", disabled: true })).toBeNull();
    expect(toRecent({ id: "p", kind: "place", label: "no point" })).toBeNull();
  });

  it("turns an entry back into the option it came from", () => {
    const entry = place(3);
    expect(recentToOption(entry)).toEqual({
      id: "place-3",
      kind: "place",
      label: "Place 3",
      point: entry.point,
    });
    const tcad: RecentSearch = { id: "t", kind: "tcad", label: "T", lookup: "9", detail: "d" };
    expect(recentToOption(tcad)).toEqual(tcad);
  });
});

describe("saved searches", () => {
  const view = { lat: 30.4, lng: -97.45, radiusMi: 3, roofAgeMinYears: 15 };

  it("names a pin with centre, radius and roof filter", () => {
    expect(defaultSavedName(view)).toBe("Pin 30.40, -97.45 · 3 mi · roof ≥ 15");
    expect(defaultSavedName({ ...view, roofAgeMinYears: undefined })).toBe(
      "Pin 30.40, -97.45 · 3 mi",
    );
  });

  it("prefers a place label when given", () => {
    expect(defaultSavedName(view, "  Pflugerville ")).toBe("Pflugerville");
    expect(defaultSavedName(view, "   ")).toMatch(/^Pin /);
  });

  it("describes the radius and roof filter", () => {
    expect(viewDetail(view)).toBe("3 mi · roof ≥ 15");
    expect(viewDetail({ ...view, roofAgeMinYears: undefined })).toBe("3 mi");
  });

  it("saves newest first and de-duplicates the same view", () => {
    pushSaved(view, "A");
    pushSaved({ ...view, radiusMi: 5 }, "B");
    const next = pushSaved(view, "A again");
    expect(next.map((s) => s.name)).toEqual(["A again", "B"]);
    expect(savedId(view)).not.toBe(savedId({ ...view, roofAgeMinYears: undefined }));
  });

  it("keeps at most 10, dropping the oldest", () => {
    for (let i = 0; i < MAX_SAVED + 2; i += 1) {
      pushSaved({ ...view, lat: 30 + i / 10 }, `S${String(i)}`);
    }
    const saved = loadSaved();
    expect(saved).toHaveLength(MAX_SAVED);
    expect(saved[0]?.name).toBe(`S${String(MAX_SAVED + 1)}`);
    expect(saved.map((s) => s.name)).not.toContain("S0");
  });

  it("stores a view without a roof filter without the field", () => {
    pushSaved({ lat: 30.4, lng: -97.45, radiusMi: 5 }, "No roof");
    const [one] = loadSaved();
    expect(one).toBeDefined();
    expect("roofAgeMinYears" in (one ?? {})).toBe(false);
  });

  it("removes an entry", () => {
    const [first] = pushSaved(view, "A");
    expect(removeSaved(first?.id ?? "")).toEqual([]);
    expect(loadSaved()).toEqual([]);
  });

  it("drops entries with impossible coordinates, radius or roof age", () => {
    const good = { id: "g", name: "G", lat: 30, lng: -97, radiusMi: 5 };
    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({
        v: 1,
        items: [
          good,
          { ...good, id: "1", lat: 91 },
          { ...good, id: "2", lng: -181 },
          { ...good, id: "3", radiusMi: 0 },
          { ...good, id: "4", roofAgeMinYears: -1 },
          { ...good, id: "5", roofAgeMinYears: 1.5 },
          { ...good, id: "6", roofAgeMinYears: "15" },
          { ...good, id: "7", name: "" },
          "junk",
        ],
      }),
    );
    expect(loadSaved().map((s) => s.id)).toEqual(["g"]);
  });

  it("handles corrupt JSON, other versions and blocked storage", () => {
    localStorage.setItem(SAVED_KEY, "oops");
    expect(loadSaved()).toEqual([]);
    localStorage.setItem(SAVED_KEY, JSON.stringify({ v: 9, items: [] }));
    expect(loadSaved()).toEqual([]);
    localStorage.clear();
    blockStorage();
    pushSaved(view, "Blocked");
    expect(loadSaved().map((s) => s.name)).toEqual(["Blocked"]);
  });
});
