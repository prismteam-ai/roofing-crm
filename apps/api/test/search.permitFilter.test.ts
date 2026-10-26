// F-1: the permit filters (status, open days) are applied in SQL to EVERY property in the circle,
// before the page limit, the nearest-first order and the counts. Real Parquet through DuckDB, same
// harness pattern as search.address.test.ts.
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DuckDBInstance } from "@duckdb/node-api";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DuckDbParquetLeadIndex } from "../src/adapters/duckDbParquet.js";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";

const CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqpermitf";
const RUN = "travis-full-run31-20261026";
const CENTER = { lat: 30.2672, lng: -97.7431 };

// 250 properties in a line east of the centre, nearest first: p001 is nearest. Properties 1..120
// have a closed permit only; 121..130 an open one; 131..140 a stalled one (open 400 days);
// 141..145 a stalled one (open 4000 days); 146..250 no permit. The nearest 100 therefore hold no
// open or stalled permit at all.
const COUNT = 250;
const pad = (n: number): string => String(n).padStart(3, "0");
// 146..155 hold a "stalled" permit and 156..158 an "open" one that both have a final date (Task A
// classes a finaled permit with no status as stalled): finished, so no open or stalled filter,
// count or list may include them. They have no open days.
const FINAL_DATE = "1991-04-15";
function permitFor(n: number): { status: string; days: number | null; final?: string } | null {
  if (n >= 146 && n <= 155) return { status: "stalled", days: null, final: FINAL_DATE };
  if (n >= 156 && n <= 158) return { status: "open", days: null, final: FINAL_DATE };
  if (n <= 120) return { status: "closed", days: 0 };
  if (n <= 130) return { status: "open", days: 200 };
  if (n <= 140) return { status: "stalled", days: 400 };
  if (n <= 145) return { status: "stalled", days: 4000 };
  return null;
}

const MISSING = `CAST([] AS STRUCT(field VARCHAR, reason VARCHAR)[]) AS "missingReasons"`;
const PROPERTY_SQL = Array.from({ length: COUNT }, (_, i) => i + 1)
  .map(
    (n) =>
      `SELECT 'cid-${pad(n)}' AS "propertyCid", 'R-${pad(n)}' AS "requestIdentifier",
        ${CENTER.lat}::DOUBLE AS "latitude", ${CENTER.lng + n * 0.0005}::DOUBLE AS "longitude",
        ${30 + (n % 5)}::INTEGER AS "roofAgeYears", '${RUN}' AS "runId",
        'm' AS "sourceManifestCid", '2026-10-26' AS "capturedAt", 'cid-${pad(n)}' AS "cid", ${MISSING}`,
  )
  .join(" UNION ALL ");
const PERMIT_SQL = Array.from({ length: COUNT }, (_, i) => i + 1)
  .filter((n) => permitFor(n) !== null)
  .map((n) => {
    const p = permitFor(n) as { status: string; days: number | null; final?: string };
    return `SELECT 'cid-${pad(n)}' AS "propertyCid", 'p${pad(n)}' AS "permitCid", 'p${pad(n)}' AS "cid",
      '2026-${n} BP' AS "permitNumber", '${p.status}' AS "statusClass", ${p.days === null ? "NULL" : p.days}::INTEGER AS "openDays",
      ${p.final === undefined ? "CAST(NULL AS VARCHAR)" : `'${p.final}'`} AS "finalDate",
      '${RUN}' AS "runId", 'm' AS "sourceManifestCid", '2026-10-26' AS "capturedAt", ${MISSING}`;
  })
  .join(" UNION ALL ");

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("search-permit-filter-test");
let dir: string;
let downloads: string;

async function write(file: string, select: string): Promise<void> {
  const writer = await DuckDBInstance.create(":memory:");
  const connection = await writer.connect();
  await connection.run(`COPY (${select}) TO '${file}' (FORMAT parquet)`);
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-pf-fixtures-"));
  downloads = mkdtempSync(join(tmpdir(), "crm-pf-downloads-"));
  await write(join(dir, "property.parquet"), PROPERTY_SQL);
  await write(join(dir, "permit.parquet"), PERMIT_SQL);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(downloads, { recursive: true, force: true });
});

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  ddbMock.on(GetCommand).callsFake(() => ({
    Item: {
      pk: "META#index",
      current: CID,
      propertyCount: COUNT,
      permitCount: 145,
      promotedAt: "t",
    },
  }));
  s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => {
    const file = (input.Key ?? "").endsWith("crm_permit.parquet")
      ? "permit.parquet"
      : "property.parquet";
    return { Body: createReadStream(join(dir, file)) as unknown as GetObjectCommandOutput["Body"] };
  });
});

