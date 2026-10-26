// search.similar: same property type, roof age within 5 years, within 1 mile, nearest first.
// Real DuckDB over a small Parquet built in-test (the search.sql.test.ts pattern); the service and
// router are also exercised with a fake index for the empty-list reasons.
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
import { DuckDbParquetLeadIndex, type LeadIndex } from "../src/adapters/duckDbParquet.js";
import { appRouter } from "../src/routers/index.js";
import { similarProperties } from "../src/services/search.js";
import { createCallerFactory } from "../src/trpc.js";

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
let dir: string;
let index: DuckDbParquetLeadIndex;

// 1 degree of latitude is about 69 miles, so 0.001 degrees is about 0.07 mi.
const BASE = { lat: 30.27, lng: -97.74 };
const rows: readonly (readonly [string, number | null, number | null, string])[] = [
  ["self", 0, 40, "Building"],
  ["near-ok", 0.002, 43, "Building"],
  ["nearer-ok", 0.001, 36, "Building"],
  ["band-edge", 0.004, 45, "Building"],
  ["outside-band", 0.003, 46, "Building"],
  ["other-type", 0.001, 40, "Land"],
  ["too-far", 0.03, 40, "Building"],
  ["no-roof-age", 0.002, null, "Building"],
  ["no-coords", null, 40, "Building"],
];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "crm-similar-"));
  const w = await (await DuckDBInstance.create(":memory:")).connect();
  const values = rows
    .map(([cid, dLat, age, type]) => {
      const lat = dLat === null ? "NULL" : String(BASE.lat + dLat);
      const lng = dLat === null ? "NULL" : String(BASE.lng);
      const roof = age === null ? "NULL" : String(age);
      return `('${cid}', 'R-${cid}', ${lat}::DOUBLE, ${lng}::DOUBLE, ${roof}::INTEGER, '${type}', 'medium', 'built_year')`;
    })
    .join(", ");
  await w.run(`COPY (SELECT * FROM (VALUES ${values}) t("propertyCid", "requestIdentifier", latitude, longitude, "roofAgeYears", "propertyType", "roofAgeConfidence", "roofAgeBasis"))
    TO '${join(dir, "crm_property.parquet")}' (FORMAT parquet)`);
  await w.run(
    `COPY (SELECT 'x' AS "permitCid", 'self' AS "propertyCid") TO '${join(dir, "crm_permit.parquet")}' (FORMAT parquet)`,
  );
  ddbMock.on(GetCommand).resolves({
    Item: {
      pk: "META#index",
      current: "bafkreisimilartest",
      propertyCount: rows.length,
      permitCount: 1,
    },
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
    obs: createObservability("search-similar-test"),
    coldLoadTimeoutMs: 60_000,
    tmpDir: join(dir, "downloads"),
  });
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("similarProperties (real Parquet)", () => {
  it("returns same-type properties within 5 years and 1 mile, nearest first, never itself", async () => {
    const r = await similarProperties(index, { propertyCid: "self", limit: 5 });
    expect(r.reason).toBeNull();
    expect(r.similar.map((s) => s.propertyCid)).toEqual(["nearer-ok", "near-ok", "band-edge"]);
    expect(r.similar[0]).toMatchObject({
      requestIdentifier: "R-nearer-ok",
      roofAgeYears: 36,
      roofAgeConfidence: "medium",
      roofAgeBasis: "built_year",
    });
    expect(r.similar[0]?.distanceMi).toBeGreaterThan(0.05);
    expect(r.similar[0]?.distanceMi).toBeLessThan(0.1);
  });

  it("honours limit", async () => {
    const r = await similarProperties(index, { propertyCid: "self", limit: 1 });
    expect(r.similar.map((s) => s.propertyCid)).toEqual(["nearer-ok"]);
  });

  it("says why when there are no coordinates, no roof age, or no match", async () => {
    expect(await similarProperties(index, { propertyCid: "no-coords", limit: 5 })).toMatchObject({
      similar: [],
      reason: "no_coordinates",
    });
    expect(await similarProperties(index, { propertyCid: "no-roof-age", limit: 5 })).toMatchObject({
      similar: [],
      reason: "no_roof_age",
    });
    expect(await similarProperties(index, { propertyCid: "other-type", limit: 5 })).toMatchObject({
      similar: [],
      reason: "none_found",
    });
  });
});

describe("search.similar router", () => {
  const fake = {
    async indexInfo() {
      return { manifestCid: "m", propertyCount: 1, permitCount: 0, promotedAt: "t" };
    },
    async getProperty(cid: string) {
      return cid === "p1"
        ? {
            propertyCid: "p1",
            latitude: 30,
            longitude: -97,
            roofAgeYears: 10,
            propertyType: "Building",
            permits: [],
          }
        : null;
    },
    async similarProperties() {
      return [];
    },
  } as unknown as LeadIndex;
  const api = createCallerFactory(appRouter)({ requestId: "r", leadIndex: fake });

  it("defaults limit to 5, rejects 0 and 11, and reports none_found plainly", async () => {
    expect(await api.search.similar({ propertyCid: "p1" })).toMatchObject({
      found: true,
      similar: [],
      reason: "none_found",
      // The matching rules travel with the answer, so the drawer states them from the server.
      radiusMi: 1,
      roofAgeBandYears: 5,
      limit: 5,
      traceId: "r",
    });
    await expect(api.search.similar({ propertyCid: "p1", limit: 0 })).rejects.toThrow();
    await expect(api.search.similar({ propertyCid: "p1", limit: 11 })).rejects.toThrow();
  });

  it("reports a property outside the promoted run as not found", async () => {
    expect(await api.search.similar({ propertyCid: "zzz" })).toMatchObject({ found: false });
  });
});
