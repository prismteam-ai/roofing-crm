// Adapted from Oracle apps/api/test/query.test.ts (A-03 T062, G-C2a) for B-02 (T040). The Oracle
// file tested Task A's query.radius / query.roofAge routes (Zod bounds, query-core SQL, as_of from
// the manifest, a 1,000-row cap). This repo has no such routes. Its read surface is the LeadIndex
// port (apps/api/src/adapters/duckDbParquet.ts): indexInfo, searchProperties, searchPermits and
// getProperty over promoted Parquet. These cases exercise that port with real DuckDB reading
// Parquet built in-test. DynamoDB and S3 are aws-sdk-client-mock doubles; nothing reaches AWS.
import { createReadStream, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DuckDBInstance } from "@duckdb/node-api";
import { CrmPermit, CrmProperty } from "@crm/index-schema";
import { distanceMeters, milesToMeters } from "@crm/domain";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DuckDbParquetLeadIndex, IndexNotReadyError } from "../src/adapters/duckDbParquet.js";

// Promoted runs. Only MANIFEST_A is the pointer's current run until the cache test switches it.
const MANIFEST_A = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const MANIFEST_B = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsbbbb";
const PROMOTED_AT = "2026-10-21T10:35:16Z";

const propCid = (suffix: string) =>
  `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsprop${suffix}`;
const permitCid = (suffix: string) =>
  `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsperm${suffix}`;
const P1 = propCid("aaaa"); // Downtown, residential, roof 25 years
const P2 = propCid("bbbb"); // Commercial, roof 12 years
const P3 = propCid("cccc"); // No coordinates, no roof date
const K1 = permitCid("aaaa"); // P1, open, 340 days
const K2 = permitCid("bbbb"); // P1, closed, 12 days
const K3 = permitCid("cccc"); // P2, stalled, 500 days

type Missing = { field: string; reason: string };
type Cell = string | number | boolean | null | Missing[];

/** Typed SQL for one fixture cell, so every Parquet column has a fixed DuckDB type. */
function cell(value: Cell, type: string): string {
  if (value === null) return `CAST(NULL AS ${type})`;
  if (Array.isArray(value)) {
    const items = value.map((m) => `{'field': '${m.field}', 'reason': '${m.reason}'}`);
    return `CAST([${items.join(", ")}] AS ${type})`;
  }
  if (type === "VARCHAR") return `CAST('${String(value).replace(/'/g, "''")}' AS VARCHAR)`;
  return `CAST(${String(value)} AS ${type})`;
}

const MISSING_TYPE = "STRUCT(field VARCHAR, reason VARCHAR)[]";

