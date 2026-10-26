// Covers Validate's event-driven handler (apps/sync/handlers/validate.ts,
// validateCoreFromEvent / validateHandler, lines ~160-226) and extractPreviousPromotedPropertyCount
// / readSourceManifestCids' real-Parquet read path (line ~137) — both left untested by
// validate.test.ts and validate.quarantine.test.ts, which exercise only the pure `validateCore`
// reconciliation function directly. This file drives the real S3 download + real in-memory DuckDB
// (src/engine/duckdb.ts) Parquet read + DynamoDB previous-pointer lookup, including the
// ResourceNotFoundException "no run ever promoted yet" fallback (data-model.md's first_run case).
import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryConnection } from "../src/engine/duckdb.js";
import {
  validateCore,
  validateHandler,
  type ValidateEvent,
  type ValidateInput,
} from "../handlers/validate.js";
import type { CrmProperty, CrmPermit } from "@crm/index-schema";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";

/** Writes a real single-column Parquet file (sourceManifestCid only — all readSourceManifestCids
 *  ever selects) via the same real DuckDB connection BuildIndex/Validate use, and returns its raw
 *  bytes, so this test proves Validate's actual `read_parquet` path rather than a mocked stand-in. */
async function makeSourceManifestCidParquet(values: (string | null)[]): Promise<Buffer> {
  const connection = await createInMemoryConnection();
  try {
    const literal = values.map((v) => `(${v === null ? "NULL" : `'${v}'`})`).join(", ");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "crm-validate-fixture-"));
    const file = join(tmp, "fixture.parquet");
    try {
      await connection.run(
        `COPY (SELECT * FROM (VALUES ${literal}) AS t(sourceManifestCid)) TO '${file}' (FORMAT parquet)`,
      );
      return await readFile(file);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } finally {
    connection.closeSync();
  }
}

const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBDocumentClient);

let propertyParquetBytes: Buffer;
let permitParquetBytes: Buffer;

beforeAll(async () => {
  propertyParquetBytes = await makeSourceManifestCidParquet([MANIFEST_CID]);
  permitParquetBytes = await makeSourceManifestCidParquet([MANIFEST_CID, MANIFEST_CID]);
});

function baseEvent(overrides: Partial<ValidateEvent> = {}): ValidateEvent {
  return {
    manifestCid: MANIFEST_CID,
    bucket: "crm-index-test",
    propertyKey: `index/${MANIFEST_CID}/crm_property.parquet`,
    permitKey: `index/${MANIFEST_CID}/crm_permit.parquet`,
    coverageParcelsPublished: 1,
    finishedAt: "2026-10-21T10:40:04.525Z",
    anyPartUnverified: false,
    ...overrides,
  };
}

describe("Validate: event-driven handler (real S3 download + real DuckDB Parquet read + DynamoDB)", () => {
  beforeEach(() => {
    s3Mock.reset();
    ddbMock.reset();
    s3Mock.on(GetObjectCommand, { Key: `index/${MANIFEST_CID}/crm_property.parquet` }).resolves({
      Body: Readable.from([propertyParquetBytes]),
    } as never);
    s3Mock.on(GetObjectCommand, { Key: `index/${MANIFEST_CID}/crm_permit.parquet` }).resolves({
      Body: Readable.from([permitParquetBytes]),
    } as never);
    process.env.CRM_LEADS_TABLE_NAME = "crm-leads-test";
  });

  afterEach(() => {
    s3Mock.restore();
    ddbMock.restore();
    delete process.env.CRM_LEADS_TABLE_NAME;
  });

  it("reads the previously promoted count off META#index and reconciles to Validated", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { propertyCount: 1, pk: "META#index" } });

    const result = await validateHandler(baseEvent());

    expect(result.status).toBe("Validated");
    expect(result.propertyCount).toBe(1);
    expect(result.permitCount).toBe(2);
    expect(result.reconcileDiff).toBe(0);
  });

  it("reads the pointer with the pk+sk key crm-leads actually has", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { propertyCount: 1, pk: "META#index" } });

    await validateHandler(baseEvent());

    expect(ddbMock.commandCalls(GetCommand)[0]?.args[0].input).toMatchObject({
      Key: { pk: "META#index", sk: "META" },
    });
  });

  it("treats a ResourceNotFoundException (B-07's table not deployed yet) as first_run, not a crash", async () => {
    ddbMock
      .on(GetCommand)
      .rejects(
        new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }),
      );

    const result = await validateHandler(baseEvent({ coverageParcelsPublished: 1 }));

    // previousPromotedPropertyCount resolves to null -> the drop_over_5_percent branch is never
    // reached, so this still reconciles on coverage alone.
    expect(result.status).toBe("Validated");
  });

  it("re-throws a DynamoDB error that is not ResourceNotFoundException", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB: ProvisionedThroughputExceededException"));

    await expect(validateHandler(baseEvent())).rejects.toThrow(
      /ProvisionedThroughputExceededException/,
    );
  });

  it("holds the whole run when BuildIndex signaled anyPartUnverified, using the real Parquet-read row counts", async () => {
    ddbMock.on(GetCommand).resolves({});

    const result = await validateHandler(baseEvent({ anyPartUnverified: true }));

    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("unverified_part");
  });

  it("throws when CRM_LEADS_TABLE_NAME is not configured", async () => {
    delete process.env.CRM_LEADS_TABLE_NAME;
    ddbMock.on(GetCommand).resolves({});

    await expect(validateHandler(baseEvent())).rejects.toThrow(/CRM_LEADS_TABLE_NAME is not set/);
  });
});

describe("Validate: missing-provenance guard (validateCore, lines 74-80)", () => {
  function baseInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
    return {
      manifestCid: MANIFEST_CID,
      properties: [{ sourceManifestCid: MANIFEST_CID } as CrmProperty],
      permits: [{ sourceManifestCid: MANIFEST_CID } as CrmPermit],
      coverageParcelsPublished: 1,
      previousPromotedPropertyCount: null,
      anyPartUnverified: false,
      finishedAt: "2026-10-21T10:40:04.525Z",
      ...overrides,
    };
  }

  it("throws loudly if a property row is missing sourceManifestCid (BuildIndex's own contract was violated)", () => {
    expect(() =>
      validateCore(baseInput({ properties: [{ sourceManifestCid: "" } as CrmProperty] })),
    ).toThrow(/sourceManifestCid/);
  });

  it("throws loudly if a permit row is missing sourceManifestCid", () => {
    expect(() =>
      validateCore(baseInput({ permits: [{ sourceManifestCid: "" } as CrmPermit] })),
    ).toThrow(/sourceManifestCid/);
  });
});
