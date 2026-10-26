---
gate: G7
artifact: branch 003-map-search
artifact_version: commit 9702041
run_date: 2026-10-24
tool: Claude
verdict: PASS (with documented exceptions)
---

# G7 pre-check: B-03 Search a radius for aged roofs and open permits, with full detail

| # | Check | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Tasks done | PASS (fixed) | All 49 tasks in `specs/003-map-search/tasks.md` were unticked despite the work being done — ticked, matching the real, tested, reviewed state (commit `5e321ff`). |
| C-02 | Unit tests | PASS (fixed) | `docs/reports/UT-B-03.md`: 80 files, 708 tests (703 passed, 5 pre-existing skips), 100% pass rate. Found and fixed: `apps/web` coverage was 85.33% stmts overall with `PermitChip.tsx` at 0% and `ResultRow.tsx` at 46%, both under the 80% bar — now 96.88% stmts / 98% lines, no file under 80% (`apps/domain`/`apps/api`/`packages/ui` were already ≥80%). |
| C-03 | Code review | PASS | `docs/reviews/CR-B-03.md`: `metagross` 80/100, `audino` 48→84 (round 1, Critical UI-wiring gap fixed) → 81/100 (full re-review after the structural rebuild), `/code-review medium` (8 findings, all fixed or explicitly deferred with reasons recorded). Every score ≥75. Zero open Critical findings — the one Critical (`audino` round 1: built UI never wired into `Map.tsx`) was fixed the same session and re-scored. |
| C-04 | TC executed on hosted URL | PASS (with documented exceptions) | `testplans/B-03-test-cases.md` § 11: every TC has a dated result against `https://003-map-search.d1zmhc6kkyzsbe.amplifyapp.com` (never localhost), build sha `5e321ff`/`cc9ba00`. 9 TCs (001, 004, 006, 007, 009, 026, plus the responsive suite) genuinely PASS on the hosted preview. 16 TCs (011–023, NF-01) are recorded **BLOCKED (GAP-7)**: `crm-leads` (B-07's table) doesn't exist in this AWS environment, so B-02's index was never promoted — every search honestly returns `INDEX_NOT_READY` rather than invented data, which is itself the correct, tested behavior, but it blocks live proof of any AC needing a populated result. 4 TCs (008, 010, 024, 025) have no dedicated Playwright test yet — recorded "not run — tracked as follow-up", not silently passed. |
| C-05 | Defects closed | PASS | No `docs/defects/ERR-*.md` files exist for this story — every finding from every review round was fixed in the same session (verified: `git log` shows 22 commits, each either a feature/fix commit or a docs commit, no commit left a Critical/High finding unresolved). The TCs blocked by GAP-7 are documented gap-linked cases (`testplans/B-03-test-cases.md` § 10), the same pattern `docs/evidence/B-02.md` already established for its own `crm-leads` dependency — not undocumented failures. |
| C-06 | No open Critical | PASS | Zero open Critical defects. The one Critical found (`audino` round 1, UI never wired in) was fixed and re-scored above 75 the same session. |
| C-07 | Evidence | PASS | `docs/evidence/B-03.md` exists: hosted URL, real manifest CID (confirmed live by direct S3/DynamoDB query), 3 screenshots (`docs/evidence/img/B-03-0{1,2,3}-*.png`), § B-04/B-05/B-06 sections, an honest Known Gaps table (GAP-1, GAP-3 through GAP-7), and the full review history. |
| C-08 | Traceability | PASS | `docs/traceability.md`: G4–G7 rows for B-03 present (G7 row updated below). `docs/kit-usage.md`: B-03/04/05/06 rows (merged into one build/review round) and every reviewer's score recorded. |
| C-09 | Commits | PASS | All 22 commits on `003-map-search` (ahead of `feature/roofing-crm`) start with `B-03: `. No secrets found in the diff (checked: no AWS access keys, no literal passwords/tokens committed — credentials were fetched from Secrets Manager into shell env vars at test-run time only, never echoed or written to a file). |
| C-10 | Story status | PASS (pending the user's decision) | `stories/B-03-map-search.md`'s front matter is `status: Draft`, matching this repo's own convention (B-01/B-02 only flip `status`/`gate`/`qc_testability_signoff` at the final G7-approval commit, not mid-story) — ready to be set to `Done` once the user approves G7 and the merge happens. |

## Fix list (already applied, nothing outstanding)

Both findings this pre-check surfaced were fixed before this report was finalized:
1. C-01: tasks.md checkboxes ticked (commit `5e321ff`).
2. C-02: `PermitChip`/`ResultRow` test coverage raised from 0%/46% to 100%/92% (commit `5e321ff`).

## Carried-forward exceptions (for the user's Round 2 decision, not blocking PASS)

1. **GAP-7 (crm-leads/B-07 not deployed)** blocks live proof of 16 TCs covering AC-3 through AC-7. This is a cross-story environmental blocker, not B-03 code — the mechanism is built, unit-tested, and will exercise live the moment B-07 deploys (same situation `docs/evidence/B-02.md` already documented for its own dependency on the same table).
2. **4 TCs (008, 010, 024, 025) have no dedicated Playwright test yet.** Their mechanisms are either covered by an equivalent test elsewhere (TC-024 by `tests/e2e/B-01.spec.ts`'s tile-failure test) or by source review only. Recommend tracking as a small follow-up task, not a merge blocker, given GAP-7 means they'd currently only re-prove the same not-ready state TC-001 already covers.
3. **The live demo** (README/story Demo Script's literal "5-mile radius near Pflugerville" step) will show zero results on this exact sample slice (closest real property is 5.52 mi) until A-11's full county publishes — flagged once already at Round 1, carried forward here for the demo-recording decision.

Not approved here — the user records the Decision line in `stories/B-03-map-search.md`'s Gate G7
table (not yet present in that file; add it alongside the existing G4 table before merge) and in
`docs/traceability.md`'s G7 row.