const PROPERTY_TYPES: Record<string, string> = {
  propertyCid: "VARCHAR",
  requestIdentifier: "VARCHAR",
  latitude: "DOUBLE",
  longitude: "DOUBLE",
  coordinateSource: "VARCHAR",
  propertyType: "VARCHAR",
  propertyUsageType: "VARCHAR",
  roofAgeYears: "INTEGER",
  roofAgeBasis: "VARCHAR",
  roofAgeConfidence: "VARCHAR",
  isLongTenure: "BOOLEAN",
  tenureBasis: "VARCHAR",
  ownerName: "VARCHAR",
  structureBuiltYear: "INTEGER",
  lastSaleDate: "VARCHAR",
  tenureYears: "INTEGER",
  sourceUrl: "VARCHAR",
  ownerKind: "VARCHAR",
  ownerAreaClass: "VARCHAR",
  ownerIsOutOfArea: "BOOLEAN",
  sourceManifestCid: "VARCHAR",
  missingReasons: MISSING_TYPE,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

const PERMIT_TYPES: Record<string, string> = {
  propertyCid: "VARCHAR",
  permitCid: "VARCHAR",
  jurisdiction: "VARCHAR",
  permitNumber: "VARCHAR",
  improvementType: "VARCHAR",
  improvementAction: "VARCHAR",
  improvementStatus: "VARCHAR",
  statusClass: "VARCHAR",
  issueDate: "VARCHAR",
  finalDate: "VARCHAR",
  permitCloseDate: "VARCHAR",
  finalInspectionDate: "VARCHAR",
  openDays: "INTEGER",
  contractorResolution: "VARCHAR",
  contractorCompanyCid: "VARCHAR",
  contractorNameAsPrinted: "VARCHAR",
  bbbStatus: "VARCHAR",
  bbbStatusReason: "VARCHAR",
  bbbUrl: "VARCHAR",
  sourceUrl: "VARCHAR",
  sourceManifestCid: "VARCHAR",
  missingReasons: MISSING_TYPE,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

const common = {
  sourceManifestCid: MANIFEST_A,
  capturedAt: "2026-09-21T10:35:16Z",
  runId: "travis-202609-permits-20261021t103516z",
};

const PROPERTY_ROWS: Record<string, Cell>[] = [
  {
    ...common,
    propertyCid: P1,
    cid: P1,
    requestIdentifier: "R-1001",
    latitude: 30.2672,
    longitude: -97.7431,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 25,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    isLongTenure: true,
    tenureBasis: "sale_date",
    ownerName: null,
    structureBuiltYear: 1995,
    lastSaleDate: "2004-06-30",
    tenureYears: 22,
    sourceUrl: "https://example.test/tcad/1",
    ownerKind: "person",
    ownerAreaClass: "in_county",
    ownerIsOutOfArea: false,
    missingReasons: [],
  },
  {
    ...common,
    propertyCid: P2,
    cid: P2,
    requestIdentifier: "R-1002",
    latitude: 30.3,
    longitude: -97.7,
    coordinateSource: "permit_point",
    propertyType: "commercial",
    propertyUsageType: "commercial",
    roofAgeYears: 12,
    roofAgeBasis: "permit",
    roofAgeConfidence: "medium",
    isLongTenure: false,
    tenureBasis: "sale_date",
    ownerName: null,
    ownerKind: "company",
    ownerAreaClass: "regional",
    ownerIsOutOfArea: true,
    missingReasons: [],
  },
  {
    ...common,
    propertyCid: P3,
    cid: P3,
    requestIdentifier: "R-1003",
    latitude: null,
    longitude: null,
    coordinateSource: "none",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: null,
    roofAgeBasis: "unknown",
    roofAgeConfidence: "none",
    isLongTenure: null,
    tenureBasis: "sale_date",
    ownerName: null,
    ownerKind: "unknown",
    ownerAreaClass: "unknown",
    ownerIsOutOfArea: null,
    missingReasons: [
      { field: "roofAgeYears", reason: "no_roof_date" },
      { field: "latitude", reason: "no_coordinates" },
    ],
  },
];

const base = { ...common, missingReasons: [] as Missing[] };
const PERMIT_ROWS: Record<string, Cell>[] = [
  {
    ...base,
    propertyCid: P1,
    permitCid: K1,
    cid: K1,
    jurisdiction: "Austin",
    permitNumber: "2026-001",
    improvementType: "roof",
    improvementAction: "replace",
    improvementStatus: "Issued",
    statusClass: "open",
    issueDate: "2026-01-05",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 340,
    contractorResolution: "resolved",
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: "not_checked",
    bbbStatusReason: "contractor_unresolved",
    bbbUrl: null,
    sourceUrl: "https://data.austintexas.gov/resource/3syk-w9eu.json?permit_number=P-1",
  },
  {
    ...base,
    propertyCid: P1,
    permitCid: K2,
    cid: K2,
    jurisdiction: "Austin",
    permitNumber: "2025-044",
    improvementType: "roof",
    improvementAction: "repair",
    improvementStatus: "Final",
    statusClass: "closed",
    issueDate: "2025-03-01",
    finalDate: "2025-03-20",
    permitCloseDate: "2025-03-20",
    finalInspectionDate: "2025-03-19",
    openDays: 12,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: "not_checked",
    bbbStatusReason: "contractor_unresolved",
    bbbUrl: null,
  },
  {
    ...base,
    propertyCid: P2,
    permitCid: K3,
    cid: K3,
    jurisdiction: "Austin",
    permitNumber: "2024-310",
    improvementType: "roof",
    improvementAction: "replace",
    improvementStatus: null,
    statusClass: "stalled",
    issueDate: "2024-06-01",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 500,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: "not_checked",
    bbbStatusReason: "contractor_unresolved",
    bbbUrl: null,
  },
];

function parquetSql(rows: Record<string, Cell>[], types: Record<string, string>): string {
  return rows
    .map(
      (row) =>
        "SELECT " +
        Object.keys(types)
          .map(
            (column) => `${cell(row[column] ?? null, types[column] ?? "VARCHAR")} AS "${column}"`,
          )
          .join(", "),
    )
    .join(" UNION ALL ");
}

async function writeParquet(file: string, select: string): Promise<void> {
  // Scratch DuckDB writes the fixture files; only apps/*/src/engine is barred from @duckdb/node-api.
  const writer = await DuckDBInstance.create(":memory:");
  const connection = await writer.connect();
  await connection.run(`COPY (${select}) TO '${file}' (FORMAT parquet)`);
}

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("LeadIndex-query-test");

let fixtureDir: string;
let downloadDir: string;
let propertyFile: string;
let permitFile: string;

beforeAll(async () => {
  fixtureDir = mkdtempSync(join(tmpdir(), "crm-lead-index-fixtures-"));
  downloadDir = mkdtempSync(join(tmpdir(), "crm-lead-index-downloads-"));
  propertyFile = join(fixtureDir, "crm_property.parquet");
  permitFile = join(fixtureDir, "crm_permit.parquet");
  await writeParquet(propertyFile, parquetSql(PROPERTY_ROWS, PROPERTY_TYPES));
  await writeParquet(permitFile, parquetSql(PERMIT_ROWS, PERMIT_TYPES));
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
  rmSync(downloadDir, { recursive: true, force: true });
});

/** The pointer item: the promoted run every query reads. */
function promote(manifestCid: string): void {
  ddbMock.on(GetCommand).resolves({
    Item: {
      pk: "META#index",
      current: manifestCid,
      propertyCount: 3,
      permitCount: 3,
      promotedAt: PROMOTED_AT,
    },
  });
}

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  promote(MANIFEST_A);
  // Each part is served from the fixture files; the Key names the part, not the run.
  s3Mock.on(GetObjectCommand).callsFake((input) => ({
    Body: createReadStream(
      input.Key?.endsWith("crm_permit.parquet") ? permitFile : propertyFile,
    ) as unknown as GetObjectCommandOutput["Body"],
  }));
});

