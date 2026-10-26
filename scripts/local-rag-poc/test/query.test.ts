// T012 (Phase 3, INDEX): the local prototype's gate (constitution XXI, story rule 5) — this
// runs against the REAL published sample manifest over a live CID gateway (no AWS resource, no
// mock), proving the vendored packages/oracle-views binding and the row shape before T014 writes
// apps/sync/handlers/buildIndex.ts. Written first and shown failing (query.ts does not exist yet).
//
// One shared `runQuery` call (beforeAll), not one per assertion group: the public Filebase/Pinata
// gateways rate-limit after a burst of requests (checks.md §6.1 measured 429s after ~50-65 rapid
// requests from one machine) — this is exactly ADR-02's reason to have a fallback chain at all,
// and exactly why a real integration test against public gateways keeps its own request count low.
import { beforeAll, describe, expect, it } from "vitest";
import { runQuery, type QueryResult } from "../query.js";

// The one place this CID is a hard-coded constant: a test fixture value, per the story's explicit
// rule (never in source). Task A's already-published sample run, 35 roofing rows (Austin permits,
// September 2026).
const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";

describe("local-rag-poc query CLI (espeon prototype-to-production gate)", () => {
  let result: QueryResult;

  beforeAll(async () => {
    result = await runQuery(SAMPLE_MANIFEST_CID);
  }, 90_000);

  it("binds the real sample manifest over a live gateway and prints its 35 published roofing rows", () => {
    expect(result.manifestCid).toBe(SAMPLE_MANIFEST_CID);
    expect(result.runId.length).toBeGreaterThan(0);
    expect(result.permitCount).toBe(35);
    expect(result.propertyCount).toBeGreaterThan(0);
  });

  it("preserves at least one real missing-data reason exactly, never a guessed value (AC-3)", () => {
    // This sample run's 14 published properties happen to carry a known roof age for every row
    // (see docs/evidence/B-02.md) — so this proof uses whichever real missing reason the data
    // actually contains (owner/tenure/address fields are unresolved for several rows in this run)
    // rather than inventing a roof-age-missing row that is not present in this manifest. The
    // roof-age-specific case (AC-3's literal example) is proven with a fixture in
    // apps/sync/test/missingReasons.test.ts (T016), which does not depend on what this one real
    // sample happens to contain.
    expect(result.sampleMissingReason).not.toBeNull();
    expect(result.sampleMissingReason?.field.length).toBeGreaterThan(0);
    expect(result.sampleMissingReason?.reason.length).toBeGreaterThan(0);
  });
});
