// GAP-1: the agent's permit tools must hand the filter, the page and the exact total to the index
// (SQL) and never materialize more than 25 rows for the model. An exact permit-number lookup must
// not carry a radius scope.
import { describe, expect, it, vi } from "vitest";
import type {
  LeadIndex,
  PermitResult,
  SearchPermitsQuery,
} from "../../../src/adapters/duckDbParquet.js";
import { createAgentDispatch } from "../../../src/services/agent/tools.js";

function permit(i: number): PermitResult {
  return {
    propertyCid: `p${String(i)}`,
    permitCid: `c${String(i)}`,
    permitNumber: `N-${String(i)}`,
    statusClass: "open",
    openDays: 1000 - i,
  } as unknown as PermitResult;
}

function build() {
  const calls: SearchPermitsQuery[] = [];
  const searchPermitsPage = vi.fn((q: SearchPermitsQuery) => {
    calls.push(q);
    return Promise.resolve({
      rows: Array.from({ length: q.limit ?? 0 }, (_, i) => permit(i)),
      total: 4321,
    });
  });
  const searchProperties = vi.fn(() => Promise.reject(new Error("must not list properties")));
  const leadIndex = {
    indexInfo: () =>
      Promise.resolve({ manifestCid: "m", propertyCount: 1, permitCount: 1, promotedAt: "" }),
    searchPermitsPage,
    searchProperties,
  } as unknown as LeadIndex;
  const dispatch = createAgentDispatch({
    leadIndex,
    leadRepo: {} as never,
    placeResolver: {} as never,
  });
  return { dispatch, calls, searchProperties };
}

describe("agent permit tools (GAP-1)", () => {
  it("lookup by permit number carries no radius scope and never lists properties", async () => {
    const { dispatch, calls, searchProperties } = build();
    const out = await dispatch.searchPermits({
      lat: 30,
      lon: -97,
      radiusMi: 25,
      permitNumber: "1981-001776 BP",
    });
    expect(calls[0]?.permitNumber).toBe("1981-001776 BP");
    expect(calls[0]?.center).toBeUndefined();
    expect(calls[0]?.radiusMi).toBeUndefined();
    expect(searchProperties).not.toHaveBeenCalled();
    expect(out.permits.length).toBeLessThanOrEqual(25);
  });

  it("radius search pushes status and open-years into SQL, caps rows at 25 and reports the exact total", async () => {
    const { dispatch, calls } = build();
    const out = await dispatch.searchPermits({
      lat: 30,
      lon: -97,
      radiusMi: 5,
      statusClass: ["open", "stalled"],
      openYearsMin: 5,
    });
    expect(calls[0]).toMatchObject({
      statusClass: ["open", "stalled"],
      openDaysMinimum: 1827,
      radiusMi: 5,
      limit: 25,
    });
    expect(out.permits).toHaveLength(25);
    expect(out.matched).toBe(4321);
  });
});