function makeIndex(): DuckDbParquetLeadIndex {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    // Generous for a local-file cold load; the INDEX_COLD_LOAD_TIMEOUT case lives in duckDbParquet.test.ts.
    coldLoadTimeoutMs: 30_000,
    tmpDir: downloadDir,
  });
}

const propertyCids = (rows: { propertyCid: string }[]) => rows.map((r) => r.propertyCid).sort();
const permitCids = (rows: { permitCid: string }[]) => rows.map((r) => r.permitCid);

describe("LeadIndex port over promoted Parquet (DuckDbParquetLeadIndex)", () => {
  it("indexInfo reports the promoted run from the META#index pointer", async () => {
    await expect(makeIndex().indexInfo()).resolves.toEqual({
      manifestCid: MANIFEST_A,
      propertyCount: 3,
      permitCount: 3,
      promotedAt: PROMOTED_AT,
    });
  });

  it("presentRequestIdentifiers returns only identifiers in the promoted run (quote-safe); empty input skips the query", async () => {
    const index = makeIndex();
    const present = await index.presentRequestIdentifiers(["R-1001", "R-9999", "O'Brien"]);
    expect([...present]).toEqual(["R-1001"]);
    s3Mock.reset();
    await expect(index.presentRequestIdentifiers([])).resolves.toEqual(new Set());
  });

  it("currentRunId reads the runId provenance column of the promoted run", async () => {
    await expect(makeIndex().currentRunId()).resolves.toBe(common.runId);
  });

  it("searchProperties returns every property, each carrying sourceManifestCid and passing the CrmProperty schema", async () => {
    const rows = await makeIndex().searchProperties({});
    expect(propertyCids(rows)).toEqual([P1, P2, P3].sort());
    for (const row of rows) {
      expect(row.sourceManifestCid).toBe(MANIFEST_A);
      expect(CrmProperty.safeParse(row).success, `${row.propertyCid} parses`).toBe(true);
    }
  });

  it("searchProperties bbox filters on latitude and longitude, dropping rows with no coordinates", async () => {
    const rows = await makeIndex().searchProperties({
      bbox: { south: 30.2, north: 30.3, west: -97.8, east: -97.6 },
    });
    expect(propertyCids(rows)).toEqual([P1, P2].sort());
  });

  it("searchProperties roofAgeMinYears keeps rows at or above the threshold and never a null roof age", async () => {
    expect(propertyCids(await makeIndex().searchProperties({ roofAgeMinYears: 20 }))).toEqual([P1]);
    expect(propertyCids(await makeIndex().searchProperties({ roofAgeMinYears: 10 }))).toEqual(
      [P1, P2].sort(),
    );
  });

  it("searchProperties propertyUsageType matches exactly, and a quote in the value cannot break the query", async () => {
    expect(
      propertyCids(await makeIndex().searchProperties({ propertyUsageType: "residential" })),
    ).toEqual([P1, P3].sort());
    await expect(
      makeIndex().searchProperties({ propertyUsageType: "resid'ential" }),
    ).resolves.toEqual([]);
  });

  it("searchProperties limit caps the rows returned", async () => {
    expect(await makeIndex().searchProperties({ limit: 1 })).toHaveLength(1);
  });

  // T043 (B-09/US2, G4 "owners outside the area"): P1 is in_county, P2 is regional, P3 is
  // unknown — a single value is an exact match, an array is an IN-list (the "outside the area"
  // shape, excluding in_county/unknown).
  it("searchProperties ownerAreaClass matches a single value exactly", async () => {
    expect(
      propertyCids(await makeIndex().searchProperties({ ownerAreaClass: "in_county" })),
    ).toEqual([P1]);
  });

  it("searchProperties ownerAreaClass accepts an array as an IN-list, a quote cannot break the query", async () => {
    expect(
      propertyCids(
        await makeIndex().searchProperties({ ownerAreaClass: ["regional", "out_of_area"] }),
      ),
    ).toEqual([P2]);
    await expect(makeIndex().searchProperties({ ownerAreaClass: ["region'al"] })).resolves.toEqual(
      [],
    );
  });

  // Owner filter "Tenure >= N": the index carries the stored `tenureYears` (P1=22, P2 and P3 null),
  // so the filter is exact and a row with no tenure never passes.
  it("searchProperties tenureYearsMin filters on the stored tenureYears, NULL tenure excluded", async () => {
    const index = makeIndex();
    expect(propertyCids(await index.searchProperties({ tenureYearsMin: 10 }))).toEqual([P1]);
    expect(propertyCids(await index.searchProperties({ tenureYearsMin: 22 }))).toEqual([P1]);
    expect(await index.searchProperties({ tenureYearsMin: 23 })).toEqual([]);
    expect(propertyCids(await index.searchProperties({ tenureYearsMin: 0 }))).toEqual([P1]);
  });

  it("searchPropertiesPage counts the rows a tenure filter left out for want of a tenure", async () => {
    const page = await makeIndex().searchPropertiesPage({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: 25,
      tenureYearsMin: 10,
    });
    expect(page.rows.map((r) => r.propertyCid)).toEqual([P1]);
    expect(page.afterFilters).toBe(1);
    expect(page.noTenure).toBe(1); // P2; P3 has no coordinates so is outside the circle
  });

  it("searchPropertiesPage out-of-area keeps regional and out_of_area owners", async () => {
    const page = await makeIndex().searchPropertiesPage({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: 25,
      ownerAreaClass: ["regional", "out_of_area"],
    });
    expect(page.rows.map((r) => r.propertyCid)).toEqual([P2]);
  });

  // An older index has no tenureYears column: the boolean isLongTenure rule applies as before.
  it("searchProperties tenureYearsMin falls back to isLongTenure on an index without tenureYears", async () => {
    const oldTypes = { ...PROPERTY_TYPES };
    delete oldTypes.tenureYears;
    const oldFile = join(fixtureDir, "old", "crm_property.parquet");
    mkdirSync(join(fixtureDir, "old"), { recursive: true });
    await writeParquet(oldFile, parquetSql(PROPERTY_ROWS, oldTypes));
    promote("bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsdddd");
    s3Mock.on(GetObjectCommand).callsFake((input) => ({
      Body: createReadStream(
        input.Key?.endsWith("crm_permit.parquet") ? permitFile : oldFile,
      ) as unknown as GetObjectCommandOutput["Body"],
    }));
    const index = makeIndex();
    expect(propertyCids(await index.searchProperties({ tenureYearsMin: 10 }))).toEqual([P1]);
    expect(propertyCids(await index.searchProperties({ tenureYearsMin: 5 }))).toEqual([P1]);
    const page = await index.searchPropertiesPage({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: 25,
      tenureYearsMin: 5,
    });
    expect(page.noTenure).toBe(0);
  });

  // T007 (B-03, US1): the extended SearchPropertiesQuery's center/radiusMi — a bbox prefilter via
  // packages/domain's bboxFor, then the exact-circle cut via distanceMeters, nearest-first sort
  // (contracts/search-api.md step 3; plan.md T012). P1 (30.2672, -97.7431) and P2 (30.3, -97.7)
  // are a known distance apart (~3.4 mi); a radius just short of it excludes P2, just past it
  // includes both, nearest first.
  it("searchProperties center/radiusMi applies the exact-circle cut, nearest first, over the bbox prefilter", async () => {
    const p1p2MilesApart =
      distanceMeters({ lat: 30.2672, lng: -97.7431 }, { lat: 30.3, lng: -97.7 }) / milesToMeters(1);
    expect(p1p2MilesApart).toBeGreaterThan(0); // sanity: a real, non-zero distance

    const justShort = await makeIndex().searchProperties({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: Math.max(0.5, p1p2MilesApart - 0.5),
    });
    expect(propertyCids(justShort)).toEqual([P1]); // P2 and P3 (no coordinates) are excluded

    const bothIn = await makeIndex().searchProperties({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: Math.min(25, p1p2MilesApart + 0.5),
    });
    expect(propertyCids(bothIn)).toEqual([P1, P2].sort());
    // Nearest first: P1 is the center itself (distance 0), so it comes before P2.
    expect(bothIn[0]?.propertyCid).toBe(P1);
  });

  it("searchProperties center/radiusMi never includes a property with no coordinates", async () => {
    const rows = await makeIndex().searchProperties({
      center: { lat: 30.2672, lng: -97.7431 },
      radiusMi: 25,
    });
    expect(propertyCids(rows)).not.toContain(P3);
  });

  it("searchPermits isOpen reads the stored statusClass verbatim", async () => {
    expect(permitCids(await makeIndex().searchPermits({ isOpen: true }))).toEqual([K1]);
    expect(permitCids(await makeIndex().searchPermits({ isOpen: false })).sort()).toEqual(
      [K2, K3].sort(),
    );
  });

  it("searchPermits openDaysMinimum and the default openDays sort, descending", async () => {
    expect(permitCids(await makeIndex().searchPermits({ openDaysMinimum: 100 })).sort()).toEqual(
      [K1, K3].sort(),
    );
    expect(permitCids(await makeIndex().searchPermits({}))).toEqual([K3, K1, K2]);
  });

  it("searchPermits sort issueDate is ascending by issue date", async () => {
    expect(permitCids(await makeIndex().searchPermits({ sort: "issueDate" }))).toEqual([
      K3,
      K2,
      K1,
    ]);
  });

  // T044 (B-09/US2, G5 "exact permit lookup"): K1="2026-001", independent of the propertyCid/
  // propertyCids scoping — a quote in the value is escaped the same way every other string
  // filter in this adapter is.
  it("searchPermits permitNumber matches exactly, and a quote in the value cannot break the query", async () => {
    expect(permitCids(await makeIndex().searchPermits({ permitNumber: "2026-001" }))).toEqual([K1]);
    await expect(makeIndex().searchPermits({ permitNumber: "2026-00'1" })).resolves.toEqual([]);
  });

  it("searchPermits propertyCid returns only that property's permits, each passing the CrmPermit schema", async () => {
    const rows = await makeIndex().searchPermits({ propertyCid: P1 });
    expect(permitCids(rows).sort()).toEqual([K1, K2].sort());
    for (const row of rows)
      expect(CrmPermit.safeParse(row).success, `${row.permitCid} parses`).toBe(true);
  });

  it("getProperty returns the property with its permits nested, and null for a CID outside the promoted run", async () => {
    const found = await makeIndex().getProperty(P1);
    expect(found).not.toBeNull();
    const { permits, ...property } = found ?? { permits: [] };
    expect(CrmProperty.safeParse(property).success).toBe(true);
    expect(permitCids(permits).sort()).toEqual([K1, K2].sort());

    await expect(makeIndex().getProperty(propCid("zzzz"))).resolves.toBeNull();
  });

  it("every query throws IndexNotReadyError before any run has been promoted, and loads nothing", async () => {
    ddbMock.reset();
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const index = makeIndex();
    await expect(index.searchProperties({})).rejects.toThrow(IndexNotReadyError);
    await expect(index.searchPermits({})).rejects.toThrow(IndexNotReadyError);
    await expect(index.getProperty(P1)).rejects.toThrow(IndexNotReadyError);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it("ADR-01 cache: a promoted run is downloaded once per sandbox (two parts), however many queries follow", async () => {
    ddbMock.reset();
    promote(MANIFEST_B); // A run no earlier test has loaded, so this test sees its cold load.
    const index = makeIndex();
    await index.searchProperties({});
    await index.searchPermits({});
    await index.getProperty(P2);
    await index.searchProperties({ roofAgeMinYears: 1 });
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
  });

  // Found in T040, fixed directly in apps/sync/handlers/buildIndex.ts: writing the index with
  // read_json_auto let DuckDB infer BIGINT for whole numbers and DATE for ISO date strings, so
  // the port read those back as bigint/Date and failed CrmProperty's/CrmPermit's number/string
  // validation. The fix is an explicit `columns =` map on read_json (verified locally: INTEGER
  // comes back as JS number, VARCHAR stays a string, never auto-inferred). This test mirrors
  // that same column map to prove the real write path, end to end, produces schema-valid rows.
  it("rows parse as CrmProperty and CrmPermit when the index is written with explicit column types", async () => {
    const MISSING_STRUCT_LIST = "STRUCT(field VARCHAR, reason VARCHAR)[]";
    const propertyColumns =
      "{propertyCid: 'VARCHAR', requestIdentifier: 'VARCHAR', latitude: 'DOUBLE', " +
      "longitude: 'DOUBLE', coordinateSource: 'VARCHAR', propertyType: 'VARCHAR', " +
      "propertyUsageType: 'VARCHAR', roofAgeYears: 'INTEGER', roofAgeBasis: 'VARCHAR', " +
      "roofAgeConfidence: 'VARCHAR', isLongTenure: 'BOOLEAN', tenureBasis: 'VARCHAR', ownerName: 'VARCHAR', structureBuiltYear: 'INTEGER', lastSaleDate: 'VARCHAR', tenureYears: 'INTEGER', sourceUrl: 'VARCHAR', ownerKind: 'VARCHAR', " +
      "ownerAreaClass: 'VARCHAR', ownerIsOutOfArea: 'BOOLEAN', sourceManifestCid: 'VARCHAR', " +
      `missingReasons: '${MISSING_STRUCT_LIST}', capturedAt: 'VARCHAR', cid: 'VARCHAR', runId: 'VARCHAR'}`;
    const permitColumns =
      "{propertyCid: 'VARCHAR', permitCid: 'VARCHAR', jurisdiction: 'VARCHAR', " +
      "permitNumber: 'VARCHAR', improvementType: 'VARCHAR', improvementAction: 'VARCHAR', " +
      "improvementStatus: 'VARCHAR', statusClass: 'VARCHAR', issueDate: 'VARCHAR', " +
      "finalDate: 'VARCHAR', permitCloseDate: 'VARCHAR', finalInspectionDate: 'VARCHAR', " +
      "openDays: 'INTEGER', contractorResolution: 'VARCHAR', contractorCompanyCid: 'VARCHAR', contractorNameAsPrinted: 'VARCHAR', bbbStatus: 'VARCHAR', bbbStatusReason: 'VARCHAR', bbbUrl: 'VARCHAR', sourceUrl: 'VARCHAR', " +
      `sourceManifestCid: 'VARCHAR', missingReasons: '${MISSING_STRUCT_LIST}', capturedAt: 'VARCHAR', cid: 'VARCHAR', runId: 'VARCHAR'}`;

    const jsonDir = mkdtempSync(join(tmpdir(), "crm-json-index-"));
    try {
      const propertyJson = join(jsonDir, "crm_property.json");
      const permitJson = join(jsonDir, "crm_permit.json");
      writeFileSync(propertyJson, PROPERTY_ROWS.map((row) => JSON.stringify(row)).join("\n"));
      writeFileSync(permitJson, PERMIT_ROWS.map((row) => JSON.stringify(row)).join("\n"));
      const propertyParquet = join(jsonDir, "crm_property.parquet");
      const permitParquet = join(jsonDir, "crm_permit.parquet");
      await writeParquet(
        propertyParquet,
        `SELECT * FROM read_json('${propertyJson}', columns = ${propertyColumns})`,
      );
      await writeParquet(
        permitParquet,
        `SELECT * FROM read_json('${permitJson}', columns = ${permitColumns})`,
      );

      const MANIFEST_C = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsccccc";
      promote(MANIFEST_C);
      s3Mock.on(GetObjectCommand).callsFake((input) => ({
        Body: createReadStream(
          input.Key?.endsWith("crm_permit.parquet") ? permitParquet : propertyParquet,
        ) as unknown as GetObjectCommandOutput["Body"],
      }));

      const index = makeIndex();
      for (const row of await index.searchProperties({})) {
        expect(CrmProperty.safeParse(row).success, `${row.propertyCid} as CrmProperty`).toBe(true);
      }
      for (const row of await index.searchPermits({})) {
        expect(CrmPermit.safeParse(row).success, `${row.permitCid} as CrmPermit`).toBe(true);
      }
    } finally {
      rmSync(jsonDir, { recursive: true, force: true });
    }
  });
});
