// OUT OF SCOPE FOR B-02 (decided 2026-10-23, superseding the "Phase D" note T040 left below,
// which already flagged this correctly: "the /permits route and the CID-copy and Filebase
// fallback UI are B-03+ surfaces").
//
// This is Task A's own A-03-TC-032/033/034 (AC-5, FR-005): it drives Oracle's hosted `/permits`
// page UI, breaking its CID-copy host via `context.route` and asserting the page's
// `FallbackChip.tsx` / `data/fetch-by-cid.ts` fall back to the Filebase gateway with a specific
// label and fixed "both hosts down" text. B-02 (stories/B-02-lead-index.md) is `ui: false` and
// has no `/permits` route or fallback-chip UI at all — that UI belongs to whichever later story
// (B-03 map search or B-07 leads) renders this index, and it will read B-02's own
// `crm_property`/`crm_permit` tables, not re-implement Oracle's CID-copy/Filebase read path.
//
// Vendoring `lib/evidence.ts`, `lib/fixtures.ts` and `lib/manifest.ts` for this file specifically
// would also mean vendoring `fixtures.ts`'s `run` fixture, which opens `{RUNTIME_URL}/runs` —
// again, Oracle's own pipeline dashboard, not anything in this app's route tree now or in a
// later story.
//
// If B-03/B-07 need equivalent fallback-chip coverage for their own pages reading B-02's index,
// write it fresh against those routes' own fixed texts and DOM contract rather than reusing this
// file.
import { test } from "@playwright/test";

test("out of scope for B-02", () => {
  test.skip(
    true,
    "A-03 Oracle /permits fallback-UI assertions are out of scope for B-02 — see file header",
  );
});
