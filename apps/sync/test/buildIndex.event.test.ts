// Covers BuildIndex's event-driven wrapper (apps/sync/handlers/buildIndex.ts,
// buildIndexCoreFromEvent / buildIndexHandler, lines ~233-330), which the fixture-engine tests in
// buildIndex.test.ts deliberately skip (per that file's own comment: "it proves the
// mapping/validation core, not the S3/DuckDB plumbing around it"). This file exercises that
// plumbing instead: downloading the manifest + verified parts from S3, binding them (bindManifest
// is stubbed here so this stays a unit test, not a full Oracle-profile fixture build), running the
// real in-memory DuckDB connection (src/engine/duckdb.ts) to map+validate rows and actually write
// Parquet via `COPY ... TO ... (FORMAT parquet)`, then uploading both files back to S3.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryEngine } from "@crm/oracle-views";
import { createInMemoryConnection } from "../src/engine/duckdb.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// How many rows each stubbed view yields. Defaults to 1 (the original fixture); the streaming
// tests below raise it past DuckDB's 2,048-row vector size to prove BuildIndex writes every chunk,
// and drop it to 0 to prove an empty view still produces a valid, correctly-typed Parquet file.
const viewRows = vi.hoisted(() => ({ property: 1, permit: 1 }));

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const PROPERTY_CID = "baguqeeraqc3y3bh65rbd42zgdrkctaulckvvidmgb52pghyansb43vumoh6q";
const PERMIT_CID = "baguqeeraqxod4kdmjfpzqdu36b5jyvb5fe4mdlmvxolgukqvugex7hkwgdtq";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";

// bindManifest is the heavy Oracle-profile machinery (manifest schema validation against the
// vendored profile digest) — out of scope here (owned/tested by packages/oracle-views). BuildIndex
// only ever calls it and then queries whatever views it created, so a stub that creates the same
// v_property/v_roofing_permit shape directly in the real DuckDB connection proves BuildIndex's own
// orchestration (download -> bind -> map/validate -> write Parquet -> upload) without re-testing
// bindManifest's internals.
vi.mock("@crm/oracle-views", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@crm/oracle-views")>();
  return {
    ...actual,
    bindManifest: vi.fn(
      async (_manifestBytes: Uint8Array, _tablesDir: string, engine: QueryEngine) => {
        await engine.run(`
        CREATE VIEW v_property AS SELECT
          '${PROPERTY_CID}' AS property_cid,
          '0208011301' AS request_identifier,
          30.26 AS latitude,
          -97.74 AS longitude,
          'gis_centroid' AS coordinate_source,
          'SingleFamily' AS property_type,
          'Residential' AS property_usage_type,
          18 AS roof_age_years,
          'built_year' AS roof_age_basis,
          'low' AS roof_age_confidence,
          CAST(NULL AS BOOLEAN) AS is_long_tenure,
          CAST(NULL AS VARCHAR) AS tenure_basis,
          CAST(NULL AS VARCHAR) AS owner_name,
          CAST(NULL AS VARCHAR) AS owner_kind,
          'unknown' AS owner_area_class,
          CAST(NULL AS BOOLEAN) AS owner_is_out_of_area,
          []::STRUCT(field VARCHAR, reason VARCHAR)[] AS missing,
          TIMESTAMP '2026-10-21 10:35:59.798' AS captured_at,
          '${RUN_CID}' AS cid,
          'travis-202609-permits-20261021t103516z' AS run_id
        FROM range(${viewRows.property})
      `);
        await engine.run(`
        CREATE VIEW v_roofing_permit AS SELECT
          '${PROPERTY_CID}' AS property_cid,
          '${PERMIT_CID}' AS permit_cid,
          'austin' AS jurisdiction,
          '2026-123456 RP' AS permit_number,
          'Roofing' AS improvement_type,
          'Replacement' AS improvement_action,
          'Completed' AS improvement_status,
          'closed' AS status_class,
          '2026-09-02' AS issue_date,
          '2026-09-10' AS final_date,
          '2026-09-10' AS permit_close_date,
          '2026-09-10' AS final_inspection_date,
          8 AS open_days,
          'resolved' AS contractor_resolution,
          CAST(NULL AS VARCHAR) AS contractor_company_cid,
          CAST(NULL AS VARCHAR) AS contractor_name_as_printed,
          CAST(NULL AS VARCHAR) AS bbb_status,
          CAST(NULL AS VARCHAR) AS bbb_status_reason,
          CAST(NULL AS VARCHAR) AS bbb_url,
          []::STRUCT(field VARCHAR, reason VARCHAR)[] AS missing,
          TIMESTAMP '2026-10-21 10:35:59.798' AS captured_at,
          '${RUN_CID}' AS cid,
          'travis-202609-permits-20261021t103516z' AS run_id
        FROM range(${viewRows.permit})
      `);
        return {} as never;
      },
    ),
  };
});

