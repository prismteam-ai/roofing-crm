// BuildIndex (T015/T017, INDEX group, espeon): the one step the contract forbids from making any
// network call to Task A or a gateway (contracts/sync-pipeline.md). It receives this run's
// already-verified parts (fetched and sha256-checked by FetchPart, machamp's step) from S3,
// binds them with vendored packages/oracle-views' bindManifest() (never re-deriving
// status_class/open_days/roof age — ADR-07), and Zod-validates every row against
// packages/index-schema before it is ever written out as crm_property/crm_permit Parquet.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInMemoryConnection,
  duckDbOptionsFromEnv,
  type DuckDBConnection,
} from "../src/engine/duckdb.js";
import { contentAddressedKey } from "./fetchPart.js";
import { downloadS3ObjectToFile, withObservability, type Observability } from "@crm/observability";
import { CrmPermit, CrmProperty, type Missing } from "@crm/index-schema";
import { bindManifest, type BoundRun } from "@crm/oracle-views";
import {
  BUILD_INDEX_VIEWS,
  batchCoverage,
  manifestTableArtifactNames,
  type BatchCoverage,
} from "../src/batchCoverage.js";

export { batchCoverage, manifestTableArtifactNames, type BatchCoverage };
import type { QueryEngine, Row } from "@crm/oracle-views";

/** One row of the bound v_property view, as DuckDB returns it (snake_case, verbatim column
 *  names from packages/oracle-contract/src/columns.ts). */
export type ViewRow = Record<string, unknown>;

/** DuckDB column types for `read_json`, matching packages/index-schema's CrmProperty/CrmPermit
 *  shape exactly. Without this, `read_json_auto` infers BIGINT for whole numbers and
 *  DATE/TIMESTAMP for ISO date strings, so the port reads back `bigint`/`Date` values that fail
 *  CrmProperty/CrmPermit's `number`/`string` validation (found in T040's query.test.ts). */
const MISSING_STRUCT_LIST = "STRUCT(field VARCHAR, reason VARCHAR)[]";

export const CRM_PROPERTY_COLUMNS: Record<string, string> = {
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
  unnormalizedAddress: "VARCHAR",
  ownerMailingPostalCode: "VARCHAR",
  ownerMailingStateCode: "VARCHAR",
  structureBuiltYear: "INTEGER",
  lastSaleDate: "VARCHAR",
  tenureYears: "INTEGER",
  sourceUrl: "VARCHAR",
  ownerKind: "VARCHAR",
  ownerAreaClass: "VARCHAR",
  ownerIsOutOfArea: "BOOLEAN",
  sourceManifestCid: "VARCHAR",
  missingReasons: MISSING_STRUCT_LIST,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

export const CRM_PERMIT_COLUMNS: Record<string, string> = {
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
  missingReasons: MISSING_STRUCT_LIST,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

export function duckDbColumnsClause(columns: Record<string, string>): string {
  const entries = Object.entries(columns).map(([name, type]) => `${name}: '${type}'`);
  return `{${entries.join(", ")}}`;
}

function asMissing(value: unknown): Missing[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => {
    const entry = m as { field: string; reason: string };
    return { field: entry.field, reason: entry.reason as Missing["reason"] };
  });
}

/** DuckDB returns TIMESTAMP/DATE columns from v_property/v_roofing_permit as native JS `Date`
 *  objects, but every date-ish CrmProperty/CrmPermit field is a plain string (ISO 8601, carried
 *  verbatim from the source) — found live (ZodError on BuildIndex's first real run). */
function isoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : (value as string);
}

function nullableIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isoString(value);
}

/** A DATE column as YYYY-MM-DD (a native Date from DuckDB, or an ISO string); null when absent. */
function dateOnly(value: unknown): string | null {
  const iso = nullableIsoString(value);
  return iso === null ? null : iso.slice(0, 10);
}

