// Search box street addresses: search.byAddress over real Parquet (DuckDB), the adapter's
// normalised exact match, and the older-index reason. Same harness pattern as query.test.ts.
//
// Matching rule under test (normalisedAddressSql in the adapter): both sides are uppercased, '#'
// becomes a space, punctuation other than commas is removed, whitespace collapses, commas are
// tidied to ", ". A stored address matches when it EQUALS the query, or STARTS WITH it at a
// comma boundary (so a street line alone matches every city, and "STREET, CITY" matches too).
// No abbreviation is expanded and there is no fuzzy fallback.
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

const WITH_COLUMN = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqaddr";
const OLD_INDEX = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqold1";
const RUN = "travis-full-run31-20261026";

interface Row {
  id: string;
  address: string | null;
  lat: number | null;
}
const ROWS: Row[] = [
  { id: "1", address: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613", lat: 30.5 },
  { id: "2", address: "2725 WOODALL DR 1401, AUSTIN, TX 78744", lat: 30.2 },
  { id: "3", address: "2725 WOODALL DR 1402, CEDAR PARK, TX 78613", lat: 30.5 },
  { id: "4", address: "2725 WOODALL DR, AUSTIN, TX 78744", lat: 30.21 },
  { id: "5", address: "100 N CONGRESS AVE, AUSTIN, TX 78701", lat: 30.26 },
  { id: "6", address: "9 OAK ST #5, AUSTIN, TX 78701", lat: 30.27 },
  { id: "7", address: "7 NO COORDS RD, AUSTIN, TX 78701", lat: null },
  { id: "8", address: null, lat: 30.3 },
  { id: "9", address: "12 CAFÉ STRASSE, AUSTIN, TX 78701", lat: 30.28 },
];

const q = (s: string | null) =>
  s === null ? "CAST(NULL AS VARCHAR)" : `'${s.replace(/'/g, "''")}'`;

function propertySql(withAddress: boolean): string {
  return ROWS.map((r) => {
    const base = [
      `'cid-${r.id}' AS "propertyCid"`,
      `'R-${r.id}' AS "requestIdentifier"`,
      r.lat === null ? `CAST(NULL AS DOUBLE) AS "latitude"` : `${r.lat}::DOUBLE AS "latitude"`,
      r.lat === null ? `CAST(NULL AS DOUBLE) AS "longitude"` : `-97.7::DOUBLE AS "longitude"`,
      `'${RUN}' AS "runId"`,
      `'m' AS "sourceManifestCid"`,
      `'2026-10-26' AS "capturedAt"`,
      `'cid-${r.id}' AS "cid"`,
      `CAST([] AS STRUCT(field VARCHAR, reason VARCHAR)[]) AS "missingReasons"`,
    ];
    if (withAddress) base.push(`${q(r.address)} AS "unnormalizedAddress"`);
    return `SELECT ${base.join(", ")}`;
  }).join(" UNION ALL ");
}

const PERMIT_SQL = `SELECT 'cid-1' AS "propertyCid", 'p1' AS "permitCid", 'p1' AS "cid",
  '2026-1 BP' AS "permitNumber", 'open' AS "statusClass", 1::INTEGER AS "openDays", CAST(NULL AS VARCHAR) AS "finalDate",
  '${RUN}' AS "runId", 'm' AS "sourceManifestCid", '2026-10-26' AS "capturedAt",
  CAST([] AS STRUCT(field VARCHAR, reason VARCHAR)[]) AS "missingReasons"`;

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("search-address-test");
let dir: string;
let downloads: string;
let current = WITH_COLUMN;

async function write(file: string, select: string): Promise<void> {
  const writer = await DuckDBInstance.create(":memory:");
  const connection = await writer.connect();
  await connection.run(`COPY (${select}) TO '${file}' (FORMAT parquet)`);
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-addr-fixtures-"));
  downloads = mkdtempSync(join(tmpdir(), "crm-addr-downloads-"));
  await write(join(dir, "new_property.parquet"), propertySql(true));
  await write(join(dir, "old_property.parquet"), propertySql(false));
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
      current,
      propertyCount: ROWS.length,
      permitCount: 1,
      promotedAt: "t",
    },
  }));
  s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => {
    const key = input.Key ?? "";
    const file = key.endsWith("crm_permit.parquet")
      ? "permit.parquet"
      : key.includes(OLD_INDEX)
        ? "old_property.parquet"
        : "new_property.parquet";
    return { Body: createReadStream(join(dir, file)) as unknown as GetObjectCommandOutput["Body"] };
  });
  current = WITH_COLUMN;
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