const { buildIndexHandler } = await import("../handlers/buildIndex.js");

const s3Mock = mockClient(S3Client);

function manifestGetResponse() {
  return { Body: Readable.from([Buffer.from("{}")]) };
}

describe("BuildIndex: event-driven handler (S3 download/upload, real DuckDB, real Parquet write)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).resolves(manifestGetResponse() as never);
    s3Mock.on(PutObjectCommand).resolves({});
  });

  afterEach(() => {
    s3Mock.restore();
    viewRows.property = 1;
    viewRows.permit = 1;
  });

  it("downloads manifest+parts, maps/validates rows, writes real Parquet, and uploads both files", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [
        { path: "tables/county/property/part-00000.parquet" },
        { path: "tables/county/geometry/part-00000.parquet" },
      ],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
      fetchResults: [{ status: "ok" }, { status: "ok" }],
    } as never);

    expect(result.manifestCid).toBe(MANIFEST_CID);
    expect(result.bucket).toBe("crm-index-test");
    expect(result.propertyCount).toBe(1);
    expect(result.permitCount).toBe(1);
    expect(result.propertyKey).toBe(`index/${MANIFEST_CID}/crm_property.parquet`);
    expect(result.permitKey).toBe(`index/${MANIFEST_CID}/crm_permit.parquet`);
    expect(result.coverageParcelsPublished).toBe(1);
    expect(result.finishedAt).toBe("2026-10-21T10:40:04.525Z");
    expect(result.startedAt).toBe("2026-10-21T10:30:00.000Z");
    expect(result.anyPartUnverified).toBe(false);

    // Real Parquet bytes were actually written and uploaded (not just a mocked no-op): the
    // uploaded crm_property/crm_permit PutObject bodies carry the Parquet magic bytes "PAR1" at
    // both start and end of the file (the DuckDB COPY ... (FORMAT parquet) path, lines ~290-297).
    const puts = s3Mock.commandCalls(PutObjectCommand);
    expect(puts).toHaveLength(2);
    for (const call of puts) {
      const body = call.args[0].input.Body as Buffer;
      expect(body.subarray(0, 4).toString("latin1")).toBe("PAR1");
      expect(body.subarray(-4).toString("latin1")).toBe("PAR1");
    }
    const uploadedKeys = puts.map((call) => call.args[0].input.Key);
    expect(uploadedKeys).toContain(`index/${MANIFEST_CID}/crm_property.parquet`);
    expect(uploadedKeys).toContain(`index/${MANIFEST_CID}/crm_permit.parquet`);
  });

  it("marks anyPartUnverified true when any fetchResults entry is dlq'd", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [{ path: "tables/county/property/part-00000.parquet" }],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
      fetchResults: [{ status: "dlq" }],
    } as never);

    expect(result.anyPartUnverified).toBe(true);
  });

  it("defaults anyPartUnverified to false when fetchResults is absent", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [{ path: "tables/county/property/part-00000.parquet" }],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
    } as never);

    expect(result.anyPartUnverified).toBe(false);
  });
});

/** Reads an uploaded Parquet body back with DuckDB: its row count and its column names. */
async function readUploadedParquet(body: Buffer): Promise<{ rows: number; columns: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), "build-index-readback-"));
  const file = join(dir, "out.parquet");
  writeFileSync(file, body);
  const connection = await createInMemoryConnection();
  try {
    const count = await connection.runAndReadAll(
      `SELECT count(*) AS n FROM read_parquet('${file}')`,
    );
    const [first] = count.getRowObjectsJS() as { n: bigint | number }[];
    const describe = await connection.runAndReadAll(
      `DESCRIBE SELECT * FROM read_parquet('${file}')`,
    );
    const columns = (describe.getRowObjectsJS() as { column_name: string }[]).map(
      (r) => r.column_name,
    );
    return { rows: Number(first?.n ?? 0), columns };
  } finally {
    connection.closeSync();
    rmSync(dir, { recursive: true, force: true });
  }
}

