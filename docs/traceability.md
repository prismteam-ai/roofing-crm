# Traceability: Roofing CRM (Task B)

There are two matrices. The **requirements matrix** gives each README acceptance criterion and demo line one row. The **chain matrix** follows each feature down to its release. An empty cell means something is missing.

Every artifact names its parent in its front matter, so the `developmentsupport-progress` skill can rebuild the chain matrix from the files. You fill only the first matrix by hand.

Source: `README.md` at commit `f874802`. Evaluation points B1–B6 are defined in `docs/01-intent.md` § 8. Stories and evidence files follow `../assessment-guide/reference/B-roofing-crm.md` § 5–6; FEAT IDs come at G1, spec FRs at G5, test cases at G6, demo times at release.

## 1. Requirements matrix (README → evidence)

*Story merge (2026-10-21, before P8):* the 11 stories run as 5 merged stories. Story IDs here are **part** IDs: B-10 → B-01 · B-04, B-05, B-06 → B-03 · B-08 → B-07 · B-11 → B-09. Evidence for a part goes in its merged story's file, one section per part (for example `docs/evidence/B-03.md` § B-04).

Rows: AC-n = acceptance criteria, R-n = requirements stated only in Context or Description, OOS-n = out-of-scope items (proved by their absence or a mock), D-n = demo transcript lines.

