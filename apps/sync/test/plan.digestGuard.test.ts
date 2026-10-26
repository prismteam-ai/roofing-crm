// T023 (Phase 3, INDEX, US1, [P]): assert Plan holds (not fails/throws uncaught) when a
// profiles[].sha256 in the manifest does not match the vendored packages/oracle-contract/
// oracle-views copy's recorded digest. Written first, shown failing (no handler exists yet).
// Uses the real published sample manifest (its exact bytes, from the committed fixture: TD-6)
// and the handler's own `__testForceDigestMismatch` test hook (T008's own pattern) rather than
// crafting a tampered manifest file, since the digest comparison itself is the thing under test,
// not manifest parsing.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planHandler } from "../handlers/plan.js";
import {
  SAMPLE_MANIFEST_CID,
  sampleManifestBytes,
  serveSampleManifest,
} from "./fixtures/sampleManifest.js";

const s3Mock = mockClient(S3Client);

describe("Plan: digest guard (ADR-07)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
    serveSampleManifest();
  });

  afterEach(() => {
    delete process.env.CRM_INDEX_BUCKET_NAME;
    vi.unstubAllGlobals();
  });

  it("holds, never throws uncaught, when the vendored profile digest does not match the manifest's", async () => {
    const result = await planHandler({
      manifestCidHint: SAMPLE_MANIFEST_CID,
      __testForceDigestMismatch: true,
    } as never);

    expect(result).toMatchObject({ status: "Held", heldReason: "digest_mismatch" });
  });

  it("does not hold on digest_mismatch for the real, untampered sample manifest", async () => {
    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID });

    expect(result).not.toMatchObject({ heldReason: "digest_mismatch" });
    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
  });
});

// Phase 6 convergence T047 (CRITICAL): the manifest's own bytes were never verified against the
// manifestCid they were fetched by — only the manifest's *parts* were (FetchPart). This
// contradicts FR-001/architecture-constitution.md §6/§8's "verify every byte before use". Written
// first, shown failing (fetchManifestBytes performs no such check yet).
describe("Plan: manifest-bytes-against-CID verification (Phase 6 convergence T047)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
  });

  afterEach(() => {
    delete process.env.CRM_INDEX_BUCKET_NAME;
    vi.unstubAllGlobals();
  });

  it("holds, never throws uncaught, when every gateway returns bytes that do not hash to the requested manifestCid", async () => {
    // Every gateway fetchManifestBytes tries returns bytes with a different sha256 than the one
    // embedded in SAMPLE_MANIFEST_CID's multihash — simulating a compromised/misconfigured
    // gateway serving the wrong content under the right-looking URL.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ not: "the real manifest bytes" }), {
            status: 200,
          }),
      ),
    );

    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID } as never);

    expect(result).toMatchObject({ status: "Held", manifestCid: SAMPLE_MANIFEST_CID });
    expect(result).not.toHaveProperty("profiles");
  });

  it("holds when the real manifest bytes differ from the published ones by a single byte", async () => {
    const tampered = sampleManifestBytes();
    // Flip one bit near the end: still well-formed-looking, no longer the CID's bytes.
    const at = tampered.length - 2;
    tampered.set([(tampered.at(at) ?? 0) ^ 0x01], at);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(tampered, { status: 200 })),
    );

    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID });

    expect(result).toMatchObject({
      status: "Held",
      heldReason: "digest_mismatch",
      manifestCid: SAMPLE_MANIFEST_CID,
    });
  });

  it("still resolves normally (no false-positive hold) for the real, untampered sample manifest", async () => {
    const fetchSpy = serveSampleManifest();
    s3Mock.on(GetObjectCommand).rejects(new Error("no runs/index.json in this test's bucket"));

    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID });

    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
    expect(result).not.toHaveProperty("status");
    // The real bytes were verified against the CID after arriving through Plan's gateway fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(new RegExp(`/${SAMPLE_MANIFEST_CID}$`));
  });
});