function uploadedBody(key: string): Buffer {
  const call = s3Mock.commandCalls(PutObjectCommand).find((c) => c.args[0].input.Key === key);
  if (call === undefined) throw new Error(`no PutObject for ${key}`);
  return call.args[0].input.Body as Buffer;
}

const STREAM_EVENT_BASE = {
  bucket: "crm-index-test",
  manifestCid: MANIFEST_CID,
  manifestKey: `manifests/${MANIFEST_CID}.json`,
  coverageParcelsPublished: 1,
  finishedAt: "2026-10-21T10:40:04.525Z",
  startedAt: "2026-10-21T10:30:00.000Z",
};

const STREAM_EVENT = {
  bucket: "crm-index-test",
  manifestCid: MANIFEST_CID,
  manifestKey: `manifests/${MANIFEST_CID}.json`,
  parts: [{ path: "tables/county/property/part-00000.parquet" }],
  coverageParcelsPublished: 5000,
  finishedAt: "2026-10-21T10:40:04.525Z",
  startedAt: "2026-10-21T10:30:00.000Z",
};

describe("BuildIndex: binds full-county batched parts by explicit local path (B-09, query-core 1ef8bff)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).callsFake(() => manifestGetResponse());
    s3Mock.on(PutObjectCommand).resolves({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("maps every batched part (tables/bNN/<table>/part) to its own downloaded file, never a shared <group>/<table> path, and binds only the two views it reads", async () => {
    const oracleViews = await import("@crm/oracle-views");
    const bind = vi.mocked(oracleViews.bindManifest);
    bind.mockClear();
    // Two batches carrying the same table and part file name: under bindManifest's default
    // `<tablesDir>/<group>/<table>/<part>` layout both would resolve to one path and collide.
    const parts = [
      { path: "run/county-batched/tables/b01/address/part-00000.parquet" },
      { path: "run/county-batched/tables/b03/address/part-00000.parquet" },
    ];
    const { contentAddressedKey } = await import("../handlers/fetchPart.js");

    await buildIndexHandler({ ...STREAM_EVENT_BASE, parts } as never);

    expect(bind).toHaveBeenCalledTimes(1);
    const options = bind.mock.calls[0]?.[3] as
      | { partUrl?: (a: { name: string; cid: string }) => string; views?: readonly string[] }
      | undefined;
    expect(options?.views).toEqual(["v_property", "v_roofing_permit"]);
    const urls = parts.map((p) => options?.partUrl?.({ name: p.path, cid: "" }));
    expect(new Set(urls).size).toBe(2);
    urls.forEach((url, i) => {
      expect(url).toMatch(
        new RegExp(`${contentAddressedKey(MANIFEST_CID, parts[i]?.path ?? "")}\\.parquet$`),
      );
    });
    // ...and each of those exact paths is where that part's S3 object was downloaded to.
    const gets = s3Mock.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key);
    for (const p of parts) expect(gets).toContain(contentAddressedKey(MANIFEST_CID, p.path));
  });

  it("fails loudly if bindManifest asks for a part Plan did not list (Plan and bind drifted apart)", async () => {
    const parts = [{ path: "run/county-batched/tables/b01/property/part-00000.parquet" }];
    await buildIndexHandler({ ...STREAM_EVENT_BASE, parts } as never);
    const oracleViews = await import("@crm/oracle-views");
    const options = vi.mocked(oracleViews.bindManifest).mock.calls.at(-1)?.[3] as
      | { partUrl?: (a: { name: string; cid: string }) => string }
      | undefined;
    expect(options?.partUrl?.({ name: parts[0]?.path ?? "", cid: "" })).toMatch(/\.parquet$/);
    expect(() =>
      options?.partUrl?.({
        name: "run/county-batched/tables/b01/address/part-00000.parquet",
        cid: "",
      }),
    ).toThrow(/not in Plan's part list/);
  });

  it("names local part files by content hash, so a hostile part path never shapes a filesystem path", async () => {
    await expect(
      buildIndexHandler({
        ...STREAM_EVENT_BASE,
        parts: [{ path: "../../etc/tables/b01/address/part-00000.parquet" }],
      } as never),
    ).resolves.toBeDefined();
    const oracleViews = await import("@crm/oracle-views");
    const options = vi.mocked(oracleViews.bindManifest).mock.calls.at(-1)?.[3] as
      | { partUrl?: (a: { name: string; cid: string }) => string }
      | undefined;
    const url = options?.partUrl?.({
      name: "../../etc/tables/b01/address/part-00000.parquet",
      cid: "",
    });
    expect(url).not.toContain("..");
    expect(url).toMatch(/[0-9a-f]{64}\.parquet$/);
  });
});

describe("BuildIndex: reports manifest batches missing from the bound index (B-09 review fix)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("names a manifest batch bindManifest did not bind, in its output for Validate", async () => {
    const countyPart = "run/county-batched/tables/b01/property/part-00000.parquet";
    const permitPart = "run/permits-batched/tables/b01/property_improvement/part-00000.parquet";
    s3Mock.on(GetObjectCommand).callsFake(() => ({
      Body: Readable.from([
        Buffer.from(
          JSON.stringify({
            artifacts: [
              { kind: "table", name: countyPart, cid: "a" },
              { kind: "table", name: permitPart, cid: "b" },
            ],
          }),
        ),
      ]),
    }));
    const oracleViews = await import("@crm/oracle-views");
    const bind = vi.mocked(oracleViews.bindManifest);
    const realStub = bind.getMockImplementation();
    bind.mockImplementationOnce(async (bytes, dir, engine, options) => {
      await realStub?.(bytes, dir, engine, options);
      // The county batch's group "could not be resolved": only the permit batch was bound.
      return {
        tables: [
          {
            group: "property_improvement",
            table: "property_improvement",
            emitted: true,
            parts: [permitPart],
          },
        ],
      } as never;
    });

    const result = await buildIndexHandler({
      ...STREAM_EVENT_BASE,
      parts: [{ path: countyPart }, { path: permitPart }],
    } as never);

    expect(result.batchCoverage).toEqual({
      batchesListed: 2,
      unboundBatches: ["run/county-batched/tables/b01"],
      emptyCountyBatches: [],
    });
  });
});

