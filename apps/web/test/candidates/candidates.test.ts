import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  candidateSubtitle,
  candidateTitle,
  emptyStateCopy,
  hasOwnerFilter,
  OUT_OF_AREA_UNPUBLISHED,
  propertiesSearchInput,
  listedCount,
  compassBearing,
  defaultSort,
  leadsByRequestIdentifier,
  lowerRoofPreset,
  mainSignalText,
  permitNote,
  permitQueryInput,
  permitSignalText,
  sortCandidates,
  whyChips,
} from "../../src/routes/Map/Candidates/candidates";
import { candidates, FILTERS, must, permit, property } from "./fixtures";

describe("compassBearing", () => {
  const c = { lat: 30.4, lng: -97.6 };
  it("names the eight directions", () => {
    expect(compassBearing(c, { lat: 30.5, lng: -97.6 })).toBe("N");
    expect(compassBearing(c, { lat: 30.3, lng: -97.6 })).toBe("S");
    expect(compassBearing(c, { lat: 30.4, lng: -97.5 })).toBe("E");
    expect(compassBearing(c, { lat: 30.4, lng: -97.7 })).toBe("W");
  });
});

describe("leadsByRequestIdentifier", () => {
  it("keys leads by the TCAD request identifier inside the lead key", () => {
    const map = leadsByRequestIdentifier([
      { leadKey: "48453:tcad:0201885121", leadId: "L1", status: "new" },
    ]);
    expect(map.get("0201885121")?.leadId).toBe("L1");
  });
});

describe("buildCandidates", () => {
  it("marks properties that are already leads (E-52)", () => {
    const list = candidates(
      [property(1), property(2)],
      [],
      [{ leadKey: "48453:tcad:0201885122", leadId: "L9", status: "contacted" }],
    );
    expect(list[0]?.lead).toBeNull();
    expect(list[1]?.lead?.status).toBe("contacted");
  });

  it("picks the longest-open open-or-stalled permit as the main signal", () => {
    const list = candidates(
      [property(1)],
      [
        permit(1, { permitCid: "a".repeat(59), openDays: 900, statusClass: "open" }),
        permit(1, { permitCid: "b".repeat(59), openDays: 2300, statusClass: "stalled" }),
        permit(1, { permitCid: "c".repeat(59), openDays: 5000, statusClass: "closed" }),
      ],
    );
    expect(list[0]?.mainPermit?.openDays).toBe(2300);
  });

  it("keeps every property the server returned; the permit filter only picks the permits shown (F-1)", () => {
    const filters = { ...FILTERS, permitStatus: "stalled" as const };
    const list = candidates([property(1), property(2)], [permit(1)], [], filters);
    // The server already applied the filter to every property in range, so a property whose
    // permit is past the permits page is still listed, just without that permit.
    expect(list).toHaveLength(2);
    expect(list[1]?.permits).toEqual([]);
    expect(defaultSort(filters)).toBe("open");
  });

  it("Open keeps open and stalled permits, Stalled only stalled", () => {
    const stalled = permit(1, { permitCid: "d".repeat(59), statusClass: "stalled", openDays: 900 });
    const open = permit(1, { statusClass: "open", openDays: 500 });
    const closed = permit(1, { permitCid: "e".repeat(59), statusClass: "closed", openDays: 9000 });
    const all = [stalled, open, closed];
    const openList = candidates([property(1)], all, [], { ...FILTERS, permitStatus: "open" });
    expect(openList[0]?.permits.map((p) => p.statusClass).sort()).toEqual(["open", "stalled"]);
    const stalledList = candidates([property(1)], all, [], { ...FILTERS, permitStatus: "stalled" });
    expect(stalledList[0]?.permits.map((p) => p.statusClass)).toEqual(["stalled"]);
  });

  it("applies permit open years to permits, not to roofs", () => {
    const filters = { ...FILTERS, permitOpenYrs: 7 };
    const list = candidates([property(1)], [permit(1, { openDays: 2300 })], [], filters);
    expect(list[0]?.permits).toHaveLength(0); // 2300 days ≈ 6.3 yrs
  });

  it("keeps a null location as null distance, never 0", () => {
    const list = candidates([property(1, { latitude: null, longitude: null })]);
    expect(list[0]?.distanceMi).toBeNull();
    expect(list[0]?.bearing).toBeNull();
  });

  it("computes real distance and bearing from the centre", () => {
    const list = buildCandidates([property(1)], [], new Map(), {
      ...FILTERS,
      center: { lat: 30.4, lng: -97.6 },
    });
    expect(list[0]?.distanceMi).toBeGreaterThan(0.5);
    expect(list[0]?.bearing).toMatch(/^(N|NE|NW)$/);
  });
});

