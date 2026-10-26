// GAP-1 (docs/evidence/B-09.md): permit and property searches must run inside DuckDB. Real DuckDB
// over Parquet built in-test; DynamoDB and S3 are doubles. Proves (1) the SQL haversine equals
// `@crm/domain`'s `distanceMeters` cut row for row (ADR-07), (2) counts keep today's definitions,
// (3) permit pages join to properties in SQL with exact totals, (4) a permit-number lookup ignores
// the radius, (5) every response is bounded in rows and bytes, (6) a runaway query is interrupted.
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DuckDBInstance } from "@duckdb/node-api";
import { distanceMeters, milesToMeters } from "@crm/domain";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DuckDbParquetLeadIndex,
  IndexQueryBudgetExceededError,
  MAX_PAGE_ROWS,
} from "../src/adapters/duckDbParquet.js";
import { searchPermits, searchProperties } from "../src/services/search.js";

const MANIFEST = "bafkreisqlpushdowntestmanifest";
const AUSTIN = { lat: 30.2686, lng: -97.7382 };
const FAR = { lat: 29.4, lng: -98.5 };
const PROPS = 60_000;
const PERMITS = 15_000;

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
let dir: string;
let index: DuckDbParquetLeadIndex;
interface P {
  propertyCid: string;
  latitude: number | null;
  longitude: number | null;
  roofAgeYears: number | null;
}
let properties: P[] = [];
let permitRows: {
  propertyCid: string;
  permitCid: string;
  permitNumber: string;
  statusClass: string;
  openDays: number | null;
}[] = [];

function makeIndex(queryBudgetMs?: number): DuckDbParquetLeadIndex {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs: createObservability("search-sql-test"),
    coldLoadTimeoutMs: 60_000,
    tmpDir: join(dir, `downloads-${String(queryBudgetMs ?? "default")}`),
    ...(queryBudgetMs === undefined ? {} : { queryBudgetMs }),
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-search-sql-"));
  const w = await (await DuckDBInstance.create(":memory:")).connect();
  await w.run("SELECT setseed(0.7)");
  // Properties scattered around Austin (about 25 mi), 3 percent without coordinates, 80 percent
  // without a roof age, mirroring the real index's shape.
  await w.run(`COPY (SELECT 'p' || i AS "propertyCid", 'R' || i AS "requestIdentifier",
      CASE WHEN random() < 0.03 THEN NULL ELSE 30.0 + random() * 0.55 END AS latitude,
      CASE WHEN random() < 0.03 THEN NULL ELSE -98.05 + random() * 0.65 END AS longitude,
      CASE WHEN random() < 0.8 THEN NULL ELSE (random() * 60)::INTEGER END AS "roofAgeYears",
      'residential' AS "propertyUsageType", 'in_county' AS "ownerAreaClass",
      FALSE AS "isLongTenure", 'run' AS "runId"
    FROM range(${PROPS}) t(i)) TO '${join(dir, "crm_property.parquet")}' (FORMAT parquet)`);
  await w.run(`COPY (SELECT 'p' || (random() * ${PROPS - 1})::INTEGER AS "propertyCid",
      'c' || i AS "permitCid", CASE WHEN i = 7 THEN '1981-001776 BP' ELSE 'N-' || i END AS "permitNumber",
      CASE WHEN random() < 0.15 THEN 'open' WHEN random() < 0.3 THEN 'stalled' ELSE 'closed' END AS "statusClass",
      CASE WHEN random() < 0.4 THEN NULL ELSE (random() * 4000)::INTEGER END AS "openDays",
      CAST(NULL AS VARCHAR) AS "finalDate",
      repeat('x', 400) AS "padding"
    FROM range(${PERMITS}) t(i)) TO '${join(dir, "crm_permit.parquet")}' (FORMAT parquet)`);
  const readAll = async (sql: string) => (await w.runAndReadAll(sql)).getRowObjectsJS();
  properties = (await readAll(
    `SELECT "propertyCid", latitude, longitude, "roofAgeYears" FROM read_parquet('${join(dir, "crm_property.parquet")}')`,
  )) as unknown as P[];
  permitRows = (await readAll(
    `SELECT "propertyCid", "permitCid", "permitNumber", "statusClass", "openDays" FROM read_parquet('${join(dir, "crm_permit.parquet")}')`,
  )) as unknown as typeof permitRows;

  ddbMock.on(GetCommand).resolves({
    Item: { pk: "META#index", current: MANIFEST, propertyCount: PROPS, permitCount: PERMITS },
  });
  s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => ({
    Body: createReadStream(
      join(
        dir,
        input.Key?.endsWith("crm_permit.parquet") ? "crm_permit.parquet" : "crm_property.parquet",
      ),
    ) as unknown as GetObjectCommandOutput["Body"],
  }));
  index = makeIndex();
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function inCircle(center: { lat: number; lng: number }, radiusMi: number): P[] {
  return properties.filter(
    (p) =>
      p.latitude !== null &&
      p.longitude !== null &&
      distanceMeters(center, { lat: p.latitude, lng: p.longitude }) < milesToMeters(radiusMi),
  );
}

