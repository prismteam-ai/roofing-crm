# Feature Specification: Lead search index from Task A's published data

**Feature Branch**: `002-lead-index`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Specify the story in stories/B-02-lead-index.md. Every AC (AC-1 to AC-4) becomes at least one FR with the same number. Header from the front matter (eval points B2, B3, B6). Facts: ../assessment-guide/reference/B-roofing-crm.md and Task A's contract/v1. No technology choices."

**Story**: `stories/B-02-lead-index.md` | **Evaluation point**: B2, B3, B6 | **Demo line(s)**: none directly — this story is the data foundation under demo lines D-1, D-3, D-4

**Owner agents** (from the story front matter; used by the plan, not by this spec): design `alakazam`, `espeon`, `machamp` · builder `espeon` (index) + `machamp` (batch/sync) · reviewers `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` · verify: index doc count = Oracle `v_property` count (checked by `donphan` through the Oracle MCP), ± documented difference

> Every story acceptance criterion becomes at least one FR below. No technology choices in this file; they belong in plan.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a trustworthy, verified copy of Task A's published data (Priority: P1)

As the CRM (on behalf of every later story), the system reads Task A's published property and roofing-permit tables by content identifier (CID), verifies every byte against that CID, and builds its own fast, queryable copy, so that map search, roof-age and permit filters, leads and the agent all run against one honest, reconciled index instead of fetching from Task A at request time.

**Why this priority**: Nothing else in the CRM (map search, candidate lists, leads, the agent) can run until a verified index exists. This is the data foundation for evaluation points B2 (aged-roof leads), B3 (open/long-open permits) and B6 (filtering + scale).

**Independent Test**: With no CRM UI built yet, run the sync job against Task A's published manifest, then query the resulting index directly and confirm row counts and the source manifest identifier are present on every row.

**Acceptance Scenarios**:

1. **Given** Task A has published a frozen manifest identifier for its data contract, **When** the sync job runs, **Then** it fetches the property and roofing-permit tables by that identifier (verified byte-for-byte against it, with fallback sources if the primary is unavailable), and writes its own property and permit records, each carrying the source manifest identifier.
2. **Given** one part's downloaded bytes fail verification, **When** the sync job detects the mismatch, **Then** that part is quarantined, an operator is alerted, and the previously validated index keeps serving — no partial promotion of an unverified run.

---

### User Story 2 - Prove the index matches Task A's published scale (Priority: P1)

As the CRM, the system reconciles its own record count against the count Task A published for the same run, so that a rep (and the evaluator) can trust the index is complete, not a silent subset.

**Why this priority**: Evaluation point B6 depends on the index reflecting real scale; an undetected gap would silently under-serve every later search.

**Independent Test**: After a sync run against the full county manifest, compare the index's property record count to the manifest's published coverage count, and have an independent party confirm the count against Task A's data directly.

**Acceptance Scenarios**:

1. **Given** the full Travis County run manifest (not a sample), **When** the sync completes and its internal validation passes, **Then** the index's property record count equals the manifest's published coverage count exactly, or the difference is at most 0.1% of that count, with every such difference written to a documented evidence record and its reason stated — a difference over 0.1% is a failure, not a documented pass — and an independent check confirms the count against Task A's own data.
2. **Given** a new run's record count drops more than 5% from the previous run, **When** validation runs, **Then** promotion is held for operator review, never silently promoted.

---

### User Story 3 - Preserve missing-data reasons exactly, never guess (Priority: P1)

As the CRM, the system preserves every "missing" reason Task A publishes for a field it cannot determine (for example, roof age with no permit history), rather than guessing or interpolating a value, so that reps and the agent never act on an invented number.

**Why this priority**: Evaluation point B2 (aged-roof leads) is only trustworthy if a missing roof age is shown as missing, with its reason — never a fabricated age. This protects data honesty across every later story that reads the index.

**Independent Test**: Index a published property row whose roof-age basis is recorded as missing, and confirm the resulting index row still carries that exact missing reason rather than any computed or inferred age.

**Acceptance Scenarios**:

1. **Given** a published property row has its roof-age basis recorded as "missing" (for example, a parcel with no permit history), **When** the sync indexes it, **Then** the row is written with its exact missing reason preserved — never a guessed or interpolated roof age.

---

