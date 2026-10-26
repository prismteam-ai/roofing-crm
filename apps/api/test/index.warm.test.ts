// Cold-start warm-up: `warm()` starts the promoted index loading ahead of the first request (the
// Lambda init phase has full CPU), and a request that arrives meanwhile awaits that same in-flight
// load instead of starting its own. The request keeps the 3 s cold-load budget: past it the typed
// "warming up" error is returned, while the load carries on and serves the next request.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createObservability } from "@crm/observability";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DuckDbParquetLeadIndex,
  IndexColdLoadTimeoutError,
} from "../src/adapters/duckDbParquet.js";

const openParquetConnectionMock = vi.fn();
vi.mock("../src/engine/duckdb.js", () => ({
  openParquetConnection: (...args: unknown[]) => openParquetConnectionMock(...args),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("LeadIndex-warm-test");

function makeIndex(overrides: Partial<ConstructorParameters<typeof DuckDbParquetLeadIndex>[0]>) {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    tmpDir: `/tmp/crm-index-warm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const bytes = (): { Body: Readable } => ({ Body: Readable.from([Buffer.from("bytes")]) });

describe("DuckDbParquetLeadIndex.warm", () => {
  let manifest: string;
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    openParquetConnectionMock.mockReset();
    manifest = `warm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    ddbMock.onAnyCommand().resolves({ Item: { pk: "META#index", current: manifest } });
    openParquetConnectionMock.mockImplementation(async () => ({
      closeSync: vi.fn(),
      run: vi.fn(),
      interrupt: vi.fn(),
      runAndReadAll: vi.fn(async () => ({ getRowObjectsJS: () => [] })),
    }));
  });

  it("loads the promoted index so the first request finds it ready (no second download)", async () => {
    s3Mock.on(GetObjectCommand).callsFake(bytes);
    const index = makeIndex({ coldLoadTimeoutMs: 5_000 });
    await expect(index.warm()).resolves.toEqual({ manifestCid: manifest });
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
    await index.searchProperties({});
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
    expect(openParquetConnectionMock).toHaveBeenCalledTimes(1);
  });

  it("a request that arrives during the warm-up awaits the same in-flight load", async () => {
    const gate = deferred<{ Body: Readable }>();
    let calls = 0;
    s3Mock.on(GetObjectCommand).callsFake(() => (calls++ === 0 ? gate.promise : bytes()));
    const index = makeIndex({ coldLoadTimeoutMs: 5_000 });
    const warming = index.warm();
    const request = index.searchProperties({});
    await vi.waitFor(() => expect(calls).toBe(1));
    gate.resolve(bytes());
    await warming;
    await expect(request).resolves.toEqual([]);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
    expect(openParquetConnectionMock).toHaveBeenCalledTimes(1);
  });

  it("a request past its own 3 s budget gets the typed warming-up error but does not restart the load; the next request is served by it", async () => {
    const gate = deferred<{ Body: Readable }>();
    let calls = 0;
    s3Mock.on(GetObjectCommand).callsFake(() => (calls++ === 0 ? gate.promise : bytes()));
    const index = makeIndex({ coldLoadTimeoutMs: 40, warmTimeoutMs: 10_000 });
    const warming = index.warm();
    await vi.waitFor(() => expect(calls).toBe(1));
    await expect(index.searchProperties({})).rejects.toThrow(IndexColdLoadTimeoutError);
    gate.resolve(bytes());
    await warming;
    await expect(index.searchProperties({})).resolves.toEqual([]);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
    expect(openParquetConnectionMock).toHaveBeenCalledTimes(1);
  });

  it("a failed warm-up rejects, is not cached, and the next request loads normally", async () => {
    let calls = 0;
    s3Mock.on(GetObjectCommand).callsFake(() => {
      if (calls++ === 0) throw new Error("s3 down");
      return bytes();
    });
    const index = makeIndex({ coldLoadTimeoutMs: 5_000 });
    await expect(index.warm()).rejects.toThrow("s3 down");
    await expect(index.searchProperties({})).resolves.toEqual([]);
  });

  it("a second warm after the load is a cheap pointer read (no download)", async () => {
    s3Mock.on(GetObjectCommand).callsFake(bytes);
    const index = makeIndex({ coldLoadTimeoutMs: 5_000 });
    await index.warm();
    await index.warm();
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
  });
});
