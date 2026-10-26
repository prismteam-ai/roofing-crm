// T029: FetchPart tries CloudFront first, falls back to Filebase then Pinata on failure (never
// ipfs.io/dweb.link), verifies every downloaded part's sha256 against the manifest before
// returning it, and routes to the DLQ after 5 exhausted retries rather than returning unverified
// bytes (contracts/sync-pipeline.md, ADR-02). T030 implements apps/sync/handlers/fetchPart.ts to
// make this pass — intentionally failing now (no handler exists yet).
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GATEWAY_ORDER,
  MAX_RETRIES_BEFORE_SWITCH,
  type Gateway,
} from "@crm/config/gatewayPolicy.js";
import {
  contentAddressedKey,
  createHttpGatewayFetcher,
  fetchPart,
  productionFetchers,
  type FetchPartDeps,
  type GatewayFetcher,
  type S3ConditionalWriter,
} from "../handlers/fetchPart.js";

vi.mock("../src/s3PartWriter.js", () => ({
  createS3PartWriter: vi.fn(() => ({
    async putIfAbsent() {
      return { written: true };
    },
  })),
}));

const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const PART = {
  name: "v_property",
  path: "v_property/part-000.parquet",
  cid: "bafkreihexamplepartcid",
  sha256: createHash("sha256").update("real bytes").digest("hex"),
};

function noSleep() {
  return async () => undefined;
}

function alwaysFailingFetcher(name: Gateway): GatewayFetcher {
  return {
    name,
    fetch: vi.fn(async () => ({ ok: false, status: 503 })),
  };
}

function succeedingFetcher(name: Gateway, body: Buffer): GatewayFetcher {
  return {
    name,
    fetch: vi.fn(async () => ({ ok: true, status: 200, body })),
  };
}

function fakeS3Writer(): S3ConditionalWriter & { calls: string[] } {
  const written = new Set<string>();
  return {
    calls: [] as string[],
    async putIfAbsent(key, body) {
      this.calls.push(key);
      if (written.has(key)) return { written: false };
      written.add(key);
      void body;
      return { written: true };
    },
  };
}

function deps(fetchers: GatewayFetcher[], s3: S3ConditionalWriter): FetchPartDeps {
  return { fetchers, s3, sleep: noSleep(), random: () => 0 };
}

