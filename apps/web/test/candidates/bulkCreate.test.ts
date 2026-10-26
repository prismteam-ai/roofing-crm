import { describe, expect, it } from "vitest";
import {
  bulkSummary,
  MAX_BULK_CONCURRENCY,
  runBulkCreateMany,
  runBulkCreate,
} from "../../src/routes/Map/Candidates/bulkCreate";

const dup = (e: unknown): boolean => (e as { dup?: boolean }).dup === true;
const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${String(i)}`, input: i }));

describe("runBulkCreate", () => {
  it("never has more than two creates in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await runBulkCreate(
      items(7),
      async (i) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return i;
      },
      dup,
      10, // a caller asking for more is capped
    );
    expect(MAX_BULK_CONCURRENCY).toBe(2);
    expect(peak).toBe(2);
    expect(out.created).toHaveLength(7);
  });

  it("counts ALREADY_EXISTS as already a lead, other errors as failed", async () => {
    const out = await runBulkCreate(
      items(4),
      async (i) => {
        if (i === 1) throw { dup: true };
        if (i === 2) throw new Error("boom");
        return i;
      },
      dup,
    );
    expect(out.created.map((c) => c.id)).toEqual(["p0", "p3"]);
    expect(out.already).toEqual(["p1"]);
    expect(out.failed).toEqual(["p2"]);
  });

  it("reports progress and returns in the caller's order", async () => {
    const seen: number[] = [];
    const out = await runBulkCreate(
      items(3),
      async (i) => {
        await new Promise((r) => setTimeout(r, 3 - i));
        return i;
      },
      dup,
      2,
      (done) => seen.push(done),
    );
    expect(seen).toEqual([1, 2, 3]);
    expect(out.created.map((c) => c.id)).toEqual(["p0", "p1", "p2"]);
  });

  it("handles an empty selection", async () => {
    const out = await runBulkCreate([], async () => 1, dup);
    expect(out).toEqual({ created: [], already: [], failed: [] });
  });
});

describe("bulkSummary", () => {
  it("matches the Created board copy", () => {
    expect(bulkSummary(2, 1, 0)).toBe("2 leads created · 1 already a lead");
    expect(bulkSummary(1, 0, 0)).toBe("1 lead created");
    expect(bulkSummary(0, 2, 1)).toBe("0 leads created · 2 already leads · 1 not saved");
  });
});

describe("runBulkCreateMany", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${String(i)}`,
      input: { fips: "48453", requestIdentifier: String(i) },
    }));
  const key = (i: number) => `48453:tcad:${String(i)}`;

  it("sends batches of at most 25, one at a time, and maps the answer back to row ids", async () => {
    const sizes: number[] = [];
    let live = 0;
    let peak = 0;
    const out = await runBulkCreateMany(rows(60), async (inputs) => {
      live += 1;
      peak = Math.max(peak, live);
      sizes.push(inputs.length);
      await new Promise((r) => setTimeout(r, 2));
      live -= 1;
      return {
        created: inputs
          .filter((_, i) => i % 3 === 0)
          .map((x) => ({
            leadKey: `${x.fips}:tcad:${x.requestIdentifier}`,
            leadId: `L${x.requestIdentifier}`,
          })),
        already: inputs
          .filter((_, i) => i % 3 === 1)
          .map((x) => `${x.fips}:tcad:${x.requestIdentifier}`),
        failed: inputs
          .filter((_, i) => i % 3 === 2)
          .map((x) => ({ leadKey: `${x.fips}:tcad:${x.requestIdentifier}`, code: "X" })),
      };
    });
    expect(sizes).toEqual([25, 25, 10]);
    expect(peak).toBe(1);
    expect(out.created.map((c) => c.id)).toEqual([
      "p0",
      "p3",
      "p6",
      ...out.created.slice(3).map((c) => c.id),
    ]);
    expect(out.created[0]?.result).toEqual({ leadKey: key(0), leadId: "L0" });
    expect(out.created.length + out.already.length + out.failed.length).toBe(60);
  });

  it("a batch whose call fails marks only that batch failed; progress is reported", async () => {
    const progress: number[] = [];
    let call = 0;
    const out = await runBulkCreateMany(
      rows(30),
      async (inputs) => {
        call += 1;
        if (call === 1) throw new Error("offline");
        return {
          created: inputs.map((x) => ({
            leadKey: `${x.fips}:tcad:${x.requestIdentifier}`,
            leadId: "L",
          })),
          already: [],
          failed: [],
        };
      },
      (done) => progress.push(done),
    );
    expect(out.failed).toHaveLength(25);
    expect(out.created).toHaveLength(5);
    expect(progress).toEqual([25, 30]);
  });
});
