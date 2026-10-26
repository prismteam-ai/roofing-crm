// OUT OF SCOPE FOR B-02 (decided 2026-10-23, superseding the "Phase D" note T040 left below).
//
// These are Task A's own A-03-TC-003/004/005 acceptance tests (FR-001, AM-05): they assert on
// the Oracle *pipeline's* run manifest — elephant-cli's `tables/{county,property_improvement}`
// directory layout, its `car/travis-{group}.car` archive naming, the `--part-size 48m` export
// convention, and the verbatim Austin/TCAD limitation text for Travis County. None of that is
// what B-02 builds. B-02 (stories/B-02-lead-index.md) is a headless Step Functions sync job
// (Plan -> FetchPart -> BuildIndex -> Validate -> Promote) that reads Task A's manifest by CID
// and writes its own `crm_property`/`crm_permit` Parquet to a private bucket — it has no public
// run manifest of its own to validate this way, and "Out of scope" in that story explicitly
// excludes re-deriving or re-asserting Task A's own export shape (ADR-07: vendor query-core
// verbatim, never re-implement).
//
// Vendoring the missing helpers would not fix this: `lib/fixtures.ts`'s worker-scoped `run`
// fixture opens `{RUNTIME_URL}/runs` and reads a run card's `data-cid` from the DOM — that page
// belongs to Oracle's own hosted pipeline dashboard. B-02 is `ui: false` and has no `/runs`
// route, now or later (map/list/leads UI is B-03+, reading the *index* B-02 produces, never
// Task A's run manifest directly). `@crm/publish` (Oracle's `pipeline/publish`) is also not a
// vendorable package here, and its `cidOfBytes`/`jcsBytes` do not already exist in this repo's
// `packages/oracle-contract` or `packages/oracle-views` (checked; only CID *format* validation
// — `isCidV1` — was vendored in T001).
//
// If a later story needs to replay Task A's run manifest against this repo's own index (for
// example, cross-checking `sourceManifestCid` on `crm_property` rows), write that assertion
// fresh against B-02's actual contract rather than resurrecting this file.
import { test } from "@playwright/test";

test("out of scope for B-02", () => {
  test.skip(
    true,
    "A-03 Oracle-pipeline run-manifest assertions are out of scope for B-02 — see file header",
  );
});