/**
 * Maps one bound v_property row into the CRM's own CrmProperty shape and Zod-validates it.
 * Every field not carried into data-model.md's crm_property table (parcel_identifier,
 * area_list_sha256) is dropped here on purpose, per data-model.md's slimmer field list.
 * property_structure_built_year, last_ownership_transfer_date, tenure_years and source_url are
 * carried (additive) so the screen can show the roof basis, last sale, tenure and source record.
 * owner_name is carried since the 2026-10-25 amendment of ADR-03 (shown, never sent to the model). A null field
 * keeps its exact missing reason (row.missing, verbatim) — this function never guesses or
 * interpolates a replacement value (FR-003).
 */
export function mapPropertyRow(row: ViewRow, sourceManifestCid: string): CrmProperty {
  return CrmProperty.parse({
    propertyCid: row.property_cid,
    requestIdentifier: row.request_identifier,
    latitude: row.latitude,
    longitude: row.longitude,
    coordinateSource: row.coordinate_source,
    propertyType: row.property_type,
    propertyUsageType: row.property_usage_type,
    roofAgeYears: row.roof_age_years,
    roofAgeBasis: row.roof_age_basis,
    roofAgeConfidence: row.roof_age_confidence,
    isLongTenure: row.is_long_tenure,
    tenureBasis: row.tenure_basis,
    ownerName: row.owner_name,
    unnormalizedAddress: row.unnormalized_address,
    ownerMailingPostalCode: row.owner_mailing_postal_code,
    ownerMailingStateCode: row.owner_mailing_state_code,
    structureBuiltYear: row.property_structure_built_year ?? null,
    lastSaleDate: dateOnly(row.last_ownership_transfer_date),
    tenureYears: row.tenure_years ?? null,
    sourceUrl: row.source_url ?? null,
    ownerKind: row.owner_kind,
    ownerAreaClass: row.owner_area_class,
    ownerIsOutOfArea: row.owner_is_out_of_area,
    sourceManifestCid,
    missingReasons: asMissing(row.missing),
    capturedAt: isoString(row.captured_at),
    cid: row.cid,
    runId: row.run_id,
  });
}

/** Maps one bound v_roofing_permit row into CrmPermit. statusClass/isOpen are read verbatim from
 *  the vendored query-core derivation — never recomputed here (contracts/lead-index-port.md). */
export function mapPermitRow(row: ViewRow, sourceManifestCid: string): CrmPermit {
  return CrmPermit.parse({
    propertyCid: row.property_cid,
    permitCid: row.permit_cid,
    jurisdiction: row.jurisdiction,
    permitNumber: row.permit_number,
    improvementType: row.improvement_type,
    improvementAction: row.improvement_action,
    improvementStatus: row.improvement_status,
    statusClass: row.status_class,
    issueDate: nullableIsoString(row.issue_date),
    finalDate: nullableIsoString(row.final_date),
    permitCloseDate: nullableIsoString(row.permit_close_date),
    finalInspectionDate: nullableIsoString(row.final_inspection_date),
    openDays: row.open_days,
    contractorResolution: row.contractor_resolution,
    contractorCompanyCid: row.contractor_company_cid,
    contractorNameAsPrinted: row.contractor_name_as_printed,
    bbbStatus: row.bbb_status,
    bbbStatusReason: row.bbb_status_reason,
    bbbUrl: row.bbb_url,
    sourceUrl: row.source_url ?? null,
    sourceManifestCid,
    missingReasons: asMissing(row.missing),
    capturedAt: isoString(row.captured_at),
    cid: row.cid,
    runId: row.run_id,
  });
}

export interface BuildIndexResult {
  properties: CrmProperty[];
  permits: CrmPermit[];
}

/**
 * The network-free core (contracts/sync-pipeline.md: "Must not make any network call to Task A
 * or any gateway"): given an already-bound QueryEngine (BuildIndex's caller has already loaded
 * this run's verified parts into it — no fetch happens in here, by construction, since `engine`
 * only ever runs SQL against whatever DuckDB already has loaded locally), reads v_property and
 * v_roofing_permit and maps+validates every row.
 */
export async function buildIndexCore(
  engine: QueryEngine,
  sourceManifestCid: string,
): Promise<BuildIndexResult> {
  const propertyRows = (await engine.all("SELECT * FROM v_property")) as Row[];
  const permitRows = (await engine.all("SELECT * FROM v_roofing_permit")) as Row[];
  return {
    properties: propertyRows.map((row) => mapPropertyRow(row, sourceManifestCid)),
    permits: permitRows.map((row) => mapPermitRow(row, sourceManifestCid)),
  };
}

