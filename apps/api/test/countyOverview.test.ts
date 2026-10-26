// search.countyOverview (design-review-log rows 10 and 69): the whole-county hexagon aggregate,
// computed in DuckDB over the promoted `crm_property` (and `crm_permit`) Parquet. Real DuckDB
// reading Parquet built in-test; DynamoDB and S3 are aws-sdk-client-mock doubles, nothing reaches
// AWS. The first case pins the adapter's SQL cell math to `@crm/domain`'s `hexAxialOf` — the
// function the web map uses — so a cell means the same hexagon on both sides.
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DuckDBInstance } from "@duckdb/node-api";
import { DEFAULT_ROOF_AGE_YEARS, hexAxialOf, hexCellCenter } from "@crm/domain";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DuckDbParquetLeadIndex, IndexNotReadyError } from "../src/adapters/duckDbParquet.js";

const RUN_ID = "travis-202609-permits-20261021t103516z";
const PROMOTED_AT = "2026-10-21T10:35:16Z";
let manifestSeq = 0;
/** A fresh manifest per case keeps the per-manifest caches (index and overview) independent. */
const nextManifest = (): string => `bafkreicountyoverviewtestmanifest${String(++manifestSeq)}`;

interface Row {
  cid: string;
  lat: number | null;
  lng: number | null;
  age: number | null;
  usage: string;
}
interface PermitRow {
  cid: string;
  status: string | null;
  openDays: number | null;
  finalDate?: string | null;
}

/** Deterministic points over Travis County (a fixed LCG, so the test never flakes). */
function pseudoRandomRows(n: number): Row[] {
  let seed = 42;
  const rand = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const rows: Row[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      cid: `p${String(i)}`,
      lat: 30.02 + rand() * 0.61,
      lng: -98.17 + rand() * 0.8,
      age: rand() < 0.2 ? null : Math.floor(rand() * 40),
      usage: rand() < 0.8 ? "residential" : "commercial",
    });
  }
  return rows;
}

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };

/** Hand-made rows with known cells: four in Austin, one in Pflugerville, two unmapped. */
const KNOWN_ROWS: Row[] = [
  { cid: "a1", lat: AUSTIN.lat, lng: AUSTIN.lng, age: 10, usage: "residential" },
  { cid: "a2", lat: AUSTIN.lat + 0.0005, lng: AUSTIN.lng, age: 21, usage: "residential" },
  { cid: "a3", lat: AUSTIN.lat, lng: AUSTIN.lng + 0.0005, age: 30, usage: "commercial" },
  { cid: "a4", lat: AUSTIN.lat, lng: AUSTIN.lng, age: null, usage: "residential" },
  { cid: "f1", lat: PFLUGERVILLE.lat, lng: PFLUGERVILLE.lng, age: 15, usage: "residential" },
  { cid: "x1", lat: null, lng: null, age: 40, usage: "residential" },
  { cid: "x2", lat: null, lng: -97.7, age: null, usage: "residential" },
];
const KNOWN_PERMITS: PermitRow[] = [
  { cid: "a1", status: "open", openDays: 340 },
  { cid: "a1", status: "closed", openDays: 12 },
  { cid: "a3", status: "stalled", openDays: 2_000 },
  { cid: "f1", status: "open", openDays: 90 },
  { cid: "x1", status: "open", openDays: 50 },
  // Finaled, but Task A classed it stalled (no status): finished, so no count includes it.
  { cid: "a1", status: "stalled", openDays: null, finalDate: "1991-04-15" },
  { cid: "f1", status: "open", openDays: null, finalDate: "2001-02-03" },
];

const sqlString = (v: string | null): string =>
  v === null ? "CAST(NULL AS VARCHAR)" : `'${v.replace(/'/g, "''")}'`;
const sqlNumber = (v: number | null, type: string): string =>
  v === null ? `CAST(NULL AS ${type})` : `CAST(${String(v)} AS ${type})`;

async function writeParquet(file: string, select: string): Promise<void> {
  const writer = await DuckDBInstance.create(":memory:");
  const connection = await writer.connect();
  await connection.run(`COPY (${select}) TO '${file}' (FORMAT parquet)`);
}

function propertySelect(rows: readonly Row[]): string {
  const values = rows
    .map(
      (r) =>
        `(${sqlString(r.cid)}, ${sqlNumber(r.lat, "DOUBLE")}, ${sqlNumber(r.lng, "DOUBLE")}, ${sqlNumber(r.age, "INTEGER")}, ${sqlString(r.usage)}, '${RUN_ID}')`,
    )
    .join(", ");
  return `SELECT * FROM (VALUES ${values}) AS t("propertyCid", latitude, longitude, "roofAgeYears", "propertyUsageType", "runId")`;
}

