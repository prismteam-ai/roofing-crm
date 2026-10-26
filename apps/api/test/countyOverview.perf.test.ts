// Timing for search.countyOverview on a synthetic full-county index: 441,961 properties (Travis
// County's row count) spread over the county bbox, plus 150,000 permits. Opt-in, because it
// writes ~20 MB of Parquet: `CRM_PERF=1 pnpm --filter @crm/api exec vitest run
// test/countyOverview.perf.test.ts`. The synthetic rows only measure speed and payload size;
// they are never shown as data. NFR (architecture-constitution.md): search API warm p95 < 500 ms.
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DuckDBInstance } from "@duckdb/node-api";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DuckDbParquetLeadIndex } from "../src/adapters/duckDbParquet.js";

const ROWS = 441_961;
const PERMITS = 150_000;
const MANIFEST = "bafkreicountyoverviewperfmanifest";

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

let dir: string;

describe.skipIf(process.env.CRM_PERF !== "1")("countyOverview on 441,961 rows", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "crm-overview-perf-"));
    const writer = await (await DuckDBInstance.create(":memory:")).connect();
    await writer.run("SELECT setseed(0.42)");
    await writer.run(`COPY (
      SELECT 'p' || i AS "propertyCid",
        CASE WHEN random() < 0.01 THEN NULL ELSE 30.02 + random() * 0.61 END AS latitude,
        -98.17 + random() * 0.8 AS longitude,
        CASE WHEN random() < 0.2 THEN NULL ELSE (random() * 40)::INTEGER END AS "roofAgeYears",
        CASE WHEN random() < 0.8 THEN 'residential' ELSE 'commercial' END AS "propertyUsageType",
        'synthetic-perf-run' AS "runId"
      FROM range(${ROWS}) t(i)) TO '${join(dir, "crm_property.parquet")}' (FORMAT parquet)`);
    await writer.run(`COPY (
      SELECT 'p' || (random() * ${ROWS - 1})::INTEGER AS "propertyCid",
        CASE WHEN random() < 0.1 THEN 'open' WHEN random() < 0.2 THEN 'stalled' ELSE 'closed' END AS "statusClass",
        (random() * 4000)::INTEGER AS "openDays",
        CAST(NULL AS VARCHAR) AS "finalDate"
      FROM range(${PERMITS}) t(i)) TO '${join(dir, "crm_permit.parquet")}' (FORMAT parquet)`);

    ddbMock.on(GetCommand).resolves({
      Item: { pk: "META#index", current: MANIFEST, propertyCount: ROWS, permitCount: PERMITS },
    });
    s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => ({
      Body: createReadStream(
        join(
          dir,
          input.Key?.endsWith("crm_permit.parquet") ? "crm_permit.parquet" : "crm_property.parquet",
        ),
      ) as unknown as GetObjectCommandOutput["Body"],
    }));
  }, 120_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("aggregates the county under the warm 500 ms budget and keeps the payload small", async () => {
    const index = new DuckDbParquetLeadIndex({
      ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      s3: new S3Client({}),
      tableName: "crm-leads",
      bucket: "crm-index",
      obs: createObservability("countyOverview-perf"),
      coldLoadTimeoutMs: 60_000,
      tmpDir: join(dir, "downloads"),
    });
    // Load the index once (the cold load has its own NFR), then time uncached aggregates.
    await index.searchProperties({ limit: 1 });

    const report: string[] = [];
    for (const [label, query] of [
      ["zoom 9", { zoom: 9 }],
      ["zoom 10", { zoom: 10 }],
      ["zoom 8", { zoom: 8 }],
      ["zoom 9 + permits", { zoom: 9, permits: true }],
      ["zoom 10 + permits + roof >= 15", { zoom: 10, permits: true, roofAgeMinYears: 15 }],
    ] as const) {
      const t0 = performance.now();
      const overview = await index.countyOverview(query);
      const uncachedMs = performance.now() - t0;
      const t1 = performance.now();
      await index.countyOverview(query);
      const cachedMs = performance.now() - t1;
      const bytes = Buffer.byteLength(JSON.stringify(overview));
      report.push(
        `${label}: ${String(overview.cells.length)} cells, ${uncachedMs.toFixed(0)} ms uncached, ${cachedMs.toFixed(1)} ms cached, ${(bytes / 1024).toFixed(1)} KiB`,
      );
      expect(overview.counts.matched).toBeGreaterThan(0);
      expect(uncachedMs).toBeLessThan(500);
    }
    process.stderr.write(`countyOverview timing (${String(ROWS)} rows):\n${report.join("\n")}\n`);
  }, 120_000);
});
