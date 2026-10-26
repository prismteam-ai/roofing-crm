// Leads list filters run inside DuckDB: `matchingRequestIdentifiers` returns only the caller's own
// candidate identifiers that pass radius + roof age + permit status, with the same predicates and
// the same exact-circle cut as the map's property and permit searches. Real DuckDB over Parquet
// built in-test; DynamoDB and S3 are doubles. Each case is compared with the legacy JavaScript
// path (searchProperties then searchPermits) and with a plain-JS oracle.
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
import { DuckDbParquetLeadIndex } from "../src/adapters/duckDbParquet.js";

const MANIFEST = "bafkreileadsfiltertestmanifest";
const AUSTIN = { lat: 30.2686, lng: -97.7382 };
const PROPS = 20_000;
const PERMITS = 6_000;

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
let dir: string;
let index: DuckDbParquetLeadIndex;
interface P {
  propertyCid: string;
  requestIdentifier: string;
  latitude: number | null;
  longitude: number | null;
  roofAgeYears: number | null;
}
let properties: P[] = [];
let permits: { propertyCid: string; statusClass: string; openDays: number | null }[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-leads-filter-"));
  const w = await (await DuckDBInstance.create(":memory:")).connect();
  await w.run("SELECT setseed(0.3)");
  await w.run(`COPY (SELECT 'p' || i AS "propertyCid", 'R' || i AS "requestIdentifier",
      CASE WHEN random() < 0.03 THEN NULL ELSE 30.0 + random() * 0.55 END AS latitude,
      CASE WHEN random() < 0.03 THEN NULL ELSE -98.05 + random() * 0.65 END AS longitude,
      CASE WHEN random() < 0.5 THEN NULL ELSE (random() * 60)::INTEGER END AS "roofAgeYears",
      'residential' AS "propertyUsageType", 'in_county' AS "ownerAreaClass",
      FALSE AS "isLongTenure", 'run' AS "runId"
    FROM range(${PROPS}) t(i)) TO '${join(dir, "crm_property.parquet")}' (FORMAT parquet)`);
  await w.run(`COPY (SELECT 'p' || (random() * ${PROPS - 1})::INTEGER AS "propertyCid",
      'c' || i AS "permitCid", 'N-' || i AS "permitNumber",
      CASE WHEN random() < 0.3 THEN 'open' WHEN random() < 0.4 THEN 'stalled' ELSE 'closed' END AS "statusClass",
      (random() * 4000)::INTEGER AS "openDays",
      CAST(NULL AS VARCHAR) AS "finalDate"
    FROM range(${PERMITS}) t(i)) TO '${join(dir, "crm_permit.parquet")}' (FORMAT parquet)`);
  const readAll = async (sql: string) => (await w.runAndReadAll(sql)).getRowObjectsJS();
  properties = (await readAll(
    `SELECT "propertyCid", "requestIdentifier", latitude, longitude, "roofAgeYears" FROM read_parquet('${join(dir, "crm_property.parquet")}')`,
  )) as unknown as P[];
  permits = (await readAll(
    `SELECT "propertyCid", "statusClass", "openDays" FROM read_parquet('${join(dir, "crm_permit.parquet")}')`,
  )) as unknown as typeof permits;

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
  index = new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs: createObservability("leads-filter-test"),
    coldLoadTimeoutMs: 60_000,
    tmpDir: join(dir, "downloads"),
  });
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Every third property is "the caller's lead", plus identifiers that are not in the index. */
const candidates = (): string[] => [
  ...properties.filter((_, n) => n % 3 === 0).map((p) => p.requestIdentifier),
  "GONE-1",
  "GONE-2",
];

interface Filters {
  center?: { lat: number; lng: number };
  radiusMi?: number;
  roofAgeMinYears?: number;
  permitStatus?: string;
  permitOpenDaysMin?: number;
}

function oracle(ids: readonly string[], f: Filters): string[] {
  const want = new Set(ids);
  // One permit must satisfy status AND open-days together when both are given.
  const withStatus =
    f.permitStatus === undefined && f.permitOpenDaysMin === undefined
      ? undefined
      : new Set(
          permits
            .filter(
              (m) =>
                // "open" includes stalled (a stalled permit is open and not progressing).
                (f.permitStatus === undefined ||
                  m.statusClass === f.permitStatus ||
                  (f.permitStatus === "open" && m.statusClass === "stalled")) &&
                (f.permitOpenDaysMin === undefined ||
                  (m.openDays !== null && m.openDays >= f.permitOpenDaysMin)),
            )
            .map((m) => m.propertyCid),
        );
  return properties
    .filter((p) => want.has(p.requestIdentifier))
    .filter(
      (p) =>
        f.center === undefined ||
        f.radiusMi === undefined ||
        (p.latitude !== null &&
          p.longitude !== null &&
          distanceMeters(f.center, { lat: p.latitude, lng: p.longitude }) <
            milesToMeters(f.radiusMi)),
    )
    .filter(
      (p) =>
        f.roofAgeMinYears === undefined ||
        (p.roofAgeYears !== null && p.roofAgeYears >= f.roofAgeMinYears),
    )
    .filter((p) => withStatus === undefined || withStatus.has(p.propertyCid))
    .map((p) => p.requestIdentifier)
    .sort();
}

