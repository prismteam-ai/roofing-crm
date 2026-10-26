// TD-6: the committed sample manifest fixture must be the exact bytes its CID names, so serving
// it in place of a public gateway changes nothing about what the Plan tests prove. The CID is
// decoded here independently of apps/sync/handlers/plan.ts (base32 CIDv1, raw codec, sha2-256
// multihash) so a bug in Plan's own decoder cannot hide a drifted fixture.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAMPLE_MANIFEST_CID,
  SAMPLE_MANIFEST_SHA256,
  sampleManifestBytes,
  serveSampleManifest,
} from "./fixtures/sampleManifest.js";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32Decode(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`not base32: ${char}`);
    buffer = ((buffer << 5) | value) & 0xffff; // only the low 13 bits are ever read
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

describe("sample manifest fixture (TD-6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a CIDv1, raw codec, sha2-256 CID whose digest is SAMPLE_MANIFEST_SHA256", () => {
    expect(SAMPLE_MANIFEST_CID.startsWith("b")).toBe(true); // multibase base32
    const cid = base32Decode(SAMPLE_MANIFEST_CID.slice(1));
    expect([...cid.slice(0, 4)]).toEqual([0x01, 0x55, 0x12, 0x20]);
    expect(Buffer.from(cid.slice(4)).toString("hex")).toBe(SAMPLE_MANIFEST_SHA256);
  });

  it("holds bytes whose sha256 matches the CID, so it cannot drift from the published manifest", () => {
    const digest = createHash("sha256").update(sampleManifestBytes()).digest("hex");
    expect(digest).toBe(SAMPLE_MANIFEST_SHA256);
  });

  it("is served for a gateway URL of the CID and 404s anything else", async () => {
    serveSampleManifest();
    const hit = await fetch(`https://ipfs.example/ipfs/${SAMPLE_MANIFEST_CID}`);
    const miss = await fetch("https://ipfs.example/ipfs/bafkreiother");
    expect(hit.status).toBe(200);
    expect(new Uint8Array(await hit.arrayBuffer())).toEqual(sampleManifestBytes());
    expect(miss.status).toBe(404);
  });

  it("leaves no real network path: an unstubbed fetch fails with its URL", async () => {
    // The suite's setup file (test/setup.noNetwork.ts) installs this guard for every test file.
    await expect(fetch("https://gateway.pinata.cloud/ipfs/anything")).rejects.toThrow(
      /must not use the network/,
    );
  });
});