function api() {
  const leadIndex = new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    coldLoadTimeoutMs: 30_000,
    tmpDir: downloads,
  });
  return createCallerFactory(appRouter)({ requestId: "r", leadIndex });
}

const base = { center: CENTER, radiusMi: 25, limit: 100 };

describe("search.properties permit filters (applied before the page and the counts)", () => {
  it("without a permit filter the page is the nearest 100 and the total is the whole circle", async () => {
    const r = await api().search.properties(base);
    expect(r.properties).toHaveLength(100);
    expect(r.counts.afterRadius).toBe(COUNT);
    expect(r.counts.afterRoofAge).toBe(COUNT);
  });

  it("stalled finds the stalled properties although none is among the nearest 100", async () => {
    const r = await api().search.properties({ ...base, permitStatusClass: ["stalled"] });
    expect(r.counts.afterRoofAge).toBe(15);
    expect(r.counts.afterRadius).toBe(COUNT);
    expect(r.properties.map((p) => p.propertyCid)).toEqual(
      Array.from({ length: 15 }, (_, i) => `cid-${pad(131 + i)}`),
    );
  });

  it("open (open or stalled) matches 25 properties; the list length equals the total", async () => {
    const r = await api().search.properties({ ...base, permitStatusClass: ["open", "stalled"] });
    expect(r.counts.afterRoofAge).toBe(25);
    expect(r.properties).toHaveLength(25);
  });

  it("open alone matches only the open-status permits", async () => {
    const r = await api().search.properties({ ...base, permitStatusClass: ["open"] });
    expect(r.counts.afterRoofAge).toBe(10);
  });

  it("the open-days cut holds on the same permit as the status", async () => {
    const r = await api().search.properties({
      ...base,
      permitStatusClass: ["stalled"],
      permitOpenDaysMin: 1000,
    });
    expect(r.counts.afterRoofAge).toBe(5);
    const days = await api().search.properties({ ...base, permitOpenDaysMin: 300 });
    expect(days.counts.afterRoofAge).toBe(15);
  });

  it("combines with the roof-age filter and the limit applies after the filter", async () => {
    const r = await api().search.properties({
      ...base,
      limit: 3,
      roofAgeMinYears: 33,
      permitStatusClass: ["open", "stalled"],
    });
    // roofAgeYears is 30 + n % 5, so >= 33 keeps n % 5 in {3, 4}: 10 of the 25 permit properties.
    expect(r.counts.afterRoofAge).toBe(10);
    expect(r.properties).toHaveLength(3);
  });

  it("the permit list for the same filter agrees with the property total", async () => {
    const caller = api();
    const props = await caller.search.properties({ ...base, permitStatusClass: ["stalled"] });
    const permits = await caller.search.permits({
      center: CENTER,
      radiusMi: 25,
      sort: "openDays",
      statusClass: ["stalled"],
    });
    expect(permits.total).toBe(props.counts.afterRoofAge);
  });

  it("a permit with a final date is never open or stalled, whatever its class says", async () => {
    const caller = api();
    // 13 properties have a finaled permit classed stalled (10) or open (3): none is counted.
    const stalled = await caller.search.properties({ ...base, permitStatusClass: ["stalled"] });
    expect(stalled.counts.afterRoofAge).toBe(15);
    const open = await caller.search.properties({
      ...base,
      permitStatusClass: ["open", "stalled"],
    });
    expect(open.counts.afterRoofAge).toBe(25);
    const permits = await caller.search.permits({
      center: CENTER,
      radiusMi: 25,
      sort: "openDays",
      statusClass: ["open", "stalled"],
    });
    expect(permits.total).toBe(25);
    expect(permits.permits.every((p) => p.finalDate === null)).toBe(true);
  });

  it("rejects an empty status list", async () => {
    await expect(api().search.properties({ ...base, permitStatusClass: [] })).rejects.toThrow();
  });
});