describe("LeadIndex.matchingRequestIdentifiers (SQL pushdown for leads.list)", () => {
  it.each<[string, Filters]>([
    ["radius only, 5 mi", { center: AUSTIN, radiusMi: 5 }],
    ["radius 25 mi (the whole data set)", { center: AUSTIN, radiusMi: 25 }],
    ["roof age only", { roofAgeMinYears: 15 }],
    ["permit open only", { permitStatus: "open" }],
    ["permit closed only", { permitStatus: "closed" }],
    ["permit stalled only", { permitStatus: "stalled" }],
    ["permit open >= 1 year", { permitOpenDaysMin: 365 }],
    ["permit open >= 10 years", { permitOpenDaysMin: 3650 }],
    ["permit open >= 1 day (the minimum)", { permitOpenDaysMin: 1 }],
    [
      "open status AND open >= 5 years on the same permit",
      { permitStatus: "open", permitOpenDaysMin: 1825 },
    ],
    [
      "radius + roof + open >= 3 years",
      { center: AUSTIN, radiusMi: 10, roofAgeMinYears: 15, permitOpenDaysMin: 1095 },
    ],
    [
      "radius + roof + permit open",
      { center: AUSTIN, radiusMi: 10, roofAgeMinYears: 15, permitStatus: "open" },
    ],
  ])("%s equals the plain-JS oracle", async (_label, filters) => {
    const ids = candidates();
    const got = await index.matchingRequestIdentifiers({ requestIdentifiers: ids, ...filters });
    expect([...got].sort()).toEqual(oracle(ids, filters));
  });

  it("equals the legacy JavaScript path (searchProperties then searchPermits)", async () => {
    const ids = new Set(candidates());
    const filters = {
      center: AUSTIN,
      radiusMi: 8,
      roofAgeMinYears: 15,
      permitStatus: "open",
    };
    const props = await index.searchProperties({
      center: AUSTIN,
      radiusMi: 8,
      roofAgeMinYears: 15,
      limit: 1_000_000,
    });
    const pm = await index.searchPermits({ propertyCids: props.map((p) => p.propertyCid) });
    const open = new Set(
      pm
        .filter((m) => m.statusClass === "open" || m.statusClass === "stalled")
        .map((m) => m.propertyCid),
    );
    const legacy = props
      .filter((p) => open.has(p.propertyCid) && ids.has(p.requestIdentifier))
      .map((p) => p.requestIdentifier)
      .sort();
    const got = await index.matchingRequestIdentifiers({
      requestIdentifiers: [...ids],
      ...filters,
    });
    expect([...got].sort()).toEqual(legacy);
    expect(legacy.length).toBeGreaterThan(0);
  });

  it("never returns an identifier the caller did not offer, and an empty list returns nothing", async () => {
    const got = await index.matchingRequestIdentifiers({
      requestIdentifiers: ["R1", "R2"],
      center: AUSTIN,
      radiusMi: 25,
    });
    expect([...got].every((id) => id === "R1" || id === "R2")).toBe(true);
    const none = await index.matchingRequestIdentifiers({
      requestIdentifiers: [],
      center: AUSTIN,
      radiusMi: 25,
    });
    expect(none.size).toBe(0);
  });

  it("handles more candidates than one statement carries (chunked) and escapes quotes", async () => {
    const many = [
      ...properties.map((p) => p.requestIdentifier),
      "O'Brien",
      ...Array(6000).fill("X"),
    ];
    const got = await index.matchingRequestIdentifiers({
      requestIdentifiers: many,
      roofAgeMinYears: 0,
    });
    expect([...got].sort()).toEqual(oracle(many, { roofAgeMinYears: 0 }));
  });

  it("with no filter at all it still answers (the identifiers present in the run)", async () => {
    const ids = candidates();
    const got = await index.matchingRequestIdentifiers({ requestIdentifiers: ids });
    expect([...got].sort()).toEqual(oracle(ids, {}));
  });
});
