// Leads table cells (board CrmLeads768): what a row says about roof, main permit and last
// activity, from the snapshot `leads.list` returns, and the honest reason when it returns none.
import { describe, expect, it } from "vitest";
import {
  lastActivityCell,
  pageWindow,
  permitCell,
  roofCell,
  SIGNALS_NOT_SAVED,
  totalPages,
} from "../../src/routes/Leads/leadRowFacts";

const signals = {
  roofAgeYears: 23,
  roofAgeBasis: "permit",
  openPermitId: "2003-012345 BP",
  openDays: 2336,
  capturedAt: "2026-10-20T00:00:00Z",
};

describe("roofCell", () => {
  it("says years and the basis in words", () => {
    expect(roofCell(signals)).toEqual({ main: "23 yrs", sub: "Last reroof permit" });
  });
  it("adds the confidence only when the snapshot stored it", () => {
    expect(roofCell({ ...signals, roofAgeConfidence: "high" } as never).sub).toBe(
      "Last reroof permit · High",
    );
  });
  it("humanizes a basis code it does not know, never shows the raw code", () => {
    expect(roofCell({ ...signals, roofAgeBasis: "some_new_code" }).sub).toBe("Some new code");
  });
  it("gives the reason when there is no snapshot, or the snapshot has no roof age", () => {
    expect(roofCell(null)).toEqual({ main: SIGNALS_NOT_SAVED, reason: true });
    expect(roofCell(undefined)).toEqual({ main: SIGNALS_NOT_SAVED, reason: true });
    expect(roofCell({ capturedAt: "x" })).toEqual({
      main: "Roof age not published for this property",
      reason: true,
    });
  });
});

describe("permitCell", () => {
  it("says Open n days with the years and the permit id", () => {
    expect(permitCell(signals)).toEqual({
      main: "Open 2336 days",
      sub: "6.4 yrs · 2003-012345 BP",
    });
  });
  it("shows the contractor and a BBB rating only when stored", () => {
    const cell = permitCell({ ...signals, contractor: "Acme Roofing", bbbRating: "A+" });
    expect(cell.sub).toBe("6.4 yrs · 2003-012345 BP");
    expect(cell.extra).toEqual(["Acme Roofing", "BBB A+"]);
    expect(permitCell(signals).extra).toBeUndefined();
  });
  it("reads the permit class only when the snapshot stored one (stalled is derived)", () => {
    const cell = permitCell({ ...signals, openPermitStatus: "stalled" } as never);
    expect(cell.main).toBe("Stalled · derived: no status in source");
    expect(cell.sub).toBe("Open 2336 days · 6.4 yrs · 2003-012345 BP");
  });
  it("gives the reason when there is no snapshot or no open permit at creation", () => {
    expect(permitCell(null)).toEqual({ main: SIGNALS_NOT_SAVED, reason: true });
    expect(permitCell({ capturedAt: "x" })).toEqual({
      main: "No open permit when the lead was created",
      reason: true,
    });
  });
});

describe("lastActivityCell", () => {
  const at = "2026-10-20T15:02:00Z";
  it("a note shows the date and the excerpt", () => {
    expect(lastActivityCell({ at, kind: "note", excerpt: "Left a door hanger." }, "x")).toEqual({
      at,
      created: false,
      text: "Note: Left a door hanger.",
    });
  });
  it("a status or assignee change says so when there is no excerpt", () => {
    expect(lastActivityCell({ at, kind: "status" }, "x").text).toBe("Status changed");
    expect(lastActivityCell({ at, kind: "assignee" }, "x").text).toBe("Assignee changed");
    expect(lastActivityCell({ at, kind: "other" }, "x").text).toBe("Updated");
  });
  it("Created when nothing else happened, and also when the list has no activity field", () => {
    expect(lastActivityCell({ at, kind: "created" }, "x")).toEqual({ at, created: true });
    expect(lastActivityCell(null, "2026-10-20T09:14:00Z")).toEqual({
      at: "2026-10-20T09:14:00Z",
      created: true,
    });
    expect(lastActivityCell(undefined, "2026-10-20T09:14:00Z").created).toBe(true);
  });
});

describe("pager arithmetic", () => {
  it("counts pages of 25 and caps at the 1,000 the list can reach", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25)).toBe(1);
    expect(totalPages(26)).toBe(2);
    expect(totalPages(5000)).toBe(40);
  });
  it("lists every page when few, and elides the middle when many", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 40)).toEqual([1, 2, "gap", 40]);
    expect(pageWindow(20, 40)).toEqual([1, "gap", 19, 20, 21, "gap", 40]);
    expect(pageWindow(40, 40)).toEqual([1, "gap", 39, 40]);
  });
});
