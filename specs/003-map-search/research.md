# Phase 0 research: B-03 map search (radius, roof age, permits, detail)

No `NEEDS CLARIFICATION` markers were left in the Technical Context. Every technical choice below
was already decided in `docs/architecture-constitution.md` (ratified at G3), confirmed by the sole
design consult (`specs/003-map-search/agent-design.md`, metagross), or fixed by the already-built
B-01/B-02 code this story extends. This file records those decisions for traceability.

## Decision: where the radius and badge math live

- **Decision**: a new `packages/domain` package holds `bboxFor`/`distanceMeters` (radius math) and
  `isLongOpen`/`openDurationLabel` (permit badge math) as pure TypeScript functions, imported by
  both `apps/web` (for the live radius-ring preview and client-side badge rendering) and `apps/api`
  (for the actual filter/sort).
- **Rationale**: architecture-constitution.md §5 requires shared rules live in exactly one place so
  "the map, the list and the agent never disagree" (SC-06). B-01/B-02 had no shared pure rule to
  extract yet; B-03 is the first story where the UI and the API must compute the identical radius
  circle and the identical "long-open" cutoff.
- **Alternatives considered**: computing radius/badge logic only server-side and letting the web
  layer re-derive its own preview math — rejected, since any drift between the live ring the rep
  sees while dragging and the server's actual filter would itself be a bug class this story must
  avoid.
- **Source**: architecture-constitution.md §5, §9's module-boundary table (`packages/domain` row).

## Decision: reusing, not reimplementing, Task A's radius/roof-age SQL semantics

- **Decision**: the vendored `packages/oracle-views`' `radiusSql`/`roofAgeSql` builders (already
  used by the B-02 sync job to build the index) are the authority for *what counts as* inside a
  radius or at/above a roof-age threshold. B-03's request-time query against `crm_property`/
  `crm_permit` (the CRM's own flattened Parquet, different column casing from the raw `v_property`
  view) re-expresses the same bbox-then-haversine shape via `packages/domain`'s functions, computed
  in TypeScript rather than re-generated SQL — but the *formula* (bbox prefilter, then exact
  haversine cut) is copied, never redesigned.
- **Rationale**: ADR-07's "vendor, never re-implement" rule is about Task A's *semantics*
  (roof-age basis, status_class, etc.), which this story never touches. The radius formula itself
  is ordinary geometry, not a Task A semantic — but copying the same shape (bbox prefilter +
  haversine cut, same constants) avoids the map and the sync job silently disagreeing on what
  "inside 5 miles" means.
- **Alternatives considered**: calling `radiusSql` directly at request time — rejected, because it
  targets `v_property` (the raw vendored view), not `crm_property` (the already-synced, flattened
  index this story's adapter actually queries); re-deriving the formula from scratch with different
  constants — rejected for the drift risk above.
- **Source**: `packages/oracle-views/src/builders.ts` (`radiusSql`, `roofAgeSql`, `geo()`); ADR-07.

## Decision: the long-open badge threshold

- **Decision**: `openDays > 1826` (5 years × 365.25, rounded down), applied to the vendored
  `openDays` field — never recomputed from `issueDate`.
- **Rationale**: the design consult fixed this as a precise boolean on data the sync job already
  carries, matching the story's AC-5 wording ("open more than 5 years") exactly.
- **Alternatives considered**: `5 * 365` (1825) — rejected as one day short of a true 5-year cutoff
  in non-leap years; recomputing from `issueDate`/today — rejected, since `openDays` is already the
  vendored, authoritative value (ADR-07).
- **Source**: `specs/003-map-search/agent-design.md` (metagross).

## Decision: the BBB-absent state

- **Decision**: show "BBB rating not available" plus the literal `bbb_status_reason` text whenever
  `bbb_status !== "rated"` — never a blank field, never an invented rating. In v1, `bbb_status` is
  always `"not_checked"` (the `BBB_SOURCE` constant in the vendored contract), so this state is the
  common case, not an edge case, for the sample data this story is tested against.
- **Rationale**: matches constitution P0-4 and the story's AC-7 exactly; confirmed by the design
  consult against the actual vendored column names.
- **Alternatives considered**: omitting the BBB field entirely when absent — rejected, since the
  story and architecture-constitution.md §12.4 both require an honest reason to be shown, not an
  omission that could be mistaken for a loading state.
- **Source**: `packages/oracle-contract/src/columns.ts` (`bbb_status`, `bbb_status_reason`,
  `BBB_SOURCE`); ADR-03 (owner-name exclusion, by contrast, has no analogous "show the reason" rule
  — it is excluded at the schema level, not surfaced as missing).

## Decision: the zero-result "widen" increment

- **Decision**: fixed +1 mi steps — "widen to {current + 1} mi" each time, not doubling. Decided
  by the user at Round 1 (2026-10-23), overriding the walkthrough's own "double, capped at 25 mi"
  recommendation.
- **Rationale**: simpler, predictable UI copy; the user accepted the tradeoff of more taps to reach
  a non-empty result on a sparse sample (acceptable since the current sample is tiny and the
  full-county switch will make this edge case rare in practice).
- **Alternatives considered**: doubling, capped at 25 mi (the walkthrough's recommended default,
  not chosen); jumping straight to the nearest real result's radius (rejected — reveals index
  internals to the rep rather than a predictable UI step).
- **Source**: Round 1 decision, 2026-10-23 (`AskUserQuestion`, this session).

## Open item carried forward (not blocking this plan)

- Address and contractor *name* fields (contract v1.1, Task A follow-up FU-A-01) are not yet in the
  manifest this story tests against; the detail drawer already has a "no contractor" state from the
  A-13 copy (`CrmPropertyNoContractor390`) for exactly this gap, so no new state needs inventing —
  it will simply stop firing once FU-A-01 ships.