function permitSelect(rows: readonly PermitRow[]): string {
  if (rows.length === 0) {
    return `SELECT CAST(NULL AS VARCHAR) AS "propertyCid", CAST(NULL AS VARCHAR) AS "statusClass", CAST(NULL AS INTEGER) AS "openDays", CAST(NULL AS VARCHAR) AS "finalDate" WHERE FALSE`;
  }
  const values = rows
    .map(
      (p) =>
        `(${sqlString(p.cid)}, ${sqlString(p.status)}, ${sqlNumber(p.openDays, "INTEGER")}, ${p.finalDate === undefined ? "CAST(NULL AS VARCHAR)" : sqlString(p.finalDate)})`,
    )
    .join(", ");
  return `SELECT * FROM (VALUES ${values}) AS t("propertyCid", "statusClass", "openDays", "finalDate")`;
}

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("countyOverview-test");

let fixtureDir: string;
let downloadDir: string;
const files: Record<string, { property: string; permit: string }> = {};

async function fixture(name: string, rows: readonly Row[], permits: readonly PermitRow[]) {
  const property = join(fixtureDir, `${name}-crm_property.parquet`);
  const permit = join(fixtureDir, `${name}-crm_permit.parquet`);
  await writeParquet(property, propertySelect(rows));
  await writeParquet(permit, permitSelect(permits));
  files[name] = { property, permit };
}

beforeAll(async () => {
  fixtureDir = mkdtempSync(join(tmpdir(), "crm-overview-fixtures-"));
  downloadDir = mkdtempSync(join(tmpdir(), "crm-overview-downloads-"));
  await fixture("known", KNOWN_ROWS, KNOWN_PERMITS);
  await fixture("random", pseudoRandomRows(5_000), []);
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
  rmSync(downloadDir, { recursive: true, force: true });
});

/** Promotes `manifestCid` and serves the named fixture's Parquet for it. */
function serve(name: string, manifestCid: string): void {
  const set = files[name];
  if (set === undefined) throw new Error(`no fixture ${name}`);
  ddbMock.on(GetCommand).resolves({
    Item: {
      pk: "META#index",
      current: manifestCid,
      propertyCount: 0,
      permitCount: 0,
      promotedAt: PROMOTED_AT,
    },
  });
  s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => ({
    Body: createReadStream(
      input.Key?.endsWith("crm_permit.parquet") ? set.permit : set.property,
    ) as unknown as GetObjectCommandOutput["Body"],
  }));
}

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
});

function makeIndex(): DuckDbParquetLeadIndex {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    coldLoadTimeoutMs: 30_000,
    tmpDir: downloadDir,
  });
}

const key = (q: number, r: number): string => `${String(q)}:${String(r)}`;

