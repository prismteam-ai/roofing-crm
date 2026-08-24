import { describe, expect, it } from "vitest";

import {
  summarizeChesterDemoCorpus,
  validateChesterDemoFixtureStats,
} from "./chester-demo-corpus-stats.js";
import { loadChesterDemoFixtureCorpus } from "./load-chester-demo-fixture-corpus.js";
import { manifestSupportsChesterDemoRag } from "./chester-demo-rag-readiness.js";
import { buildChesterDemoManifest } from "./rag-corpus-manifest.js";

describe("chester demo RAG contract", () => {
  it("validates fixture corpus provenance and county", async () => {
    const chunks = await loadChesterDemoFixtureCorpus();
    const stats = summarizeChesterDemoCorpus(chunks);
    expect(validateChesterDemoFixtureStats(stats)).toEqual([]);
    expect(stats.permitChunkCount).toBeGreaterThan(0);
  });

  it("accepts a complete Chester-demo manifest", () => {
    const manifest = buildChesterDemoManifest({
      indexedAt: "2026-08-25T00:00:00.000Z",
      indexedCount: 84_236,
      sourcePropertyCount: 84_086,
      permitChunkCount: 150,
      propertySummaryCount: 84_086,
      longOpenPermitChunkCount: 12,
      sourceUri: "https://example.test/corpus.jsonl",
      sourceCid: "QmY9SdpRj2pHxSMJNCTRzWfbMPe37hikpevT8qHeEnQ7Yp",
      sourceSha256: "abc123",
      sourceBytes: 61_273_152,
      schemaVersion: 1,
      provenance: "synthetic_demo",
      concreteIndexName: "roofing-opportunity-chunks-chester-demo-v1-abc123",
    });

    expect(manifestSupportsChesterDemoRag(manifest)).toBe(true);
  });
});