export interface BuildIndexPart {
  /** e.g. tables/county/property/part-00000.parquet (Plan's PlanPart.path, verbatim). */
  path: string;
}

export interface BuildIndexEvent {
  bucket: string;
  manifestCid: string;
  /** S3 key of the raw manifest JSON bytes, already verified by FetchPart. */
  manifestKey: string;
  /** This run's verified table parts (Plan.parts, the same list FetchPart's Map iterated over).
   *  Each part's S3 key is derived here with the identical content-addressed formula FetchPart
   *  used to write it (`sha256(manifestCid + path)`) — never a separately-recorded key, so the
   *  two steps can never drift out of sync on where a part actually landed. */
  parts: BuildIndexPart[];
  /** Plan's own values, echoed into BuildIndexOutput below purely as pass-through state (the
   *  Step Functions payload replaces itself at every LambdaInvoke's outputPath, so anything
   *  Validate or Promote needs has to ride through this step, not just Plan's). */
  /** The manifest's `coverage.parcels_published.count`, or null when Task A does not publish it
   *  (full-county manifests). */
  coverageParcelsPublished: number | null;
  /** The manifest's `coverage.permits_emitted.count` (Task A's own publish gate compares
   *  v_roofing_permit against it), or null when absent. Optional for older in-flight payloads. */
  coveragePermitsEmitted?: number | null;
  finishedAt: string;
  /** Plan's run-start timestamp — Promote (T022) reads this back (as `planStartedAt`) to
   *  compute SyncDurationMs, two steps after BuildIndex. */
  startedAt: string;
  /** The FetchPartsMap's per-item results (one per part) — present only because the state
   *  machine keeps the Map's output rather than discarding it. Reduced to `anyPartUnverified`
   *  below; BuildIndex never otherwise reads these. */
  fetchResults?: { status: string }[];
}

export interface BuildIndexOutput {
  manifestCid: string;
  /** Echoed from the event — Validate's own S3 reads need it too, and LambdaInvoke's
   *  outputPath: "$.Payload" replaces the whole state with just this return value. */
  bucket: string;
  propertyCount: number;
  permitCount: number;
  propertyKey: string;
  permitKey: string;
  coverageParcelsPublished: number | null;
  coveragePermitsEmitted: number | null;
  finishedAt: string;
  /** Echoed from the event — Promote reads this back two steps later. */
  startedAt: string;
  /** T020a: true when any part in this run was routed to the DLQ as unverified — Validate holds
   *  the whole run on this signal alone, before evaluating row counts (constitution P0-2). */
  anyPartUnverified: boolean;
  /** B-09 review fix: which manifest batches were bound and contributed rows — Validate holds on
   *  any gap (src/batchCoverage.ts). */
  batchCoverage: BatchCoverage;
}

const s3 = new S3Client({});

async function downloadToFile(bucket: string, key: string, destPath: string): Promise<void> {
  await downloadS3ObjectToFile(s3, bucket, key, destPath);
}

/**
 * Streams one bound view through map+validate into an NDJSON file, one DuckDB chunk (~2,048 rows)
 * at a time — B-09 full-county sizing. The earlier path read every row into one JS array and
 * `JSON.stringify`-ed the whole array before COPY: at 441,961 properties that is ~1 GB of JS
 * objects plus a single string near V8's ~512M-character limit, a real OOM/RangeError risk at the
 * function's memory size. Each line is the same validated CrmProperty/CrmPermit object as before,
 * so the Parquet written from it has the identical schema. Returns the row count.
 */
async function streamViewToNdjson<T>(
  connection: DuckDBConnection,
  sql: string,
  destPath: string,
  mapRow: (row: ViewRow) => T,
): Promise<number> {
  const out = createWriteStream(destPath, { encoding: "utf8" });
  let count = 0;
  try {
    const result = await connection.stream(sql);
    for await (const rows of result.yieldRowObjectJs()) {
      if (rows.length === 0) continue;
      const lines = rows.map((row) => JSON.stringify(mapRow(row))).join("\n") + "\n";
      count += rows.length;
      if (!out.write(lines)) await once(out, "drain");
    }
    out.end();
    await finished(out);
    return count;
  } catch (error) {
    out.destroy();
    throw error;
  }
}