describe("sortCandidates", () => {
  it("sorts by roof age oldest first and puts unknown roofs last", () => {
    const list = candidates([
      property(1, { roofAgeYears: 17 }),
      property(2, { roofAgeYears: null }),
      property(3, { roofAgeYears: 30 }),
    ]);
    const ids = sortCandidates(list, "roof").map((c) => c.property.roofAgeYears);
    expect(ids).toEqual([30, 17, null]);
  });

  it("sorts by permit open longest, then nearest", () => {
    const list = candidates(
      [property(1), property(2)],
      [permit(1, { openDays: 2000 }), permit(2, { openDays: 3000 })],
    );
    expect(sortCandidates(list, "open")[0]?.property.requestIdentifier).toBe("0201885122");
    const near = sortCandidates(list, "near");
    expect(near[0]?.distanceMi ?? 99).toBeLessThanOrEqual(near[1]?.distanceMi ?? 0);
  });
});

describe("signal text", () => {
  it("labels stalled as derived (design-review-log row 6)", () => {
    expect(permitSignalText({ statusClass: "stalled", openDays: 2340 })).toBe(
      "Stalled 6.4 yrs · derived: no status in source",
    );
    expect(permitSignalText({ statusClass: "open", openDays: 1400 })).toBe("Open 3.8 yrs");
  });

  it("says the open duration is not published instead of inventing it", () => {
    expect(permitSignalText({ statusClass: "open", openDays: null })).toContain("not published");
  });

  it("main signal is the permit when there is one, else the roof", () => {
    const [withPermit] = candidates([property(1)], [permit(1)]);
    const [roofOnly] = candidates([property(1)]);
    expect(mainSignalText(must(withPermit))).toMatch(/^Permit Stalled 6\.3 yrs/);
    expect(mainSignalText(must(roofOnly))).toBe("Roof 16 yrs · High confidence");
  });

  it("builds Why is this a lead? from what the row meets", () => {
    const [c] = candidates([property(1)], [permit(1)]);
    const chips = whyChips(must(c), FILTERS);
    expect(chips[0]).toBe("Roof 16 yrs ≥ 15 · High confidence");
    expect(chips.some((x) => x.startsWith("Stalled"))).toBe(true);
    expect(chips.at(-1)).toMatch(/mi ≤ 5 mi$/);
  });
});

describe("lowerRoofPreset", () => {
  it("steps down to the next preset and stops at the lowest", () => {
    expect(lowerRoofPreset(15)).toBe(13);
    expect(lowerRoofPreset(10)).toBeNull();
    expect(lowerRoofPreset(undefined)).toBeNull();
  });
});

