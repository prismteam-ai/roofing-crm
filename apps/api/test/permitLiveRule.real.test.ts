// Opt-in (CRM_REAL_INDEX_DIR = a folder holding the served crm_permit.parquet, as search.perf):
// on the real Run 3.1 index, a permit is live (open or stalled) exactly when it has no final date,
// which is the same as having a published openDays. Task A classes a permit with a final date and
// no status as "stalled", so the class alone over-counts (722 live stalled of 1,674 stalled; 73
// live open of 80 on the served copy). The rule is asserted, not the magic numbers.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";

const DIR = process.env["CRM_REAL_INDEX_DIR"] ?? "";
const FILE = join(DIR, "crm_permit.parquet");
const enabled = DIR !== "" && existsSync(FILE);

describe.skipIf(!enabled)("live permit rule on the served Parquet", () => {
  it("no final date and a published openDays are the same condition for open and stalled", async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const connection = await instance.connect();
    const rows = (
      await connection.runAndReadAll(
        `SELECT count(*) FILTER (WHERE ("finalDate" IS NULL) <> ("openDays" IS NOT NULL))::INTEGER AS mismatched,
                count(*) FILTER (WHERE "statusClass" = 'stalled' AND "finalDate" IS NOT NULL)::INTEGER AS finaledStalled,
                count(*) FILTER (WHERE "statusClass" = 'stalled' AND "finalDate" IS NULL)::INTEGER AS liveStalled,
                count(*) FILTER (WHERE "statusClass" = 'open' AND "finalDate" IS NULL)::INTEGER AS liveOpen
         FROM read_parquet('${FILE}') WHERE "statusClass" IN ('open', 'stalled')`,
      )
    ).getRowObjectsJS() as unknown as {
      mismatched: number;
      finaledStalled: number;
      liveStalled: number;
      liveOpen: number;
    }[];
    const row = rows[0];
    expect(row?.mismatched).toBe(0);
    expect(row?.finaledStalled).toBeGreaterThan(0);
    expect(row?.liveStalled).toBeGreaterThan(0);
    expect(row?.liveOpen).toBeGreaterThan(0);
  });
});