async function find(value: string, limit?: number) {
  const r = await api().search.byAddress({ value, ...(limit === undefined ? {} : { limit }) });
  return r.found ? r.matches.map((m) => m.requestIdentifier) : [];
}

describe("search.byAddress", () => {
  it("matches the full stored address exactly and returns the stored text and coordinates", async () => {
    const r = await api().search.byAddress({ value: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613" });
    expect(r).toMatchObject({ found: true, total: 1, runId: RUN });
    if (!r.found) throw new Error("expected a match");
    expect(r.matches[0]).toEqual({
      propertyCid: "cid-1",
      requestIdentifier: "R-1",
      address: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613",
      lat: 30.5,
      lng: -97.7,
    });
  });

  it("a street line alone finds the unit in several cities, ordered by address then identifier", async () => {
    expect(await find("2725 WOODALL DR 1401")).toEqual(["R-2", "R-1"]);
  });

  it("the unit suffix is part of the street line: no unit means no unit rows", async () => {
    expect(await find("2725 WOODALL DR")).toEqual(["R-4"]);
  });

  it("the first comma segments must equal the stored ones (street, city)", async () => {
    expect(await find("2725 WOODALL DR 1401, CEDAR PARK")).toEqual(["R-1"]);
    expect(await find("2725 WOODALL DR 1401, CEDAR")).toEqual([]);
  });

  it("is case, spacing and punctuation insensitive, and treats # as a space", async () => {
    expect(await find("  2725   woodall  dr 1401 , cedar park ,tx 78613 ")).toEqual(["R-1"]);
    expect(await find("9 oak st 5")).toEqual(["R-6"]);
    expect(await find("9 Oak St. #5")).toEqual(["R-6"]);
  });

  it("does not expand abbreviations (exact, not fuzzy)", async () => {
    expect(await find("100 NORTH CONGRESS AVE")).toEqual([]);
    expect(await find("100 N CONGRESS AVENUE")).toEqual([]);
    expect(await find("100 N CONGRESS AVE")).toEqual(["R-5"]);
  });

  it("matches non-ASCII letters", async () => {
    expect(await find("12 café strasse")).toEqual(["R-9"]);
  });

  it("answers found: false with the run id when nothing matches", async () => {
    expect(await api().search.byAddress({ value: "1 NOWHERE LN" })).toEqual({
      found: false,
      runId: RUN,
      traceId: "r",
    });
  });

  it("leaves out properties with no coordinates or no address", async () => {
    expect(await find("7 NO COORDS RD")).toEqual([]);
  });

  it("caps the rows at limit but reports the total", async () => {
    const r = await api().search.byAddress({ value: "2725 WOODALL DR 1401", limit: 1 });
    expect(r).toMatchObject({ found: true, total: 2 });
    if (r.found) expect(r.matches).toHaveLength(1);
  });

  it("is safe against SQL-looking input", async () => {
    expect(await find("'; DROP TABLE crm_property; --")).toEqual([]);
    expect(await find("1 x' OR '1'='1")).toEqual([]);
    expect(await find("2725 WOODALL DR 1401")).toEqual(["R-2", "R-1"]);
  });

  it("a query of only punctuation matches nothing", async () => {
    expect(await find("###")).toEqual([]);
    expect(await find(",,,")).toEqual([]);
  });

  it("validates the input", async () => {
    const a = api();
    await expect(a.search.byAddress({ value: "ab" })).rejects.toThrow();
    await expect(a.search.byAddress({ value: "x".repeat(201) })).rejects.toThrow();
    await expect(a.search.byAddress({ value: "abc", limit: 11 })).rejects.toThrow();
    await expect(a.search.byAddress({ value: "abc", limit: 0 })).rejects.toThrow();
  });

  it("says address_not_in_index when the served index has no address column", async () => {
    current = OLD_INDEX;
    expect(await api().search.byAddress({ value: "2725 WOODALL DR 1401" })).toEqual({
      found: false,
      reason: "address_not_in_index",
      runId: RUN,
      traceId: "r",
    });
  });
});