describe("permitQueryInput (the server filters the permits)", () => {
  const center = { lat: 30.4, lng: -97.6 };

  it("with no permit filter asks for every permit in range, longest open first", () => {
    expect(permitQueryInput(center, 5, "any", undefined)).toEqual({
      center,
      radiusMi: 5,
      sort: "openDays",
    });
  });

  it("passes the status and the open years as the server's statusClass and openDaysMin", () => {
    expect(permitQueryInput(center, 5, "open", undefined)).toMatchObject({
      statusClass: ["open", "stalled"],
    });
    expect(permitQueryInput(center, 5, "stalled", 5)).toMatchObject({
      statusClass: ["stalled"],
      openDaysMin: 1827,
    });
    expect(permitQueryInput(center, 2.5, "any", 1)).toEqual({
      center,
      radiusMi: 2.5,
      sort: "openDays",
      openDaysMin: 366,
    });
  });

  it("has no centre without a ring", () => {
    expect(permitQueryInput(null, 5, "any", undefined).center).toEqual({ lat: 0, lng: 0 });
  });
});

describe("permitNote (a clipped permit page is never the whole set)", () => {
  it("is empty when every permit came back", () => {
    expect(permitNote({ total: 40, truncated: false })).toBeNull();
    expect(permitNote(undefined)).toBeNull();
  });

  it("says how many came back of the server total, and what to do", () => {
    expect(permitNote({ total: 12345, truncated: true, shown: 500 })).toBe(
      "Showing the 500 longest-open of 12,345 permits in range; narrow the radius or filters.",
    );
  });
});

describe("emptyStateCopy (names what was filtered)", () => {
  const base = { center: { lat: 30.4, lng: -97.6 }, radiusMi: 5 };

  it("roof only: roofs", () => {
    const c = emptyStateCopy({ ...base, roofAgeMinYears: 15 });
    expect(c.title).toBe("No roofs match within 5 mi.");
    expect(c.text).toBe("Try a bigger radius or a lower roof age.");
    expect(c.permitFilter).toBe(false);
  });

  it("permit only (open, 5+ yrs): names the permit filter, not roofs, and says why", () => {
    const c = emptyStateCopy({ ...base, permitStatus: "open", permitOpenYrs: 5 });
    expect(c.title).toBe("No properties with an open permit (open 5+ yrs) within 5 mi.");
    expect(c.title).not.toMatch(/roof/i);
    expect(c.text).toContain("Open includes stalled permits; few properties have one");
    expect(c.text).toContain("Try a bigger radius or relax the permit filter.");
    expect(c.permitFilter).toBe(true);
  });

  it("permit only without a status: no open-status reason", () => {
    const c = emptyStateCopy({ ...base, permitOpenYrs: 10 });
    expect(c.title).toBe("No properties with a permit (open 10+ yrs) within 5 mi.");
    expect(c.text).not.toMatch(/no open status/);
  });

  it("a stalled permit", () => {
    expect(emptyStateCopy({ ...base, permitStatus: "stalled" }).title).toBe(
      "No properties with a stalled permit within 5 mi.",
    );
  });

  it("both: names both", () => {
    const c = emptyStateCopy({
      ...base,
      roofAgeMinYears: 20,
      permitStatus: "open",
      permitOpenYrs: 5,
    });
    expect(c.title).toBe("No roofs of 20+ yrs have an open permit (open 5+ yrs) within 5 mi.");
    expect(c.text).toContain("a lower roof age");
    expect(c.text).toContain("permit filter");
  });
});

describe("listedCount (the header equals the rows)", () => {
  it("without a permit filter it is the server's total of properties", () => {
    expect(listedCount({ center: null, radiusMi: 5 }, 23775, 100)).toBe(23775);
  });

  it("with a permit filter it is still the server's total: the server applied the filter first (F-1)", () => {
    expect(listedCount({ center: null, radiusMi: 5, permitStatus: "open" }, 970, 100)).toBe(970);
    expect(listedCount({ center: null, radiusMi: 5, permitOpenYrs: 5 }, 12, 12)).toBe(12);
  });
});

