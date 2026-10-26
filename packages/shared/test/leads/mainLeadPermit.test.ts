import { describe, expect, it } from "vitest";
import {
  isFinaledPermit,
  isLivePermit,
  mainLeadPermit,
  permitStatusClassesFor,
} from "../../src/leads/mainLeadPermit.js";

describe("mainLeadPermit", () => {
  it("picks the open or stalled permit open longest", () => {
    const a = { id: "a", statusClass: "open", openDays: 100 };
    const b = { id: "b", statusClass: "stalled", openDays: 400 };
    const c = { id: "c", statusClass: "closed", openDays: 900 };
    expect(mainLeadPermit([a, c, b])).toBe(b);
  });

  it("ignores closed and unstatused permits, and returns null when none is live", () => {
    expect(mainLeadPermit([{ statusClass: "closed", openDays: 5 }])).toBeNull();
    expect(mainLeadPermit([{ statusClass: null, openDays: 5 }])).toBeNull();
    expect(mainLeadPermit([])).toBeNull();
    expect(mainLeadPermit(undefined)).toBeNull();
  });

  it("ranks a permit with no openDays last and keeps the first of equals", () => {
    const none = { id: "n", statusClass: "open", openDays: null };
    const x = { id: "x", statusClass: "open", openDays: 10 };
    const y = { id: "y", statusClass: "open", openDays: 10 };
    expect(mainLeadPermit([none, x, y])).toBe(x);
    expect(mainLeadPermit([none])).toBe(none);
  });
});

describe("permitStatusClassesFor (the one Open / Stalled / Any definition)", () => {
  it("Open is open or stalled, Stalled is stalled only, Any and unset send nothing", () => {
    expect(permitStatusClassesFor("open")).toEqual(["open", "stalled"]);
    expect(permitStatusClassesFor("stalled")).toEqual(["stalled"]);
    expect(permitStatusClassesFor("any")).toBeUndefined();
    expect(permitStatusClassesFor(undefined)).toBeUndefined();
  });

  it("agrees with isLivePermit for every status Open sends", () => {
    for (const statusClass of ["open", "stalled", "closed", null, undefined]) {
      const sent = permitStatusClassesFor("open") ?? [];
      expect(sent.includes(statusClass as "open")).toBe(isLivePermit({ statusClass }));
    }
  });
});

describe("a finaled permit is never live (Task A classes some finaled permits as stalled)", () => {
  it("excludes an open or stalled permit that has a finalDate", () => {
    expect(isFinaledPermit({ finalDate: "1991-04-15" })).toBe(true);
    expect(isFinaledPermit({ finalDate: null })).toBe(false);
    expect(isFinaledPermit({})).toBe(false);
    expect(isLivePermit({ statusClass: "stalled", finalDate: "1991-04-15", openDays: null })).toBe(
      false,
    );
    expect(isLivePermit({ statusClass: "open", finalDate: "2020-01-02" })).toBe(false);
    expect(isLivePermit({ statusClass: "stalled", finalDate: null, openDays: 900 })).toBe(true);
  });

  it("never picks a finaled permit as the main one", () => {
    const finaled = { id: "f", statusClass: "stalled", finalDate: "1991-04-15", openDays: 9000 };
    const live = { id: "l", statusClass: "open", finalDate: null, openDays: 10 };
    expect(mainLeadPermit([finaled, live])).toBe(live);
    expect(mainLeadPermit([finaled])).toBeNull();
  });
});