describe("BuildIndex: streams rows to Parquet in chunks (full-county sizing, B-09)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).resolves(manifestGetResponse() as never);
    s3Mock.on(PutObjectCommand).resolves({});
  });

  afterEach(() => {
    s3Mock.restore();
    viewRows.property = 1;
    viewRows.permit = 1;
  });

  it("writes every row across many DuckDB chunks, with the unchanged crm_property/crm_permit schema", async () => {
    // > 2 DuckDB vectors (2,048 rows each), so a chunk-boundary bug would drop or repeat rows.
    viewRows.property = 5000;
    viewRows.permit = 2049;
    const {
      buildIndexHandler: handler,
      CRM_PROPERTY_COLUMNS,
      CRM_PERMIT_COLUMNS,
    } = await import("../handlers/buildIndex.js");

    const result = await handler(STREAM_EVENT as never);

    expect(result.propertyCount).toBe(5000);
    expect(result.permitCount).toBe(2049);
    const property = await readUploadedParquet(uploadedBody(result.propertyKey));
    const permit = await readUploadedParquet(uploadedBody(result.permitKey));
    expect(property.rows).toBe(5000);
    expect(permit.rows).toBe(2049);
    expect(property.columns).toEqual(Object.keys(CRM_PROPERTY_COLUMNS));
    expect(permit.columns).toEqual(Object.keys(CRM_PERMIT_COLUMNS));
  });

  it("still writes a valid, correctly-typed Parquet file when a view has zero rows", async () => {
    viewRows.permit = 0;
    const { buildIndexHandler: handler, CRM_PERMIT_COLUMNS } = await import(
      "../handlers/buildIndex.js"
    );

    const result = await handler(STREAM_EVENT as never);

    expect(result.permitCount).toBe(0);
    const permit = await readUploadedParquet(uploadedBody(result.permitKey));
    expect(permit.rows).toBe(0);
    expect(permit.columns).toEqual(Object.keys(CRM_PERMIT_COLUMNS));
  });
});

describe("BuildIndex: duckDbColumnsClause", () => {
  it("renders a DuckDB struct-literal columns clause from a column-name/type map", async () => {
    const { duckDbColumnsClause } = await import("../handlers/buildIndex.js");
    expect(duckDbColumnsClause({ a: "VARCHAR", b: "INTEGER" })).toBe(
      "{a: 'VARCHAR', b: 'INTEGER'}",
    );
  });

  it("renders a single-column clause without a trailing separator", async () => {
    const { duckDbColumnsClause } = await import("../handlers/buildIndex.js");
    expect(duckDbColumnsClause({ onlyCol: "DOUBLE" })).toBe("{onlyCol: 'DOUBLE'}");
  });
});