describe("owner filters in the candidate model", () => {
  const base = { center: { lat: 30.4, lng: -97.6 }, radiusMi: 5 };

  it("hasOwnerFilter is true for tenure or out-of-area, false otherwise", () => {
    expect(hasOwnerFilter(base)).toBe(false);
    expect(hasOwnerFilter({ ...base, outOfArea: false })).toBe(false);
    expect(hasOwnerFilter({ ...base, tenureYearsMin: 0 })).toBe(true);
    expect(hasOwnerFilter({ ...base, outOfArea: true })).toBe(true);
  });

  it("emptyStateCopy names a tenure filter", () => {
    const c = emptyStateCopy({ ...base, tenureYearsMin: 10 });
    expect(c.title).toBe("No properties with tenure 10+ yrs within 5 mi.");
    expect(c.text).toBe("Try a bigger radius or a lower tenure.");
    expect(c.ownerFilter).toBe(true);
    expect(c.permitFilter).toBe(false);
  });

  it("emptyStateCopy gives the honest out-of-area reason", () => {
    const c = emptyStateCopy({ ...base, outOfArea: true });
    expect(c.title).toContain("out-of-area owners");
    expect(c.text).toBe(
      "Out-of-area compares the owner's mailing ZIP with the county; owners with no mailing ZIP on record are not matched.",
    );
    expect(c.text).toBe(OUT_OF_AREA_UNPUBLISHED);
  });

  it("emptyStateCopy keeps the permit wording and adds the owner filter", () => {
    const c = emptyStateCopy({ ...base, permitStatus: "stalled", tenureYearsMin: 5 });
    expect(c.title).toBe("No properties with a stalled permit within 5 mi, with tenure 5+ yrs.");
    expect(c.permitFilter).toBe(true);
    expect(c.ownerFilter).toBe(true);
  });

  it("a server-side owner filter does not change the listed count", () => {
    expect(listedCount({ ...base, tenureYearsMin: 10 }, 40, 12)).toBe(40);
  });

  it("propertiesSearchInput carries the permit filter to the server (Open = open and stalled)", () => {
    const center = { lat: 30.4, lng: -97.6 };
    const input = propertiesSearchInput(center, 5, 25, undefined, false, "open", 3);
    expect(input).toMatchObject({
      permitStatusClass: ["open", "stalled"],
      permitOpenDaysMin: 1096,
    });
    expect(
      propertiesSearchInput(center, 5, 25, undefined, false, "stalled", undefined),
    ).toMatchObject({
      permitStatusClass: ["stalled"],
    });
    const none = propertiesSearchInput(center, 5, 25, undefined, false, "any", undefined);
    expect(none).not.toHaveProperty("permitStatusClass");
    expect(none).not.toHaveProperty("permitOpenDaysMin");
  });

  it("propertiesSearchInput carries owner keys only when on", () => {
    const center = { lat: 30.4, lng: -97.6 };
    expect(propertiesSearchInput(center, 5, 15, undefined, false)).toEqual({
      center,
      radiusMi: 5,
      roofAgeMinYears: 15,
    });
    expect(propertiesSearchInput(center, 5, undefined, 10, true)).toEqual({
      center,
      radiusMi: 5,
      roofAgeMinYears: undefined,
      tenureYearsMin: 10,
      outOfArea: true,
    });
  });
});

describe("candidate title and subtitle", () => {
  it("title is the street address and the subtitle the TCAD id", () => {
    const p = property(1, { unnormalizedAddress: "100 MAIN ST, AUSTIN, TX 78701" });
    expect(candidateTitle(p)).toBe("100 MAIN ST, AUSTIN, TX 78701");
    expect(candidateSubtitle(p)).toMatch(/^TCAD 0201885121 · /);
    expect(candidateSubtitle(p)).not.toContain("not published");
  });

  it("falls back to the TCAD id and says why the address is missing", () => {
    const p = property(2, { unnormalizedAddress: null });
    expect(candidateTitle(p)).toBe(`TCAD ${p.requestIdentifier}`);
    expect(candidateSubtitle(p)).toContain("Address not published");
  });
});