describe("FetchPart", () => {
  it("tries CloudFront first and returns verified bytes without falling back when it succeeds", async () => {
    const body = Buffer.from("real bytes");
    const cloudfront = succeedingFetcher("cloudfront", body);
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = alwaysFailingFetcher("pinata");
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result).toMatchObject({ status: "verified", partPath: PART.path, sha256: PART.sha256 });
    expect(cloudfront.fetch).toHaveBeenCalledTimes(1);
    expect(filebase.fetch).not.toHaveBeenCalled();
    expect(pinata.fetch).not.toHaveBeenCalled();
  });

  // Found on Task A's Run 2 (parts up to ~6 MB): a Lambda task result larger than Step Functions'
  // 256 KB limit fails the whole execution with States.DataLimitExceeded. The verified bytes go to
  // S3 and BuildIndex reads them from there, so the task result must never carry them.
  it("returns a small result for a large part: the bytes are written to S3, not returned", async () => {
    const body = Buffer.alloc(6 * 1024 * 1024, 7);
    const part = { ...PART, sha256: createHash("sha256").update(body).digest("hex") };
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part },
      deps([succeedingFetcher("cloudfront", body)], s3),
    );

    expect(result).toMatchObject({ status: "verified", partPath: part.path, sha256: part.sha256 });
    expect(result).not.toHaveProperty("verifiedBytes");
    expect(JSON.stringify(result).length).toBeLessThan(2048);
    expect(s3.calls).toEqual([contentAddressedKey(MANIFEST_CID, part.path)]);
  });

  it("falls back CloudFront -> Filebase -> Pinata on failure, never ipfs.io/dweb.link", async () => {
    const body = Buffer.from("real bytes");
    const cloudfront = alwaysFailingFetcher("cloudfront");
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = succeedingFetcher("pinata", body);
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result.status).toBe("verified");
    expect(cloudfront.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(filebase.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(pinata.fetch).toHaveBeenCalledTimes(1);
    expect(GATEWAY_ORDER).toEqual(["cloudfront", "filebase", "pinata"]);
  });

  it("verifies every downloaded part's sha256 against the manifest before returning it", async () => {
    const wrongBody = Buffer.from("tampered bytes");
    const cloudfront = succeedingFetcher("cloudfront", wrongBody);
    const filebase = succeedingFetcher("filebase", wrongBody);
    const pinata = succeedingFetcher("pinata", wrongBody);
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    // A sha256 mismatch is never returned as verified bytes — it exhausts retries like any
    // other failure and ultimately routes to the DLQ.
    expect(result.status).toBe("dlq");
    expect(s3.calls).toHaveLength(0);
  });

  it("routes to the DLQ after all gateways' retries are exhausted, never returning unverified bytes", async () => {
    const cloudfront = alwaysFailingFetcher("cloudfront");
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = alwaysFailingFetcher("pinata");
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result).toEqual({
      status: "dlq",
      partPath: PART.path,
      reason: "all_gateways_exhausted",
    });
    expect(cloudfront.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(filebase.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(pinata.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(s3.calls).toHaveLength(0);
  });
});

describe("token-bucket wait never consumes a retry attempt (CR-B-02 finding #6)", () => {
  it("drives the full MAX_RETRIES_BEFORE_SWITCH real fetch attempts even when the token bucket refuses a few times first", async () => {
    const cloudfront = alwaysFailingFetcher("cloudfront");
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = alwaysFailingFetcher("pinata");
    const s3 = fakeS3Writer();

    // Refuses the first two acquisitions (politeness waits — never a fetch), then always admits.
    let acquireCalls = 0;
    const fakeBucket = {
      tryAcquire: () => {
        acquireCalls += 1;
        return acquireCalls > 2;
      },
    } as unknown as import("@crm/config/gatewayPolicy.js").TokenBucket;

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      {
        fetchers: [cloudfront, filebase, pinata],
        s3,
        sleep: noSleep(),
        random: () => 0,
        tokenBuckets: { cloudfront: fakeBucket },
      },
    );

    // Before the fix, the two bucket-refusal iterations would have consumed 2 of
    // MAX_RETRIES_BEFORE_SWITCH's 5 slots, leaving only 3 real fetch attempts before falling
    // back to Filebase. The fix must still drive the full 5 real attempts against CloudFront.
    expect(cloudfront.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(result.status).toBe("dlq");
  });
});

describe("ADR-02 CloudFront wiring (CR-B-02 finding #2)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches CloudFront at /{cid} directly, never /ipfs/{cid} (confirmed live, run-log.md Stage 0 A1)", async () => {
    const calledUrls: string[] = [];
    global.fetch = vi.fn(async (input: string | URL) => {
      calledUrls.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;

    const fetcher = createHttpGatewayFetcher("cloudfront", "https://d2xsqoqv09bd0q.cloudfront.net");
    await fetcher.fetch("bafkreiexamplecid");

    expect(calledUrls).toEqual(["https://d2xsqoqv09bd0q.cloudfront.net/bafkreiexamplecid"]);
  });

  it("rejects a CloudFront/Filebase/Pinata base URL that resolves to a retired ipfs.io/dweb.link gateway", () => {
    expect(() => createHttpGatewayFetcher("filebase", "https://ipfs.io")).toThrow(
      /retired gateway/,
    );
    expect(() => createHttpGatewayFetcher("pinata", "https://dweb.link")).toThrow(
      /retired gateway/,
    );
  });

  it("returns ok:false with the HTTP status when the gateway response is not ok, without throwing", async () => {
    global.fetch = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;

    const fetcher = createHttpGatewayFetcher("pinata", "https://gateway.pinata.cloud");
    const result = await fetcher.fetch("bafkreiexamplecid");

    expect(result).toEqual({ ok: false, status: 503 });
  });

  it("still fetches Filebase/Pinata at /ipfs/{cid}, unlike CloudFront", async () => {
    const calledUrls: string[] = [];
    global.fetch = vi.fn(async (input: string | URL) => {
      calledUrls.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;

    const filebase = createHttpGatewayFetcher("filebase", "https://ipfs.filebase.io");
    await filebase.fetch("bafkreiexamplecid");

    expect(calledUrls).toEqual(["https://ipfs.filebase.io/ipfs/bafkreiexamplecid"]);
  });

  it("productionFetchers() includes CloudFront first when GATEWAY_CLOUDFRONT_BASE_URL is set, matching GATEWAY_ORDER", () => {
    const fetchers = productionFetchers({
      GATEWAY_CLOUDFRONT_BASE_URL: "https://d2xsqoqv09bd0q.cloudfront.net",
      GATEWAY_FILEBASE_BASE_URL: "https://ipfs.filebase.io",
      GATEWAY_PINATA_BASE_URL: "https://gateway.pinata.cloud",
    });

    expect(fetchers.map((f) => f.name)).toEqual(["cloudfront", "filebase", "pinata"]);
  });

  it("productionFetchers() skips CloudFront (never errors) when its env var is unset, falling back to Filebase/Pinata", () => {
    const fetchers = productionFetchers({
      GATEWAY_FILEBASE_BASE_URL: "https://ipfs.filebase.io",
      GATEWAY_PINATA_BASE_URL: "https://gateway.pinata.cloud",
    });

    expect(fetchers.map((f) => f.name)).toEqual(["filebase", "pinata"]);
  });
});

describe("contentAddressedKey", () => {
  it("is sha256(manifestCid + partPath) — matches the idempotency key machamp's design uses", () => {
    const expected = createHash("sha256")
      .update(MANIFEST_CID + PART.path)
      .digest("hex");
    expect(contentAddressedKey(MANIFEST_CID, PART.path)).toBe(expected);
  });
});

describe("handler (standalone Lambda-shaped entry point)", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("throws when CRM_INDEX_BUCKET_NAME is not set, before ever touching a gateway", async () => {
    delete process.env.CRM_INDEX_BUCKET_NAME;
    const { handler } = await import("../handlers/fetchPart.js");

    await expect(handler({ manifestCid: MANIFEST_CID, part: PART })).rejects.toThrow(
      /CRM_INDEX_BUCKET_NAME is not set/,
    );
  });

  it("throws when CRM_INDEX_BUCKET_NAME is set to an empty string", async () => {
    process.env.CRM_INDEX_BUCKET_NAME = "";
    const { handler } = await import("../handlers/fetchPart.js");

    await expect(handler({ manifestCid: MANIFEST_CID, part: PART })).rejects.toThrow(
      /CRM_INDEX_BUCKET_NAME is not set/,
    );
  });

  it("wires productionFetchers + the S3 writer end to end and returns a verified result on success", async () => {
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test-bucket";
    process.env.GATEWAY_CLOUDFRONT_BASE_URL = "https://d2xsqoqv09bd0q.cloudfront.net";
    delete process.env.GATEWAY_FILEBASE_BASE_URL;
    delete process.env.GATEWAY_PINATA_BASE_URL;
    const body = Buffer.from("real bytes");
    global.fetch = vi.fn(
      async () => new Response(body, { status: 200 }),
    ) as unknown as typeof fetch;
    const { handler } = await import("../handlers/fetchPart.js");

    const result = await handler({ manifestCid: MANIFEST_CID, part: PART });

    expect(result.status).toBe("verified");
  });

  it("logs and routes to the DLQ when every configured gateway is exhausted", async () => {
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test-bucket";
    process.env.GATEWAY_CLOUDFRONT_BASE_URL = "https://d2xsqoqv09bd0q.cloudfront.net";
    delete process.env.GATEWAY_FILEBASE_BASE_URL;
    delete process.env.GATEWAY_PINATA_BASE_URL;
    global.fetch = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { handler } = await import("../handlers/fetchPart.js");

    const result = await handler({ manifestCid: MANIFEST_CID, part: PART });

    expect(result).toEqual({
      status: "dlq",
      partPath: PART.path,
      reason: "all_gateways_exhausted",
    });
    // Powertools Logger routes `.error(...)` to stderr (its own internal Console), not stdout.
    const loggedLine = stderrSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((line: string) => line.includes("part exhausted every gateway's retries"));
    stderrSpy.mockRestore();
    expect(loggedLine).toBeDefined();
  });
});