| # | README criterion / demo line | Eval point | FEAT | Story (US) | Spec FR | Test case | Evidence | Demo time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | Default the map and search experience to a particular county, with support for exploring properties in the user's selected area. | B1 | FEAT-B01 | B-01 | FR-001 | TC-001, TC-006, TC-010 | docs/evidence/B-01.md | 2026-10-23 |
| AC-2 | Allow users to center property search on current GPS location and/or a pin dropped on the map. | B1 | FEAT-B03 | B-03 | | | docs/evidence/B-03.md | |
| AC-3 | Allow users to set a configurable search radius around the selected location. | B1 | FEAT-B03 | B-03 | | | docs/evidence/B-03.md | |
| AC-4 | Display properties within the radius that have roofs older than a configurable age threshold (default suggestion: 15 years). | B2 | FEAT-B04, FEAT-B02 | B-04 (data: B-02) | FR-002, FR-003 (B-02's data foundation — count reconciliation and missing-roof-age preservation; B-04 builds the display on top) | B-02-TC-004, B-02-TC-006, B-02-TC-007 | docs/evidence/B-04.md | |
| AC-5 | Display properties within the radius that have open roofing permits, with emphasis on permits that have remained open for an extended period. | B3 | FEAT-B05, FEAT-B02 | B-05 (data: B-02) | FR-001, FR-004 (B-02's data foundation — verified permit fetch and idempotent re-sync; B-05 builds the display on top) | B-02-TC-001, B-02-TC-008 | docs/evidence/B-05.md | |
| AC-6 | Show permit details in the UI, including permit status, age/open duration, contractor name, and BBB rating score when available. | B3 | FEAT-B06 | B-06 | | | docs/evidence/B-06.md | |
| AC-7 | Present a browsable list of matching roofing lead candidates derived from the map/radius filters. | B6 | FEAT-B08 | B-08 | FR-004 | B-07-TC-011, B-07-TC-012, B-07-TC-013, B-07-TC-016 (scale variant deferred, see docs/evidence/B-07.md) | docs/evidence/B-07.md § B-08 | |
| AC-8 | Support creating and managing CRM lead records from identified properties and permits. | B4 | FEAT-B07 | B-07 | FR-001, FR-002, FR-003 | B-07-TC-001 to B-07-TC-010 | docs/evidence/B-07.md | |
| AC-9 | Provide a RAG-backed agent that answers natural-language queries about roofing opportunities using available property and permit data. | B5 | FEAT-B09 | B-09 | FR-001, FR-002, FR-003, FR-004, FR-007 (also FR-005, FR-006, FR-008 for the B-11 hardening part: responsive suite, DLQ alarm, prototype re-audit) | B-09-TC-001 to B-09-TC-015, B-09-TC-020, B-09-TC-025, B-09-TC-025b to B-09-TC-027; golden queries G1 to G7 and Austin variants A1 to A5 (B-09-TC-NF-01 not proven as specified, see docs/reports/TR-B-09.md); B-11 part: B-09-TC-016, B-09-TC-017, B-09-TC-NF-02, B-09-TC-018, B-09-TC-019, B-09-TC-022, B-09-TC-023 (TC-017, TC-019b and the design sign-offs deferred) | docs/evidence/B-09.md; docs/reports/TR-B-09.md; docs/reviews/CR-B-09.md | |
| AC-10 | Keep data gathering, ingestion, and source-system integration out of scope; consume pre-existing/available datasets. | B6 (also the access boundary) | FEAT-B02 | B-02 | FR-001 | B-02-TC-001, B-02-TC-003 | docs/evidence/B-02.md | — (no UI; this story has no demo line of its own, per spec.md — it underlies D-1, D-3, D-4) |
| AC-11 | Show (disabled) sections on the CRM that would expand the product beyond the initial lead-identification workflow. | B6 | FEAT-B10 | B-10 | FR-004, FR-005 | TC-005, TC-008, TC-009 | docs/evidence/B-01.md § B-10 | 2026-10-23 |
| R-1 | Context: finding and qualifying **residential and commercial** roofing leads. | B2 | FEAT-B04, FEAT-B02 | B-04 (data: B-02) | | | docs/evidence/B-04.md | |
| R-2 | Context: turn signals into **actionable outreach opportunities**. | B4 | FEAT-B07 | B-07 | FR-001, FR-003 | B-07-TC-001, B-07-TC-008 | docs/evidence/B-07.md | |
| R-3 | Description: the UI presents **property** and permit details, including contractor information. | B3 | FEAT-B06 | B-06 | | | docs/evidence/B-06.md | |
| R-4 | Description: example agent query "show me open roofing permits older than five years within five miles of [city xyz]". | B5 | FEAT-B09 | B-09 (golden query) | FR-001, FR-004 | G3 (B-09-TC-011, Manor, honest empty on Run 2: its one old permit is stalled, not open), G2 (B-09-TC-010), A2 (answered, 854 open or stalled permits over 5 years within 5 mi of Austin) | docs/evidence/B-09.md | |
| OOS-1 | Out of scope: property, permit, ownership or enrichment data collection and ingestion pipelines. | B6 (access boundary) | FEAT-B02 | B-02 | FR-001 | B-02-TC-001, B-02-TC-003 | docs/evidence/B-02.md | — (no UI; proved by the architecture's absence of any ingestion code path — only CID-fetch-and-verify) |
| OOS-2 | Out of scope: live BBB API integration beyond displaying scores already in the data. | B3 | FEAT-B06, FEAT-B14 | B-06 | | | docs/evidence/B-06.md | |
| OOS-3 | Out of scope: actual outbound messaging to property owners (can be mocked or deferred). | B6 | FEAT-B10, FEAT-B13 | B-10 | | | docs/evidence/B-10.md | |
| D-1 | Open the CRM centered on a particular county. | B1 | FEAT-B01 | B-01 | FR-001 | TC-001 | docs/evidence/B-01.md | 2026-10-23 |
| D-2 | Drop a pin (or use GPS) and set a search radius. | B1 | FEAT-B03 | B-03 | | | docs/evidence/B-03.md | |
| D-3 | Show roofs older than the age threshold (e.g., 15 years) within the radius. | B2 | FEAT-B04 | B-04 | | | docs/evidence/B-04.md | |
| D-4 | Highlight properties with open roofing permits, prioritizing long-open permits. | B3 | FEAT-B05 | B-05 | | | docs/evidence/B-05.md | |
| D-5 | Open a selected property/permit and review contractor details and BBB rating where available. | B3 | FEAT-B06 | B-06 | | | docs/evidence/B-06.md | |
| D-6 | Convert one or more matches into CRM lead records. | B4 | FEAT-B07 | B-07 | FR-001, FR-002 | B-07-TC-001, B-07-TC-005, B-07-TC-007, B-07-TC-008 | docs/evidence/B-07.md | |
| D-7 | Ask the RAG agent a natural-language query for roofing opportunities in the area and show relevant results. | B5 | FEAT-B09 | B-09 | FR-001, FR-002, FR-004 | B-09-TC-001, B-09-TC-001a (A1), B-09-TC-004, B-09-TC-006, B-09-TC-015 (G7); B-09-TC-002 (Open on map) deferred, see docs/reports/TR-B-09.md | docs/evidence/B-09.md | |
| D-8 | Demonstrate filtering leads by roof age, permit status/open duration, and location radius. | B6 | FEAT-B08 | B-08 | FR-004 | B-07-TC-011, B-07-TC-012 (50+ leads deferred, see docs/evidence/B-07.md) | docs/evidence/B-07.md § B-08 | |
| D-9 | Show disabled/placeholder sections for future CRM expansions beyond lead identification. | B6 | FEAT-B10 | B-10 | FR-004, FR-005 | TC-005, TC-008 | docs/evidence/B-01.md § B-10 | 2026-10-23 |

## 2. Chain matrix (BN → release)

| BN | VIS | FEAT | US | REQ | TASK | TC | Code (merge commit) | CR | REL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BN-B | VIS-B | | | | | | | | |

*BN-B's remaining columns (FEAT/US/REQ/TASK/TC/Code/CR/REL) are intentionally left blank until G8 (release) — this row rolls up all five merged Task B stories (B-01, B-02, B-03, B-07, B-09), and only two (B-01, B-02) are built as of 2026-10-23. Per-story gate status lives in `docs/progress.md` and § 3's gate log below.*

## 3. Gate log

| Gate | Artifact | Version | Pre-check | Decision | Date |
| --- | --- | --- | --- | --- | --- |
| G0 | docs/01-intent.md | 0.2 | PASS | Approved | 2026-10-21 |
| G1 | docs/feature-list.md | 0.2 | PASS | Approved | 2026-10-21 |
| G2 | docs/plan.md | 0.1 | PASS | Approved | 2026-10-21 |
| Design CP | design/ | | | | |
| G3 | docs/architecture-constitution.md | 1.0 | PASS | Approved | 2026-10-23 |
| G4 (B-01) | stories/B-01-crm-shell.md | | PASS | Ready | 2026-10-23 |
| G5 (B-01) | specs/001-crm-shell/{plan,tasks}.md | | PASS (4 rounds, structural fixes) | Approved | 2026-10-23 |
| G6 (B-01) | testplans/B-01-test-cases.md | | PASS (4 rounds; TD-4 polish exceptions) | Approved with exceptions | 2026-10-23 |
| G7 (B-01) | docs/gates/G7-B-01-precheck.md | | PASS (TD-5 coverage exception) | pending Round 2 | 2026-10-23 |
| G4 (B-02) | stories/B-02-lead-index.md | | PASS | Ready | 2026-10-23 |
| G5 (B-02) | specs/002-lead-index/{plan,tasks}.md | | PASS (fixed C-03/C-04/C-07, 3 recorded judgment calls) | Approved | 2026-10-23 |
| G6 (B-02) | testplans/B-02-test-cases.md | | FAIL (strict AI reading); ratified by the user at G7 Round 2 | Approved with exceptions (no-UI automation substitution) | 2026-10-23 |
| G7 (B-02) | docs/gates/G7-B-02-precheck.md | | FAIL (strict AI reading, 4 checks); PASS against the walkthrough's own recommended bar | Approved | 2026-10-23 |
| G4 (B-03) | stories/B-03-map-search.md | | PASS (3 wording fixes: NFR traceability, prototype paths, AC-4 wording) | Ready | 2026-10-23 |
| G5 (B-03) | specs/003-map-search/{plan,tasks}.md | | FAIL (5 findings: synthetic data in hosted Playwright, missing `isAgedRoof`, task-before-its-file-exists ordering, imprecise paths); all fixed | Approved | 2026-10-23 |
| G6 (B-03) | testplans/B-03-test-cases.md | | FAIL (3 findings: placeholder CIDs, missing login/URL steps, bundled steps); fixed by querying the live B-02 index directly | Approved with exceptions (GAP-1/3/4/5/6: Vitest-only proofs or explicitly blocked where real data can't demonstrate an AC yet) | 2026-10-23 |
| G7 (B-03) | docs/gates/G7-B-03-precheck.md | | PASS (2 findings fixed: tasks.md checkboxes, apps/web coverage; GAP-7 exceptions carried forward) | pending Round 2 | 2026-10-24 |
| G7 (B-07) | docs/gates/G7-B-07-precheck.md | | FAIL on C-04 only, a PO-deferred scope (A-11 data); every fixable finding fixed (coverage, commit prefixes, defect records, test report, re-scores 85 and 86, CI green) | Approved with exceptions (see `stories/B-07-leads.md` Gate G7) | 2026-10-24 |
| G4 (B-09) | stories/B-09-agent-hardening.md | | PASS (native-build deviation documented) | Ready | 2026-10-24 |
| G5 (B-09) | specs/009-agent-hardening/{plan,tasks}.md | | PASS, 0 FAIL (fixed Phase N/Z ordering + 2 /speckit-analyze findings) | Approved (implementation proceeding) | 2026-10-24 |
| G6 (B-09) | testplans/B-09-test-cases.md | | FAIL, 1 FAIL (C-07: real test data — Run-1-manifest values left as placeholder tokens pending the data switch) | Approved with exceptions (real Run 2 test data in place; PO decision 2026-10-25; this replaces the earlier Held status) | 2026-10-25 |
| G7 (B-09) | docs/gates/G7-B-09-precheck.md | | FAIL on C-04 only (9 deferred or not-proven test cases, listed in `docs/reports/TR-B-09.md`); all other checks PASS, with caveats on C-03 and C-09 | Approved with exceptions (see `stories/B-09-agent-hardening.md` Gate G7) | 2026-10-25 |
| G4–G7 (other stories) | per story; see `docs/progress.md` | | | | |
| G8 | docs/release.md | | | | |