describe("searchPropertiesPage (SQL pushdown)", () => {
  it.each([
    [AUSTIN, 0.5],
    [AUSTIN, 3],
    [AUSTIN, 5],
    [{ lat: 30.270569, lng: -97.742589 }, 5],
    [{ lat: 30.4394, lng: -97.62 }, 5],
    [AUSTIN, 25],
    [FAR, 5],
  ])(
    "matches distanceMeters exactly for %o at %s mi, nearest first, counts per definition",
    async (center, radiusMi) => {
      const reference = inCircle(center, radiusMi);
      const withRoof = reference.filter((p) => p.roofAgeYears !== null && p.roofAgeYears >= 15);
      const page = await index.searchPropertiesPage({
        center,
        radiusMi,
        roofAgeMinYears: 15,
        limit: 100,
      });
      expect(page.afterRadius).toBe(reference.length);
      expect(page.afterFilters).toBe(withRoof.length);
      expect(page.noRoofDate).toBe(reference.filter((p) => p.roofAgeYears === null).length);
      const expected = withRoof
        .map((p) => ({
          cid: p.propertyCid,
          d: distanceMeters(center, { lat: p.latitude as number, lng: p.longitude as number }),
        }))
        .sort((a, b) => a.d - b.d || (a.cid < b.cid ? -1 : 1))
        .slice(0, 100)
        .map((x) => x.cid);
      expect(page.rows.map((r) => r.propertyCid)).toEqual(expected);
    },
  );

  it("service: counts keep their definitions and the page never exceeds the 100-row cap", async () => {
    const result = await searchProperties(index, { center: AUSTIN, radiusMi: 5, limit: 1000 });
    expect(result.properties.length).toBeLessThanOrEqual(100);
    expect(result.counts.afterRadius).toBe(inCircle(AUSTIN, 5).length);
    expect(result.counts.afterRoofAge).toBe(result.counts.afterRadius);
    expect(result.counts.excludedNoRoofDate).toBe(0);
    const aged = await searchProperties(index, {
      center: AUSTIN,
      radiusMi: 5,
      roofAgeMinYears: 20,
      limit: 25,
    });
    expect(aged.properties.length).toBeLessThanOrEqual(25);
    expect(aged.counts.excludedNoRoofDate).toBe(
      inCircle(AUSTIN, 5).filter((p) => p.roofAgeYears === null).length,
    );
    expect(Buffer.byteLength(JSON.stringify(aged))).toBeLessThan(1024 * 1024);
  });

  it("the legacy array method also cuts the circle in SQL and honours limit", async () => {
    const rows = await index.searchProperties({ center: AUSTIN, radiusMi: 3, limit: 10 });
    expect(rows).toHaveLength(10);
    expect(await index.searchProperties({ center: AUSTIN, radiusMi: 3 })).toHaveLength(
      inCircle(AUSTIN, 3).length,
    );
  });
});