describe("LeadIndex.countyOverview (DuckDB hex aggregate)", () => {
  it("puts every point in the same cell as @crm/domain's hexAxialOf, at every overview zoom", async () => {
    serve("random", nextManifest());
    const index = makeIndex();
    const rows = pseudoRandomRows(5_000);
    for (const zoom of [6, 8, 9, 10]) {
      const expected = new Map<string, number>();
      for (const row of rows) {
        const { q, r } = hexAxialOf(row.lat as number, row.lng as number, zoom);
        expected.set(key(q, r), (expected.get(key(q, r)) ?? 0) + 1);
      }
      const overview = await index.countyOverview({ zoom });
      const actual = new Map(overview.cells.map((c) => [key(c.q, c.r), c.count]));
      expect(actual).toEqual(expected);
      expect(overview.counts.binned).toBe(5_000);
    }
  });

  it("reports count, roof-age-known count, median roof age and aged count per cell", async () => {
    serve("known", nextManifest());
    const overview = await makeIndex().countyOverview({ zoom: 9 });
    const austin = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
    const cell = overview.cells.find((c) => c.q === austin.q && c.r === austin.r);
    expect(cell).toMatchObject({
      count: 4,
      withRoofAge: 3,
      medianRoofAge: 21,
      agedCount: 2, // 21 and 30 are at least DEFAULT_ROOF_AGE_YEARS (15)
    });
    expect(overview.agedYears).toBe(DEFAULT_ROOF_AGE_YEARS);
    // The centre comes from the shared grid, rounded to 5 decimals (about 1 m).
    const [lng, lat] = hexCellCenter(austin.q, austin.r, 9);
    expect(cell?.lat).toBeCloseTo(lat, 5);
    expect(cell?.lng).toBeCloseTo(lng, 5);
    expect(String(cell?.lat).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it("averages the two middle ages for an even count and is null when no age is published", async () => {
    serve("known", nextManifest());
    const overview = await makeIndex().countyOverview({
      zoom: 9,
      propertyUsageType: "residential",
    });
    const austin = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
    const cell = overview.cells.find((c) => c.q === austin.q && c.r === austin.r);
    // residential Austin rows: 10, 21, null -> median of [10, 21] = 15.5
    expect(cell).toMatchObject({ count: 3, withRoofAge: 2, medianRoofAge: 15.5 });
  });

  it("counts the rows it cannot draw, and says which run it read", async () => {
    const manifestCid = nextManifest();
    serve("known", manifestCid);
    const overview = await makeIndex().countyOverview({ zoom: 9 });
    expect(overview.counts).toEqual({
      total: 7,
      matched: 7,
      binned: 5,
      excludedNoCoordinates: 2,
      excludedNoRoofDate: 0,
      binnedWithoutRoofAge: 1,
    });
    expect(overview.cells.reduce((n, c) => n + c.count, 0)).toBe(5);
    expect(overview.manifestCid).toBe(manifestCid);
    expect(overview.runId).toBe(RUN_ID);
    expect(overview.zoom).toBe(9);
  });

  it("applies the roof-age minimum and counts rows dropped only for having no roof date", async () => {
    serve("known", nextManifest());
    const overview = await makeIndex().countyOverview({ zoom: 9, roofAgeMinYears: 15 });
    // ages >= 15: a2 (21), a3 (30), f1 (15), x1 (40, unmapped); no roof date: a4, x2
    expect(overview.counts).toMatchObject({
      total: 7,
      matched: 4,
      binned: 3,
      excludedNoCoordinates: 1,
      excludedNoRoofDate: 2,
      binnedWithoutRoofAge: 0,
    });
  });

  it("adds open and stalled permit counts per cell only when the permit layer asks", async () => {
    serve("known", nextManifest());
    const index = makeIndex();
    const without = await index.countyOverview({ zoom: 9 });
    expect(without.cells.every((c) => c.openPermits === undefined)).toBe(true);
    expect(without.counts.openPermits).toBeUndefined();

    const withPermits = await index.countyOverview({ zoom: 9, permits: true });
    const austin = hexAxialOf(AUSTIN.lat, AUSTIN.lng, 9);
    const pf = hexAxialOf(PFLUGERVILLE.lat, PFLUGERVILLE.lng, 9);
    const a = withPermits.cells.find((c) => c.q === austin.q && c.r === austin.r);
    const f = withPermits.cells.find((c) => c.q === pf.q && c.r === pf.r);
    expect(a).toMatchObject({ openPermits: 1, stalledPermits: 1, maxOpenDays: 2_000 });
    expect(f).toMatchObject({ openPermits: 1, stalledPermits: 0, maxOpenDays: 90 });
    // The unmapped property's open permit cannot be placed on the map.
    expect(withPermits.counts).toMatchObject({ openPermits: 2, stalledPermits: 1 });

    const stalledOnly = await index.countyOverview({
      zoom: 9,
      permits: true,
      permitStatus: "stalled",
    });
    const a2 = stalledOnly.cells.find((c) => c.q === austin.q && c.r === austin.r);
    expect(a2).toMatchObject({ openPermits: 0, stalledPermits: 1, maxOpenDays: 2_000 });

    const longOpen = await index.countyOverview({ zoom: 9, permits: true, permitOpenDaysMin: 300 });
    const f2 = longOpen.cells.find((c) => c.q === pf.q && c.r === pf.r);
    expect(f2).toMatchObject({ openPermits: 0, stalledPermits: 0, maxOpenDays: null });
  });

  it("caches per manifest and filter key in the sandbox; a new promotion recomputes", async () => {
    serve("known", nextManifest());
    const index = makeIndex();
    const first = await index.countyOverview({ zoom: 9 });
    const again = await makeIndex().countyOverview({ zoom: 9 });
    expect(again).toBe(first);
    const otherFilter = await index.countyOverview({ zoom: 9, roofAgeMinYears: 15 });
    expect(otherFilter).not.toBe(first);
    const otherZoom = await index.countyOverview({ zoom: 8 });
    expect(otherZoom).not.toBe(first);

    const promoted = nextManifest();
    serve("known", promoted);
    const afterPromotion = await index.countyOverview({ zoom: 9 });
    expect(afterPromotion).not.toBe(first);
    expect(afterPromotion.manifestCid).toBe(promoted);
  });

  it("escapes the usage type it interpolates into SQL", async () => {
    serve("known", nextManifest());
    const overview = await makeIndex().countyOverview({
      zoom: 9,
      propertyUsageType: "o'brien'; DROP VIEW crm_property; --",
    });
    expect(overview.cells).toEqual([]);
    expect(overview.counts.matched).toBe(0);
  });

  it("throws the typed not-ready error when no run has been promoted", async () => {
    ddbMock.on(GetCommand).resolves({});
    await expect(makeIndex().countyOverview({ zoom: 9 })).rejects.toBeInstanceOf(
      IndexNotReadyError,
    );
  });
});
