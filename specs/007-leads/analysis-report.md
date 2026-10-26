# Specification Analysis Report: B-07 leads

Run by `/speckit-analyze` (self-run, read-only) against `spec.md`, `plan.md`, `tasks.md` on 2026-10-24, before the G5/G6 pre-checks.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| M1 | Coverage gap | MEDIUM | spec.md SC-001; tasks.md | SC-001 ("lead visible ≤2s after creation") has no dedicated latency-measuring task in tasks.md | Acceptable as scoped: measured by Phase D's hosted Playwright timing (TZ03), not by this story's Vitest/RTL suite |
| M2 | Underspecification | MEDIUM | data-model.md "LEAD attributes"; tasks.md T003 | `LeadEvent.change`'s string format is illustrative prose, not a strict schema — a builder could format it inconsistently across `updateStatus` vs `addNote` | Low risk (history is for display, not machine parsing); flagged to the `metagross` builder brief in Phase C |
| L1 | Terminology | LOW | contracts/leads.md uses `leadKey`; data-model.md's `LEAD` item also exposes `leadId` (ULID) | Intentional distinction already documented in data-model.md ("the `pk` stays the dedupe key"), not drift | No action needed |
| L2 | Style | LOW | tasks.md T026 | Touches B-03's existing `PropertyDetail.tsx` — already flagged in tasks.md's own Dependencies §5 | No action; already mitigated |

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Yes | T006, T010, T013–T017, T026 | Create + signals snapshot + UI entry point |
| FR-002 | Yes | T006, T007, T010, T013, T014, T015 | Conditional dedupe + 20-concurrent test |
| FR-003 | Yes | T008, T009, T010, T013–T015, T025 | Status/note persistence |
| FR-004 | Yes | T011, T016, T019, T023, T024 | Combined filters, URL state, shared query path with map |
| FR-005 | Yes | T005, T016, T021, T025 | Read-time "not in Run {n}" |
| SC-001 (2s) | Deferred | TZ03 | Hosted Playwright timing, not unit-testable here |
| SC-002–SC-005 | Yes | Same as FR-002/003/004/005 | — |

**Constitution Alignment Issues:** None after the G5 fix pass (service layer added at `apps/api/src/services/leads.ts` per architecture-constitution.md §4/§9; JWT authorization is inherited automatically from the existing API Gateway authorizer, confirmed from `apps/api/src/trpc.ts`).

**Unmapped Tasks:** None — every task maps to at least one FR, or is Setup/Foundational/Polish/Phase Z.

**Metrics:**
- Total Requirements: 5 FR + 5 SC (5 distinct, SC maps 1:1 to FR)
- Total Tasks: 30 (T001–T030) + 6 Phase Z (TZ01–TZ06)
- Coverage %: 100% (5/5 FRs have ≥1 task)
- Ambiguity Count: 0
- Duplication Count: 0
- Critical Issues Count: 0

**Next Actions:** No CRITICAL or HIGH issues found. Both MEDIUM items are already mitigated by the story's phasing (M1 deferred to Phase D by design, M2 a builder-brief note). Proceeded to G5/G6 pre-checks; G5 took three rounds to clear structural gaps (service-layer omission + missing dependency injection for `LeadRepo` per §4, plan/tasks file-path mismatch for the URL codec, missing explicit paths, no Phase Z tasks, a misattributed design-consult citation, and the ADR-04 projection-timing choice needing a formally recorded §13 deviation — PO-approved 2026-10-24); G6's first run found two test-case completeness gaps (abbreviated steps, unconfirmed exact copy), fixed directly. This report re-validated after the round-2/3 fixes landed — no new findings introduced by those fixes.