// BUILD_INDEX_VIEWS (src/batchCoverage.ts): the two contract views BuildIndex reads —
// bindManifest binds only the export tables these need (query-core's ERR-19 view plan), not all
// 204 full-county parts' tables.

export interface BuildIndexFilesInput {
  manifestCid: string;
  /** The manifest JSON bytes (already verified against manifestCid by Plan). */
  manifestBytes: Uint8Array;
  /** Local path of one verified part, from its manifest artifact name. */
  partFile: (artifactName: string) => string;
  /** Scratch directory for NDJSON, Parquet output and DuckDB's spill files. */
  workDir: string;
}

export interface BuildIndexFiles {
  propertyCount: number;
  permitCount: number;
  propertyFile: string;
  permitFile: string;
  batchCoverage: BatchCoverage;
}

/** Row count per `_part` of the bound county.property relation (empty when it was not emitted —
 *  then there is nothing to count, and every county batch reports empty). */
async function countyPropertyRowsByPart(
  engine: QueryEngine,
  bound: BoundRun,
): Promise<Map<string, number>> {
  const property = (bound.tables ?? []).find(
    (t) => t.group === "county" && t.table === "property" && t.emitted,
  );
  if (property === undefined) return new Map();
  const rows = await engine.all(
    "SELECT _part AS part, count(*) AS n FROM county.property GROUP BY _part",
  );
  return new Map(rows.map((r) => [String(r.part), Number(r.n)]));
}

/**
 * The S3-free core of BuildIndex: binds already-downloaded, verified parts with the vendored
 * query-core bindManifest, streams v_property/v_roofing_permit through map+validate, and writes
 * crm_property/crm_permit Parquet into `workDir`. Every part is bound by an explicit `partUrl`:
 * full-county manifests batch their tables as `.../tables/bNN/<table>/part-NNNNN.parquet` (10
 * batches), so bindManifest's default `<tablesDir>/<group>/<table>/<part>` layout would make
 * same-named parts of different batches collide. Also runnable locally (no AWS) against real
 * parts, which is how the full-county build time was first measured.
 */
export async function buildIndexFiles(
  input: BuildIndexFilesInput,
  obs?: Pick<Observability, "logger">,
): Promise<BuildIndexFiles> {
  const spillDir = join(input.workDir, "duckdb-spill");
  await mkdir(spillDir, { recursive: true });
  // memory_limit + a /tmp spill directory: DuckDB spills the view joins to ephemeral storage
  // instead of OOM-ing the function (CrmSyncStack sizes both per function).
  const connection = await createInMemoryConnection(duckDbOptionsFromEnv(process.env, spillDir));
  try {
    await connection.run("SET TimeZone = 'UTC'");
    const engine: QueryEngine = {
      run: async (sql: string) => {
        await connection.run(sql);
      },
      all: async (sql: string) => {
        const reader = await connection.runAndReadAll(sql);
        return reader.getRowObjectsJS() as Row[];
      },
    };

    const bound = await bindManifest(input.manifestBytes, input.workDir, engine, {
      partUrl: ({ name }) => input.partFile(name),
      views: BUILD_INDEX_VIEWS,
    });
    const coverage = batchCoverage({
      tableArtifactNames: manifestTableArtifactNames(input.manifestBytes),
      boundTables: bound.tables ?? [],
      countyPropertyRowsByPart: await countyPropertyRowsByPart(engine, bound),
    });
    if (coverage.unboundBatches.length > 0 || coverage.emptyCountyBatches.length > 0) {
      obs?.logger.warn("BuildIndex: manifest batches missing from the bound index", {
        ...coverage,
      });
    }

    // Write the already-validated CrmProperty/CrmPermit rows (camelCase, index-schema shape) —
    // never the raw view rows — as Parquet, via an NDJSON round-trip DuckDB reads back typed.
    const propertyJson = join(input.workDir, "crm_property.ndjson");
    const permitJson = join(input.workDir, "crm_permit.ndjson");
    const propertyCount = await streamViewToNdjson(
      connection,
      "SELECT * FROM v_property",
      propertyJson,
      (row) => mapPropertyRow(row, input.manifestCid),
    );
    const permitCount = await streamViewToNdjson(
      connection,
      "SELECT * FROM v_roofing_permit",
      permitJson,
      (row) => mapPermitRow(row, input.manifestCid),
    );
    obs?.logger.info("BuildIndex: rows mapped and validated", { propertyCount, permitCount });

    const propertyFile = join(input.workDir, "crm_property.parquet");
    const permitFile = join(input.workDir, "crm_permit.parquet");
    await connection.run(
      `COPY (SELECT * FROM read_json('${propertyJson}', format = 'newline_delimited', columns = ${duckDbColumnsClause(CRM_PROPERTY_COLUMNS)})) TO '${propertyFile}' (FORMAT parquet)`,
    );
    await connection.run(
      `COPY (SELECT * FROM read_json('${permitJson}', format = 'newline_delimited', columns = ${duckDbColumnsClause(CRM_PERMIT_COLUMNS)})) TO '${permitFile}' (FORMAT parquet)`,
    );
    rmSync(propertyJson, { force: true });
    rmSync(permitJson, { force: true });
    return { propertyCount, permitCount, propertyFile, permitFile, batchCoverage: coverage };
  } finally {
    connection.closeSync();
  }
}