describe("searchPermitsPage (SQL join, exact total)", () => {
  function reference(center: { lat: number; lng: number }, radiusMi: number, status?: string[]) {
    const cids = new Set(inCircle(center, radiusMi).map((p) => p.propertyCid));
    return permitRows
      .filter((k) => cids.has(k.propertyCid))
      .filter((k) => status === undefined || status.includes(k.statusClass))
      .sort(
        (a, b) => (b.openDays ?? -1) - (a.openDays ?? -1) || (a.permitCid < b.permitCid ? -1 : 1),
      );
  }

  it.each([
    [AUSTIN, 3],
    [AUSTIN, 5],
    [{ lat: 30.4394, lng: -97.62 }, 5],
    [FAR, 5],
  ])(
    "matches the JS join for %o at %s mi: exact total, longest open first, page <= limit",
    async (center, radiusMi) => {
      const expected = reference(center, radiusMi);
      const page = await index.searchPermitsPage({ center, radiusMi, limit: 50 });
      expect(page.total).toBe(expected.length);
      expect(page.rows.map((r) => r.permitCid)).toEqual(
        expected.slice(0, 50).map((r) => r.permitCid),
      );
      expect(page.rows.every((r) => !("__total" in r))).toBe(true);
    },
  );

  it("filters status and open days in SQL and keeps the total exact", async () => {
    const expected = reference(AUSTIN, 5, ["open", "stalled"]).filter(
      (k) => (k.openDays ?? -1) >= 365,
    );
    const page = await index.searchPermitsPage({
      center: AUSTIN,
      radiusMi: 5,
      statusClass: ["open", "stalled"],
      openDaysMinimum: 365,
      limit: 25,
    });
    expect(page.total).toBe(expected.length);
    expect(page.rows.length).toBe(Math.min(25, expected.length));
    expect(page.rows.every((r) => r.openDays !== null && r.openDays >= 365)).toBe(true);
  });

  it("a permit-number lookup ignores the radius entirely and returns its row", async () => {
    const result = await searchPermits(index, {
      center: FAR,
      radiusMi: 0.5,
      permitNumber: "1981-001776 BP",
    });
    expect(result.total).toBe(1);
    expect(result.permits[0]?.permitNumber).toBe("1981-001776 BP");
    expect(result.truncated).toBe(false);
    const missing = await searchPermits(index, {
      center: AUSTIN,
      radiusMi: 5,
      permitNumber: "nope' OR 1=1",
    });
    expect(missing.total).toBe(0);
  });

  it("bounds rows and bytes: 25 mi around Austin returns at most 500 rows, under 1 MB, total exact, truncated honest", async () => {
    const expectedTotal = reference(AUSTIN, 25).length;
    expect(expectedTotal).toBeGreaterThan(MAX_PAGE_ROWS);
    const result = await searchPermits(index, { center: AUSTIN, radiusMi: 25, limit: 100_000 });
    expect(result.permits).toHaveLength(MAX_PAGE_ROWS);
    expect(result.total).toBe(expectedTotal);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify({ ...result, traceId: "t" }))).toBeLessThan(
      1024 * 1024,
    );
  });
});

describe("per-query budget", () => {
  it("interrupts a query that outlives its budget with a typed error, then serves the next one", async () => {
    const tight = makeIndex(50);
    const internals = tight as unknown as {
      ensureLoaded(m: string): Promise<{ connection: unknown }>;
      runBounded(connection: unknown, sql: string): Promise<unknown>;
    };
    const { connection } = await internals.ensureLoaded(MANIFEST);
    await expect(
      internals.runBounded(connection, "SELECT count(*) FROM range(100000000000) t(i)"),
    ).rejects.toBeInstanceOf(IndexQueryBudgetExceededError);
    const next = (await internals.runBounded(connection, "SELECT 1 AS one")) as {
      getRowObjectsJS(): unknown[];
    };
    expect(next.getRowObjectsJS()).toHaveLength(1);
  });
});
