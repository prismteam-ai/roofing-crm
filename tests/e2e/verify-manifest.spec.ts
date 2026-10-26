// OUT OF SCOPE FOR B-02 (decided 2026-10-23, superseding the "Phase D" note T040 left below).
//
// This is Task A's own A-03-TC-040..043 (FR-006, AM-01): it spawns `scripts/verify-manifest.ts`
// against a run published on Oracle's *hosted* pipeline and asserts the CLI's exact output
// texts. Two separate problems rule it out for B-02, not just the missing imports:
//
// 1. Every one of these four specs' `run` worker fixture (`lib/fixtures.ts`) opens
//    `{RUNTIME_URL}/runs` and reads a run card's `data-cid` from the DOM. That page is Oracle's
//    own pipeline dashboard. B-02 (stories/B-02-lead-index.md) is `ui: false` and has no `/runs`
//    route, now or in any later story — B-02 reads a manifest CID Task A already published
//    (`contract/v1/sample.parquet` pre-A-11, then Task A's own published manifest), it does not
//    list runs itself. There is no in-repo page this fixture could point at instead.
// 2. `scripts/verify-manifest.ts` (vendored 2026-10-23, see docs/reuse-log.md) is itself
//    currently broken here — it imports `../pipeline/publish/src/verify.js`, which was never
//    vendored (only the thin CLI wrapper was copied, not its implementation). That IS real,
//    separate work: B-02's own front matter (`reuses`) calls out `scripts/verify-manifest.ts`
//    for reuse in the sync job's CID-verification step (AC-1), so whoever implements that step
//    should vendor `pipeline/publish`'s `verify.ts`/`cid.ts`/`jcs.ts` (self-contained; depends
//    only on `@countylens/contract`, i.e. this repo's already-vendored `@crm/oracle-contract`)
//    directly into the sync job's dependencies at that point, pinned per ADR-07. That fix
//    belongs in the implementation task, not in resurrecting this E2E spec, which would still
//    fail on problem 1 above even after problem 2 is fixed.
import { test } from "@playwright/test";

test("out of scope for B-02", () => {
  test.skip(
    true,
    "A-03 Oracle hosted-dashboard verify-manifest CLI assertions are out of scope for B-02 — see file header",
  );
});