### User Story 4 - Make the sync safe to re-run (Priority: P2)

As the CRM, the system is safe to re-run the sync against a manifest it has already indexed, writing nothing new, so that a scheduled or retried sync never corrupts the index or wastes cost.

**Why this priority**: Supports evaluation point B6's scale and cost requirements and keeps the sync safe to run on a schedule without operator babysitting; lower priority than the data-correctness stories above since it protects efficiency and safety, not the data's truthfulness.

**Independent Test**: Run the sync twice against the same manifest identifier and confirm the second run creates no new stored objects.

**Acceptance Scenarios**:

1. **Given** a sync run has already indexed manifest identifier X, **When** the same identifier is synced again, **Then** zero new records/objects are created, proving the run is idempotent.

---

### Edge Cases

- One part's downloaded bytes fail verification against its manifest-stated checksum → that part's run is quarantined, an alarm fires, and the previous validated index keeps serving; no partial promotion.
- A new run's record count drops more than 5% from the previous run → promotion is held for operator review (a lineage/cost gate), never silently promoted.
- A published row's field is recorded as missing for a documented reason → the system preserves that reason verbatim; it never guesses or interpolates a replacement value.
- The same manifest identifier is synced a second time → the system detects it has already indexed that content and writes nothing new.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch Task A's published property and roofing-permit tables only by their content identifier (CID), verify every byte against that identifier before use, and never call Task A's internal API, database, or any non-published store. *(AC-1)*
- **FR-002**: System MUST record its own property-record count against Task A's published coverage count for the same run, accept only an exact match or a documented difference of at most 0.1% of that count, and flag any larger or undocumented mismatch as a failure rather than silently accepting it. *(AC-2)*
- **FR-003**: System MUST preserve every "missing" reason code published by Task A for a field it cannot determine, rather than inventing, guessing, or interpolating a replacement value. *(AC-3)*
- **FR-004**: System MUST be safe to re-run against a manifest identifier it has already indexed, creating no duplicate or new records on a repeat run of the same identifier. *(AC-4)*

### Key Entities

- **Property record**: The CRM's own indexed copy of a published property, carrying its source manifest identifier, roof-age value with its basis and confidence (or a missing reason), and whether it is residential or commercial.
- **Permit record**: The CRM's own indexed copy of a published roofing permit, carrying its source manifest identifier, status, open/close duration, and the identity of the fetch verification it passed.
- **Sync run**: One execution of the sync process against one manifest identifier; tracks which parts were fetched, verified, and promoted, and whether validation passed.
- **Index pointer**: The record of which sync run's output is currently served; flips only after a run's validation passes, never partially.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every record in the index carries the source manifest identifier it came from; an evaluator can trace any record back to Task A's published data.
- **SC-002**: The index's property-record count matches Task A's published coverage count exactly for a given run, or differs by at most 0.1% with every such difference documented with a reason — a larger difference fails this criterion outright.
- **SC-003**: Zero records in the index show a guessed or invented value where Task A published a "missing" reason instead — every missing field states why it is missing.
- **SC-004**: Re-running the sync against an already-indexed manifest identifier creates zero new stored records, confirmed on two consecutive runs.
- **SC-005**: A sync run against a manifest the size of Task A's initial published sample completes end to end in under 5 minutes; a full-county run completes in under 30 minutes.
- **SC-006**: A run whose byte verification fails, or whose record count drops more than 5% from the previous run, never replaces the currently served index; the previous validated run keeps serving.

## Assumptions

- The story has no UI (`ui: false`); this spec covers the sync/index only. Map, list, lead, and agent UI that reads this index are specified in later stories (B-03, B-07, B-09).
- Task A's A-02 data contract is frozen (confirmed: status `Done`). Task A's full-county run (A-11) is not required to start; the sync is built and proven first against Task A's already-published sample manifest, per the project's sample-first delivery mode. Full-county reconciliation (User Story 2's scenario 1 at full scale) is exercised in shape only against the sample, and repeated for real once the full-county manifest is available — this does not change what the acceptance criterion means, only when it is exercised at full scale.
- "Independently confirms the count" means a second, separate check against Task A's own published data (not a re-read of this system's own index), to catch a mistake that a self-check alone would miss.
- No UI, authentication, or lead-management concepts are introduced by this spec; those are out of scope here and covered elsewhere.
