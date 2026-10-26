// TD-6: the published sample run manifest, served from its committed exact bytes so the Plan unit
// tests make no network call (public IPFS gateways answered in 0.3 s to 8.4 s, so the suite
// flaked on vitest's 5 s timeout). The bytes are the manifest Oracle published under
// SAMPLE_MANIFEST_CID; sampleManifest.fixture.test.ts recomputes their sha256 and checks it
// against the digest inside the CID, so the fixture cannot drift from what the CID names.
import { readFileSync } from "node:fs";
import { vi, type Mock } from "vitest";

export const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
/** sha256 of the published bytes (equals the multihash digest inside SAMPLE_MANIFEST_CID). */
export const SAMPLE_MANIFEST_SHA256 =
  "12c09928ea035de0229b781684e6bdbb4dd8e3e7e6977a7548887bd677c24aea";

const FIXTURE_URL = new URL(`./sample-manifest.${SAMPLE_MANIFEST_CID}.json`, import.meta.url);

export function sampleManifestBytes(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_URL));
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Replaces the global `fetch` (restored by `vi.unstubAllGlobals()`) with a spy that answers any
 * gateway URL for SAMPLE_MANIFEST_CID (`/ipfs/{cid}` or CloudFront's `/{cid}`) with the fixture
 * bytes, and 404 for anything else. Returns the spy so a test can assert what was requested.
 */
export function serveSampleManifest(): Mock<typeof fetch> {
  const bytes = sampleManifestBytes();
  const spy = vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    if (new URL(url).pathname.endsWith(`/${SAMPLE_MANIFEST_CID}`)) {
      return new Response(bytes.slice(), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
