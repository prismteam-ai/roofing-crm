---
gate: G5
artifact: specs/003-map-search/plan.md, specs/003-map-search/tasks.md
artifact_version: "f6f2fe6 (B-03: plan, tasks and analyze)"
run_date: 2026-10-23
tool: Claude
verdict: FAIL
---

# Gate G5 pre-check: B-03 Tasks + Low-Level Design

This is an AI pre-check. It reports gaps only. The user records the gate decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Clarified | PASS | No `[NEEDS CLARIFICATION]` in `specs/003-map-search/spec.md`. Clarifications are in commit cc25982. |
| C-02 | Phase structure | FAIL | Order is Setup, Foundational, US1 (P1), US2 (P1), US3 (P2), US4 (P2), then `## Phase Z`. There is no Polish phase. Phase Z is the verification phase, but it is not labelled Polish. Fix: retitle the heading `Phase Z (Polish): Prove on the hosted runtime`. |
| C-03 | Task format | FAIL | (a) T001–T005 have no story link (they are Setup or Foundational; the criterion asks for a link on every task). (b) Exact file paths are missing on T001 (directory only), T035 ("Wire `property` into `appRouter`"), T038 ("Wire the drawer…") and T039 ("…in `PropertyDetail.tsx`"). (c) `[P]` is wrong on T003 and T005, which depend on T002 and T004 (the failing tests). |
| C-04 | Tests first | FAIL | T025a (copied `filter-sheet-controlled.test.tsx` and `explore-filters.test.tsx`) comes after T024 (FilterSheet) and tests `ExploreFilters.state.ts`, which is only copied later in T030. The test does not precede the code it covers. Fix: move T025a before T024 and copy `ExploreFilters.state.ts` in that same task or earlier. |
| C-05 | Live verification last | PASS | TZ01–TZ06 are the last task block: reviewers, deploy, Playwright against RUNTIME_URL, smeargle, agents.verify, evidence and traceability. Trailing sections (Dependencies, Implementation Strategy) are not tasks. |
| C-06 | LLD complete | FAIL | plan.md has components, integration points and a test approach. It has no data-flow section. Fix: add a 3-line flow (web → `packages/api-client` → `search.properties` → `LeadIndex`/DuckDB → response) that cites architecture-constitution §2.4. |
| C-07 | Architecture conformance | FAIL | (a) T021 runs the AC-4 scale check in Playwright against the hosted runtime, using `tests/fixtures/sample-travis/` (synthetic). That conflicts with P0-4 and the spec assumption that synthetic data is test-only and never a hosted check. Fix: keep the synthetic scale assertion in Vitest (`apps/api/test/search.properties.test.ts`) and make the hosted AC-4 check run on the real A-03 sample. (b) The roof-age default of 15 and the `isAgedRoof` rule are not placed in `packages/domain` (arch §4 lists `isAgedRoof`). Fix: add `isAgedRoof` and `DEFAULT_ROOF_AGE_YEARS` to `packages/domain`. This adds no new decision. The Complexity Tracking entry for `packages/domain` already covers it. |
| C-08 | Kit usage | PASS | `specs/003-map-search/agent-design.md` has one verbatim consult (metagross, the only agents.design agent). plan.md has a filled Kit Agent Ownership section that cites it, names the builder skills and lists the code patterns. |
| C-09 | Coverage | PASS | FR-001 to FR-007 and NFR-001 each map to at least one task (T006–T018, T009/T015, T019–T025, T026–T030, T031–T039, T018a). |
| C-10 | Analyze | PASS (on record) | Commit f6f2fe6 records 0 CRITICAL, 1 HIGH (fixed: T018a) and 1 MEDIUM (fixed: T025a, T030a). No saved analyze report was found, so re-run `/speckit-analyze` after the fixes above. |

Verdict: FAIL (5 checks FAIL: C-02, C-03, C-04, C-06, C-07).

## Fix list (by impact on the assessment score)

1. C-07a: move the synthetic scale assertion out of Playwright (T021) into Vitest; run hosted AC-4 on the real sample.
2. C-07b: add `isAgedRoof` and `DEFAULT_ROOF_AGE_YEARS` to `packages/domain`.
3. C-04: move T025a before T024; copy `ExploreFilters.state.ts` before its test.
4. C-03: add exact paths to T001, T035, T038, T039; add a shared label to T001–T005; drop `[P]` from T003 and T005.
5. C-02: retitle Phase Z as Polish.
6. C-06: add a data-flow paragraph to plan.md.

Not applied. The user decides whether to change the artifacts.
