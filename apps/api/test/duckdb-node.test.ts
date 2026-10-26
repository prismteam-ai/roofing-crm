// Adapted from Oracle A-03 T072 (G-C2a) for B-02 (T040). The Oracle file tested Task A's own
// engine module (openDuckDb, extension directory, httpfs, ERR-18 cache settings, ERR-10 contract
// row schema); this repo vendors none of those, so those cases are dropped. What remains exercises
// this repo's real DuckDB wrapper, apps/api/src/engine/duckdb.ts (openParquetConnection), over
// Parquet files built in-test: the crm_property / crm_permit views the LeadIndex port reads, and
// the value shapes DuckDB node-api hands back. Nothing reaches S3 or the network.
//
// Known gaps, recorded here rather than hidden (see the report for T040):
//  - The wrapper returns node-api native values: BIGINT as bigint, DATE and TIMESTAMPTZ as Date.
//    CrmProperty and CrmPermit expect number and string, so the port has to convert them.
//  - The wrapper does not pin TimeZone to UTC (Oracle ADR-0001 does). Casts to DATE follow the
//    host's local zone until it does.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openParquetConnection, type DuckDBConnection } from "../src/engine/duckdb.js";

let dir: string;
let propertyFile: string;
let permitFile: string;
let connection: DuckDBConnection;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-duckdb-"));
  propertyFile = join(dir, "crm_property.parquet");
  permitFile = join(dir, "crm_permit.parquet");

  // Parquet is written by a scratch DuckDB instance. Only apps/*/src/engine may import
  // @duckdb/node-api (eslint-config), and tests are exempt from that rule.
  const writer = await DuckDBInstance.create(":memory:");
  const writerConnection = await writer.connect();
  await writerConnection.run(
    `COPY (SELECT * FROM (VALUES
      (1::BIGINT, DATE '2026-10-20', TIMESTAMPTZ '2026-10-20 22:00:10.663+00', 'a',
        [{'field': 'roofAgeYears', 'reason': 'no_roof_date'}]::STRUCT(field VARCHAR, reason VARCHAR)[], [5]::BIGINT[]),
      (2::BIGINT, DATE '2026-10-21', TIMESTAMPTZ '2026-10-21 00:00:00+00', NULL,
        []::STRUCT(field VARCHAR, reason VARCHAR)[], [1, NULL]::BIGINT[])
    ) AS v(probe_n, probe_date, probe_ts, probe_s, probe_struct, probe_list)) TO '${propertyFile}' (FORMAT parquet)`,
  );
  await writerConnection.run(
    `COPY (SELECT 7::BIGINT AS probe_n) TO '${permitFile}' (FORMAT parquet)`,
  );

  connection = await openParquetConnection(propertyFile, permitFile);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function rows(
  sql: string,
  on: DuckDBConnection = connection,
): Promise<Record<string, unknown>[]> {
  const reader = await on.runAndReadAll(sql);
  return reader.getRowObjectsJS() as Record<string, unknown>[];
}

describe("openParquetConnection (real @duckdb/node-api)", () => {
  it("binds crm_property and crm_permit as views over the two Parquet files", async () => {
    expect(await rows("SELECT count(*) AS n FROM crm_property")).toEqual([{ n: 2n }]);
    expect(await rows("SELECT probe_n FROM crm_permit")).toEqual([{ probe_n: 7n }]);
  });

  it("returns node-api native values: BIGINT as bigint, DATE and TIMESTAMPTZ as Date (UTC instant), NULL as null", async () => {
    expect(
      await rows(
        "SELECT probe_n, probe_date, probe_ts, probe_s FROM crm_property ORDER BY probe_n",
      ),
    ).toEqual([
      {
        probe_n: 1n,
        probe_date: new Date("2026-10-20T00:00:00.000Z"),
        probe_ts: new Date("2026-10-20T22:00:10.663Z"),
        probe_s: "a",
      },
      {
        probe_n: 2n,
        probe_date: new Date("2026-10-21T00:00:00.000Z"),
        probe_ts: new Date("2026-10-21T00:00:00.000Z"),
        probe_s: null,
      },
    ]);
  });

  it("keeps nested values as plain arrays and objects: a STRUCT list (missingReasons) and a BIGINT list", async () => {
    expect(
      await rows("SELECT probe_struct, probe_list FROM crm_property ORDER BY probe_n"),
    ).toEqual([
      {
        probe_struct: [{ field: "roofAgeYears", reason: "no_roof_date" }],
        probe_list: [5n],
      },
      { probe_struct: [], probe_list: [1n, null] },
    ]);
  });

  it("casts a manifest finishedAt to its UTC calendar date when TimeZone is pinned to UTC (the wrapper does not pin it yet)", async () => {
    const pinned = await openParquetConnection(propertyFile, permitFile);
    await pinned.run("SET TimeZone = 'UTC'");
    expect(
      await rows(
        "SELECT CAST(CAST('2026-10-20T22:00:10.663Z' AS TIMESTAMPTZ) AS DATE) AS as_of_date",
        pinned,
      ),
    ).toEqual([{ as_of_date: new Date("2026-10-20T00:00:00.000Z") }]);
  });
});
