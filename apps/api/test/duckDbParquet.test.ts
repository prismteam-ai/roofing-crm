// T025 (Phase 3, INDEX, [P] — fixes G5 C-04): the LeadIndex port's typed-error contract
// (INDEX_NOT_READY when no run has ever promoted, INDEX_COLD_LOAD_TIMEOUT on a fixture that
// exceeds the cold-load budget), before any adapter code exists. Written first, shown failing.
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { createObservability } from "@crm/observability";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DuckDbParquetLeadIndex,
  IndexColdLoadTimeoutError,
  IndexNotReadyError,
} from "../src/adapters/duckDbParquet.js";

const openParquetConnectionMock = vi.fn();
vi.mock("../src/engine/duckdb.js", () => ({
  openParquetConnection: (...args: unknown[]) => openParquetConnectionMock(...args),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("LeadIndex-test");

function makeIndex(
  overrides: Partial<ConstructorParameters<typeof DuckDbParquetLeadIndex>[0]> = {},
) {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    coldLoadTimeoutMs: 50,
    tmpDir: `/tmp/crm-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
}

describe("LeadIndex (DuckDB over S3 Parquet)", () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
  });

  it("throws INDEX_NOT_READY when no run has ever been promoted", async () => {
    ddbMock.onAnyCommand().resolves({ Item: undefined });

    const index = makeIndex();

    await expect(index.indexInfo()).rejects.toThrow(IndexNotReadyError);
    await expect(index.indexInfo()).rejects.toMatchObject({ code: "INDEX_NOT_READY" });
  });

  it("throws INDEX_NOT_READY (not a raw DynamoDB error) when crm-leads doesn't exist yet (B-07 not deployed, found live on the B-03 hosted preview)", async () => {
    ddbMock
      .onAnyCommand()
      .rejects(
        new ResourceNotFoundException({ message: "Requested resource not found", $metadata: {} }),
      );

    const index = makeIndex();

    await expect(index.indexInfo()).rejects.toThrow(IndexNotReadyError);
    await expect(index.indexInfo()).rejects.toMatchObject({ code: "INDEX_NOT_READY" });
  });

  it("reads the pointer with the pk+sk key crm-leads actually has (found live on the first real table)", async () => {
    ddbMock.onAnyCommand().resolves({ Item: { pk: "META#index", current: "bafy-x" } });

    await makeIndex().indexInfo();

    expect(ddbMock.calls()[0]?.args[0].input).toMatchObject({
      Key: { pk: "META#index", sk: "META" },
    });
  });

  it("reads propertyCount/permitCount/promotedAt from META#index (CR-B-02 finding #1: Promote now writes these)", async () => {
    ddbMock.onAnyCommand().resolves({
      Item: {
        pk: "META#index",
        current: "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq",
        propertyCount: 14,
        permitCount: 35,
        promotedAt: "2026-10-23T12:00:00.000Z",
      },
    });

    const index = makeIndex();

    await expect(index.indexInfo()).resolves.toEqual({
      manifestCid: "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq",
      propertyCount: 14,
      permitCount: 35,
      promotedAt: "2026-10-23T12:00:00.000Z",
    });
  });

  it("throws INDEX_COLD_LOAD_TIMEOUT when the cold load exceeds its budget", async () => {
    ddbMock.onAnyCommand().resolves({
      Item: {
        pk: "META#index",
        current: "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq",
      },
    });
    // S3 never resolves within the 50ms cold-load budget configured above.
    s3Mock.onAnyCommand().callsFake(() => new Promise(() => undefined));

    const index = makeIndex();

    await expect(index.searchProperties({})).rejects.toThrow(IndexColdLoadTimeoutError);
    await expect(index.searchProperties({})).rejects.toMatchObject({
      code: "INDEX_COLD_LOAD_TIMEOUT",
    });
  });

  describe("cold-load race (CR-B-02 finding #8)", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }

    it("discards a timed-out cold load's connection once it finally resolves, instead of leaving it open or letting it corrupt a later successful retry", async () => {
      const MANIFEST_CID = `race-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ddbMock.onAnyCommand().resolves({ Item: { pk: "META#index", current: MANIFEST_CID } });

      // Four GetObject calls happen in this exact order: attempt 1's property download (call 0,
      // held pending by this test past the cold-load budget), attempt 2's property and permit
      // downloads (calls 1-2, resolved immediately), and finally attempt 1's permit download
      // (call 3, only reached once this test unblocks call 0 below). Real-time delays would be
      // flaky here — this test needs attempt 1's download to still be in flight, by construction,
      // when attempt 2 starts and finishes, not by racing real timers.
      const s3Responses = [
        deferred<{ Body: Readable }>(),
        deferred<{ Body: Readable }>(),
        deferred<{ Body: Readable }>(),
        deferred<{ Body: Readable }>(),
      ];
      let s3CallIndex = 0;
      s3Mock.on(GetObjectCommand).callsFake(() => {
        const response = s3Responses[s3CallIndex];
        s3CallIndex += 1;
        return response?.promise;
      });

      const connections: { closeSync: ReturnType<typeof vi.fn> }[] = [];
      openParquetConnectionMock.mockImplementation(async () => {
        const connection = {
          closeSync: vi.fn(),
          runAndReadAll: vi.fn(async () => ({ getRowObjectsJS: () => [] })),
        };
        connections.push(connection);
        return connection;
      });

      // A generous (but still fast) budget: attempt 1's deferred S3 call never resolves on its
      // own, so it will always time out regardless of this value — this just needs to be large
      // enough that attempt 2's own (mocked, near-instant) work reliably finishes within its own
      // budget on a loaded CI machine, without this test depending on real-time races.
      const index = makeIndex({ coldLoadTimeoutMs: 300 });

      // Attempt 1 starts its first download (property, call 0) and gets stuck there — this test
      // never resolves call 0 until much later — so it stays pending past the cold-load budget,
      // and this call times out while that download is still "in flight".
      const attempt1 = index.searchProperties({});
      await expect(attempt1).rejects.toThrow(IndexColdLoadTimeoutError);

      // Attempt 2: a fresh retry for the same manifestCid, started only after attempt 1 has
      // already timed out. Its own property/permit downloads (calls 1-2) resolve immediately —
      // proving a retry isn't blocked by attempt 1's abandoned work, and lands in its own
      // uniquely-keyed directory rather than attempt 1's.
      const attempt2 = index.searchProperties({});
      s3Responses[1]?.resolve({ Body: Readable.from([Buffer.from("property bytes")]) });
      s3Responses[2]?.resolve({ Body: Readable.from([Buffer.from("permit bytes")]) });
      const rows = await attempt2;
      expect(rows).toEqual([]);

      // Only now does attempt 1's abandoned load get to finish: its property download (call 0)
      // resolves, letting it proceed to its permit download (call 3), well after attempt 2 has
      // already succeeded and cached its own connection.
      s3Responses[0]?.resolve({ Body: Readable.from([Buffer.from("property bytes")]) });
      s3Responses[3]?.resolve({ Body: Readable.from([Buffer.from("permit bytes")]) });
      // Wait (poll, up to 3 s) for attempt 1's now-unblocked background load to finish and
      // discover it has been superseded. A fixed 50 ms sleep here flaked on a loaded CI machine.
      await vi.waitFor(
        () => {
          expect(connections.filter((c) => c.closeSync.mock.calls.length > 0)).toHaveLength(1);
        },
        { timeout: 3_000, interval: 10 },
      );

      // Two DuckDB connections were opened (one per attempt) — attempt 2's (the winner) was
      // never closed; attempt 1's (the stale loser) was closed rather than left open or returned
      // to any caller.
      expect(connections).toHaveLength(2);
      const stillOpen = connections.filter((c) => c.closeSync.mock.calls.length === 0);
      const closed = connections.filter((c) => c.closeSync.mock.calls.length > 0);
      expect(stillOpen).toHaveLength(1);
      expect(closed).toHaveLength(1);
    });
  });

  describe("Powertools observability wrapping (Phase 6 convergence T048, Constitution Article VIII)", () => {
    it("wraps indexInfo with the shared Powertools middleware: structured logs plus a metrics flush", async () => {
      ddbMock.onAnyCommand().resolves({ Item: undefined });
      const logInfoSpy = vi.spyOn(obs.logger, "info");
      const metricsFlushSpy = vi.spyOn(obs.metrics, "publishStoredMetrics");

      const index = makeIndex();
      await expect(index.indexInfo()).rejects.toThrow(IndexNotReadyError);

      expect(logInfoSpy).toHaveBeenCalledWith(
        "operation invoked",
        expect.objectContaining({ operationName: "LeadIndex.indexInfo" }),
      );
      expect(logInfoSpy).toHaveBeenCalledWith(
        "operation invoked",
        expect.objectContaining({ operationName: "LeadIndex.indexInfo" }),
      );
      expect(metricsFlushSpy).toHaveBeenCalled();

      logInfoSpy.mockRestore();
      metricsFlushSpy.mockRestore();
    });

    it("wraps searchProperties with the shared Powertools middleware", async () => {
      const MANIFEST_CID = `obs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ddbMock.onAnyCommand().resolves({ Item: { pk: "META#index", current: MANIFEST_CID } });
      s3Mock
        .on(GetObjectCommand)
        .resolves({ Body: Readable.from([Buffer.from("bytes")]) } as never);
      openParquetConnectionMock.mockResolvedValue({
        closeSync: vi.fn(),
        runAndReadAll: vi.fn(async () => ({ getRowObjectsJS: () => [] })),
      });
      const logInfoSpy = vi.spyOn(obs.logger, "info");

      // Generous timeout: this test asserts Powertools logging, not cold-load timing —
      // the suite's default 50ms budget (tuned for the dedicated timeout test above) is
      // flaky under CI's slower/emulated runners.
      const index = makeIndex({ coldLoadTimeoutMs: 5000 });
      await index.searchProperties({});

      expect(logInfoSpy).toHaveBeenCalledWith(
        "operation invoked",
        expect.objectContaining({ operationName: "LeadIndex.searchProperties" }),
      );
      expect(logInfoSpy).toHaveBeenCalledWith(
        "operation completed",
        expect.objectContaining({ operationName: "LeadIndex.searchProperties" }),
      );

      logInfoSpy.mockRestore();
    });
  });
});