async function buildIndexCoreFromEvent(
  event: BuildIndexEvent,
  obs: Observability,
): Promise<BuildIndexOutput> {
  const tmpDir = mkdtempSync(join(tmpdir(), "crm-build-index-"));
  try {
    const manifestPath = join(tmpDir, "manifest.json");
    await downloadToFile(event.bucket, event.manifestKey, manifestPath);
    const manifestBytes = new Uint8Array(await readFile(manifestPath));

    // Each part is stored under its content-addressed key — the same `sha256(manifestCid + path)`
    // FetchPart wrote it to S3 under — so no path from the manifest ever shapes a local path.
    const partsDir = join(tmpDir, "parts");
    await mkdir(partsDir, { recursive: true });
    // Plan lists exactly the parts bindManifest reads for the two views (boundPartNames). If the
    // two ever drift, fail here by name — never read a part that was not fetched and verified.
    const listed = new Set(event.parts.map((part) => part.path));
    const partFile = (path: string): string => {
      if (!listed.has(path)) {
        throw new Error(
          `BuildIndex: bindManifest asked for part "${path}", not in Plan's part list`,
        );
      }
      return join(partsDir, `${contentAddressedKey(event.manifestCid, path)}.parquet`);
    };
    for (const part of event.parts) {
      const s3Key = contentAddressedKey(event.manifestCid, part.path);
      await downloadToFile(event.bucket, s3Key, partFile(part.path));
    }

    const built = await buildIndexFiles(
      { manifestCid: event.manifestCid, manifestBytes, partFile, workDir: tmpDir },
      obs,
    );

    const propertyKey = `index/${event.manifestCid}/crm_property.parquet`;
    const permitKey = `index/${event.manifestCid}/crm_permit.parquet`;
    await s3.send(
      new PutObjectCommand({
        Bucket: event.bucket,
        Key: propertyKey,
        Body: await readFile(built.propertyFile),
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: event.bucket,
        Key: permitKey,
        Body: await readFile(built.permitFile),
      }),
    );

    return {
      manifestCid: event.manifestCid,
      bucket: event.bucket,
      propertyCount: built.propertyCount,
      permitCount: built.permitCount,
      propertyKey,
      permitKey,
      coverageParcelsPublished: event.coverageParcelsPublished,
      coveragePermitsEmitted: event.coveragePermitsEmitted ?? null,
      finishedAt: event.finishedAt,
      startedAt: event.startedAt,
      anyPartUnverified: (event.fetchResults ?? []).some((r) => r.status === "dlq"),
      batchCoverage: built.batchCoverage,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const buildIndexHandler = withObservability("BuildIndex", buildIndexCoreFromEvent);
