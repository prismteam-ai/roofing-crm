---

description: "Task list for B-03: map search (radius, roof age, permits, detail)"
---

# Tasks: Search a radius for aged roofs and open permits, with full detail

**Input**: Design documents from `specs/003-map-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present.

**Tests**: MANDATORY (constitution X, XXI, XXII). Every implementation task's test is written and
shown failing first.

**Builder**: `metagross` for every implementation task (constitution XV), as **exactly two**
parallel subagent groups for the `/speckit-implement` build wave (the story front matter names one
builder; the run book splits its work into two groups so both halves build at once):

| Group | Covers | User stories |
| --- | --- | --- |
| **Group 1 — map+radius+GPS** | `packages/domain` radius math, the extended `LeadIndex` radius query, `search.properties`, `CrmMap` pin-drop + radius ring + GPS, the two edge cases | US1 |
| **Group 2 — roof-age+permit layer+detail drawer** | roof-age threshold UI + counts, `search.permits` + the long-open badge, the copied filter/result components, `property.get` + the detail drawer + BBB-absent state | US2, US3, US4 |

**Organization**: phases map to the spec's 4 user stories (priority order); each task carries its
`[Story]` label and, in its text, which build group it belongs to.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, per `spec.md`

---

## Phase 1: Setup (shared, no story label)

- [x] T001 Create `packages/domain/package.json`, `packages/domain/tsconfig.json` (extending `packages/tsconfig`), `packages/domain/vitest.config.ts` per plan.md's Project Structure — shared by both build groups

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ CRITICAL**: both build groups depend on this phase.

- [x] T002 [P] Write failing Vitest cases for `bboxFor(center, radiusMi)` and `distanceMeters(a, b)` in `packages/domain/test/radius.test.ts` — fixed vectors matching the vendored `oracle-views`' `geo()` bbox/haversine constants (research.md "reusing… Task A's radius/roof-age SQL semantics")
- [x] T003 Implement `bboxFor`/`distanceMeters` in `packages/domain/src/radius.ts` to pass T002 (depends on T002 — not parallel with it)
- [x] T004 [P] Write failing Vitest cases for `isLongOpen(openDays)`, `openDurationLabel(openDays)` and `isAgedRoof(roofAgeYears, thresholdYears)` in `packages/domain/test/permit.test.ts` / `packages/domain/test/roofAge.test.ts` — `isLongOpen(1826) === false`, `isLongOpen(1827) === true` (research.md "the long-open badge threshold": 5 years × 365.25, rounded down, 1826 days); `isAgedRoof(15, DEFAULT_ROOF_AGE_YEARS) === true`, `isAgedRoof(14, DEFAULT_ROOF_AGE_YEARS) === false`
- [x] T005 Implement `isLongOpen`/`openDurationLabel` in `packages/domain/src/permit.ts`, and `isAgedRoof`/`DEFAULT_ROOF_AGE_YEARS = 15` in `packages/domain/src/roofAge.ts`, to pass T004 (depends on T004 — not parallel with it; architecture-constitution.md §5 names `isAgedRoof` as a shared rule, so the roof-age threshold is a named constant here, never a magic `15` scattered across the API and the UI)

**Checkpoint**: `packages/domain` is complete and tested; both groups can now build on it.

---

## Phase 3: User Story 1 — Center a search on a pin or GPS and set a radius (Priority: P1) 🎯 MVP — Group 1

**Goal**: radius search over the existing B-02 index, with pin/GPS input and the two edge cases.

**Independent Test**: drop a pin near Pflugerville, set a 5 mi radius, confirm the map redraws a
5 mi ring and every result's location is inside it — no roof-age/permit/detail code required.

### Tests for User Story 1 (write first) ⚠️

- [x] T006 [P] [US1] Write failing Vitest contract test for `search.properties` (radius bounds 0.5–25 mi per data-model.md: a value outside that range MUST be a Zod validation error, never silently clamped) in `apps/api/test/search.properties.test.ts`
- [x] T007 [P] [US1] Write failing Vitest test for the extended `LeadIndex.searchProperties` exact-circle cut (bbox prefilter, then `distanceMeters(center, row) < radiusMi * 1609.344`, nearest-first sort) in `apps/api/test/duckdb-node.test.ts` (extend the existing B-02 suite, do not replace it)
- [x] T008 [P] [US1] Write failing Playwright test for AC-1 (pin near Pflugerville 30.4394°N/−97.6200°W, 5 mi radius → ring redraws, results inside it) in `tests/e2e/B-03-map-search.spec.ts` (skipped/pending until Phase Z — target `RUNTIME_URL`, never `localhost`)
- [x] T009 [P] [US1] Write failing Playwright test for AC-2 (GPS permission denied → explicit "location denied" state, pin-drop fallback, never a blank map) in `tests/e2e/B-03-map-search.spec.ts`, using `context.grantPermissions(["geolocation"])` withheld / `context.clearPermissions()`
- [x] T010 [P] [US1] Write failing Playwright test for the zero-result edge case (0.5 mi near Lago Vista → "widen to {n} mi" suggestion, per the Round 1 decision on the increment) in `tests/e2e/B-03-map-search.spec.ts`
- [x] T011 [P] [US1] Write failing Playwright test for the outside-county edge case (GPS mocked to Williamson County coordinates via `context.setGeolocation` → explicit "outside the covered county" state, never an empty map) in `tests/e2e/B-03-map-search.spec.ts`

### Implementation for User Story 1

- [x] T012 [US1] Extend `SearchPropertiesQuery` in `apps/api/src/adapters/duckDbParquet.ts` with `center: {lat,lng}`/`radiusMi`, computing `bbox` via `packages/domain`'s `bboxFor` before the adapter's existing bbox filter, then applying the exact-circle cut (depends on T003, T007)
- [x] T013 [US1] Implement `search.properties` in `apps/api/src/routers/search.ts` per `contracts/search-api.md` (Zod: `center`, `radiusMi` 0.5–25, `roofAgeMinYears?`, `limit?` ≤100), returning `{ properties, counts, manifestCid, traceId }` (depends on T006, T012)
- [x] T014 [US1] Wire `search` into `appRouter` in `apps/api/src/routers/index.ts`
- [x] T015 [P] [US1] Implement `GpsButton.tsx` in `apps/web/src/components/Map/GpsButton.tsx` — `navigator.geolocation`, explicit denied/outside-county/unavailable states (never a silent failure), per the copied `CrmMapGpsDenied390`/`CrmMapGpsOutside390`/`CrmMapGpsUnavailable390` prototype states
- [x] T016 [P] [US1] Implement `RadiusControl.tsx` in `apps/web/src/components/Map/RadiusControl.tsx` — 0.5–25 mi, Atlas tokens only (P0-14)
- [x] T017 [US1] Extend `CrmMap.tsx` (`apps/web/src/components/Map/CrmMap.tsx`) with pin-drop, the live radius ring (drawn via `packages/domain`'s `bboxFor`/`distanceMeters` for client-side preview, per plan.md's shared-rule requirement), and wiring to `GpsButton`/`RadiusControl` (depends on T015, T016)
- [x] T018 [US1] Wire `Map.tsx` (`apps/web/src/routes/Map/Map.tsx`) to call `search.properties` via `packages/api-client` on pin/radius change, rendering the zero-result "widen to {current + 1} mi" state (fixed +1 mi steps, capped at 25 mi — Round 1 decision, 2026-10-23, not the doubling default) and the outside-county state (depends on T013, T017)

- [x] T018a [P] [US1] Copy `tests/e2e/perf.spec.ts` from `ORACLE` (base), adapt it to `search.properties`/`search.permits` (NFR-001: p95 < 3 s end to end on the hosted URL, architecture-constitution.md §10), ≥ 20 runs

**Checkpoint**: US1 fully functional and independently testable (AC-1, AC-2, both edge cases).

---

## Phase 4: User Story 2 — Narrow results to roofs older than a threshold (Priority: P1) — Group 2

**Goal**: roof-age threshold filter over the US1 radius result set, with basis/confidence shown
and a count that provably runs over the full index.

**Independent Test**: with a radius result set showing, set the threshold to 15 then 25 and
confirm the count drops and matches a direct query of the same inputs.

### Tests for User Story 2 (write first) ⚠️

- [x] T019 [P] [US2] Write failing Vitest test asserting `search.properties`'s `counts.afterRoofAge` is computed fresh (not cached) for every `roofAgeMinYears` value, over a fixture with a known age distribution, in `apps/api/test/search.properties.test.ts`
- [x] T020 [P] [US2] Write failing Playwright test for AC-3 (threshold 15 → only `roofAgeYears >= 15` rows, each showing `roofAgeBasis`/`roofAgeConfidence`) in `tests/e2e/B-03-map-search.spec.ts`
- [x] T021 [P] [US2] Write failing Vitest test for AC-4's scale assertion (threshold 15→25 → count strictly lower, matches a direct `search.properties` call with the same inputs) in `apps/api/test/search.properties.scale.test.ts`, run against `tests/fixtures/sample-travis/` — **Vitest only, never Playwright/hosted**: constitution P0-4 forbids synthetic/sample-shaped data from appearing in a deployed index or UI, so this fixture never reaches the Amplify preview; the hosted Playwright AC-4 assertion (T008/Phase Z) runs against the real A-03 sample instead, recording whatever count it finds (even if both counts are small) rather than the synthetic numbers

### Implementation for User Story 2

- [x] T022 [P] [US2] Generate `tests/fixtures/sample-travis/` (a few thousand synthetic rows in the `CrmProperty`/`CrmPermit` shape, marked `synthetic`, fake addresses/parcel ids; never deployed, never cited as real per WALKTHROUGH-B-sample-first.md §2) in a one-off generator script under `tests/fixtures/generate-sample-travis.ts`
- [x] T023 [US2] Add the `counts.afterRoofAge`/`counts.afterRadius` computation to `search.properties` (`apps/api/src/routers/search.ts`) — run the pipeline once with and once without `roofAgeMinYears`, both over the full index (depends on T013, T019)
- [x] T023a [US2] Copy `ExploreFilters.state.ts` from `ORACLE-u` into `apps/web/src/routes/Map/ExploreFilters.state.ts` (URL filter state), renamed from CountyLens-specific names — done here, before `FilterSheet.tsx`, because both this story's roof-age control (T024) and its permit-view toggle (T030) read/write it
- [x] T024 [US2] Add the roof-age threshold control to `FilterSheet.tsx` (`apps/web/src/routes/Map/FilterSheet.tsx`, copied from A-13's `ORACLE-u` worktree, renamed from CountyLens-specific names) — default `DEFAULT_ROOF_AGE_YEARS` (`packages/domain`, T005), 15–25+ range, reading/writing `ExploreFilters.state.ts` (depends on T023a)
- [x] T025 [US2] Render `roofAgeBasis`/`roofAgeConfidence` on `ResultRow.tsx` (`apps/web/src/routes/Map/ResultRow.tsx`, copied from A-13) alongside the age (depends on T024)
- [x] T025a [P] [US2] Copy `apps/web/test/filter-sheet-controlled.test.tsx` and `explore-filters.test.tsx` from `ORACLE-u`, adapted to this story's `FilterSheet`/`ExploreFilters.state.ts` (depends on T023a, T024 — both files must exist first)

**Checkpoint**: US1 + US2 both independently functional.

---

## Phase 5: User Story 3 — See open roofing permits, longest-open first (Priority: P2) — Group 2

**Goal**: a permit view over the same radius, sorted by open duration, with the long-open badge.

**Independent Test**: with a radius result set showing, switch to the permit view and confirm the
sort order and the badge on any permit open more than 5 years.

### Tests for User Story 3 (write first) ⚠️

- [x] T026 [P] [US3] Write failing Vitest contract test for `search.permits` (sort fixed to `"openDays"` descending, per contracts/search-api.md) in `apps/api/test/search.permits.test.ts`
- [x] T027 [P] [US3] Write failing Playwright test for AC-5 (permit layer sorted longest-open first; any permit with `openDays > 1826` carries the "long-open" badge) in `tests/e2e/B-03-map-search.spec.ts`

### Implementation for User Story 3

- [x] T028 [US3] Implement `search.permits` in `apps/api/src/routers/search.ts` per `contracts/search-api.md` — joins through the same radius-filtered property set as `search.properties`, attaches `isLongOpen` (`packages/domain`) per row (depends on T026, T012)
- [x] T029 [P] [US3] Implement `PermitChip.tsx` (`apps/web/src/routes/Map/PermitChip.tsx`, copied from A-13's `ORACLE-u` worktree) — renders the long-open badge from the `isLongOpen` flag, never recomputing it
- [x] T030 [US3] Add the permit-view toggle to `Map.tsx` and extend the already-copied `ExploreFilters.state.ts` (`apps/web/src/routes/Map/ExploreFilters.state.ts`, T023a) with the permit-view flag, calling `search.permits` (depends on T023a, T028, T029)

- [x] T030a [P] [US3] Copy `tests/e2e/A-13-vitals.spec.ts` from `ORACLE-u`, adapted to this story's CRM routes (Map, permit view)

**Checkpoint**: US1 + US2 + US3 all independently functional.

---

## Phase 6: User Story 4 — Review a property's full permit, contractor and BBB detail (Priority: P2) — Group 2

**Goal**: the property detail drawer: permit status/duration, contractor, BBB rating or an honest
"not available" + reason, and a lineage link back to Task A.

**Independent Test**: open a property near Manor with an open permit (full detail); separately,
open one whose permit has no published BBB rating (confirm the honest absent-state).

### Tests for User Story 4 (write first) ⚠️

- [x] T031 [P] [US4] Write failing Vitest contract test for `property.get` (returns `null` property, never throws, when the CID isn't in the promoted run; reads `bbb_status`/`bbb_status_reason` verbatim; `bbbStatus !== "rated"` always returns a non-empty `bbbStatusReason`) in `apps/api/test/property.get.test.ts`
- [x] T032 [P] [US4] Write failing Playwright test for AC-6 (property near Manor → status, open duration, contractor name, working "View lineage in Explorer" link) in `tests/e2e/B-03-map-search.spec.ts`
- [x] T033 [P] [US4] Write failing Playwright test for AC-7 (permit with `bbb_status !== "rated"` → "BBB rating not available" + the literal `bbbStatusReason` text, never blank or invented) in `tests/e2e/B-03-map-search.spec.ts`

### Implementation for User Story 4

- [x] T034 [US4] Implement `property.get` in `apps/api/src/routers/property.ts` per `contracts/property-detail.md` — calls the existing `LeadIndex.getProperty`, reads `bbb_status`/`bbb_status_reason` from the vendored `packages/oracle-contract` columns, constructs `lineageUrl` (depends on T031)
- [x] T035 [US4] Wire `property` into `appRouter` in `apps/api/src/routers/index.ts`
- [x] T036 [P] [US4] Copy `components/MissingReason`, `Provenance`, `CidDisplay` from `ORACLE` (base) into `packages/ui/src/{MissingReason,Provenance,CidDisplay}/`, renaming CountyLens-specific names, running the CRM's own tests after the copy
- [x] T037 [P] [US4] Copy `PropertyDetail` drawer + `ContractorBadge` from `ORACLE-u` into `apps/web/src/routes/Map/PropertyDetail/{PropertyDetail,ContractorBadge}.tsx`, renaming CountyLens-specific names
- [x] T038 [US4] Wire `apps/web/src/routes/Map/PropertyDetail/PropertyDetail.tsx` to `property.get` via `packages/api-client`, rendering the BBB-absent state (T033's assertion, using the copied `packages/ui/src/MissingReason`, T036) and the "no contractor" state (`CrmPropertyNoContractor390`) — never a blank field (depends on T034, T036, T037)
- [x] T039 [US4] Add the "View lineage in Explorer" link render to `apps/web/src/routes/Map/PropertyDetail/PropertyDetail.tsx`, new in the CRM — resolves to a real, already-published Task A record via the `lineageUrl` field from T034 (depends on T034, T037)

**Checkpoint**: all four user stories independently functional — the full merged story is feature-complete pending Phase Z.

---

## Phase Z: Prove on the hosted runtime (mandatory, always last — NOT run by this build wave)

**Purpose**: constitution I, XVI, XXII. Per the run book, `/speckit-implement`'s build wave (C2)
stops here; Phase E (after deploy) runs these tasks.

- [x] TZ01 Run the reviewer agents (`metagross`, `audino`) read-only; record scores in `docs/reviews/CR-B-03.md` (each ≥ 75 or justified)
- [x] TZ02 Push `003-map-search`; confirm the Amplify branch preview build succeeds; record the URL
- [x] TZ03 Run the Playwright scenario tests in `tests/e2e/B-03-map-search.spec.ts` (every TC in `testplans/B-03-test-cases.md`) against `RUNTIME_URL`; screenshots to `docs/evidence/img/`
- [x] TZ04 Run `smeargle` responsive-design-tests at 390/768/1440 on the hosted preview (UI story)
- [x] TZ05 Run the story's `agents.verify` check: Playwright with geolocation, 15→25 roof-age count change, permits sorted by open days, a BBB-not-available case
- [x] TZ06 Write `docs/reports/TR-B-03.md`, `docs/evidence/B-03.md` (§ B-04, § B-05, § B-06), the `docs/traceability.md` rows for B-03/B-04/B-05/B-06, and one `docs/kit-usage.md` line

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS every user story (both groups need `packages/domain`).
- **US1 (Phase 3, Group 1)**: depends on Foundational only.
- **US2, US3, US4 (Phases 4–6, Group 2)**: each depends on Foundational; US2/US3 additionally depend on US1's `search.properties`/radius plumbing (T012, T013) existing to extend, and US4 depends on nothing from US2/US3 — the two groups can run in parallel once Phase 2 is done, exactly as the run book's two-subagent build wave expects.
- **Phase Z**: depends on all of Phases 3–6; explicitly deferred to Phase E (post-deploy), not run in this build wave.

## Parallel Example: the two-group build wave

```text
# After Phase 1+2 (Foundational) complete, launch both groups in ONE message:
Group 1 subagent (metagross): T006–T018 (US1 — map+radius+GPS)
Group 2 subagent (metagross): T019–T039 (US2+US3+US4 — roof-age+permit layer+detail drawer)
```

## Implementation Strategy

### MVP first

US1 alone (Phase 3) is a demonstrable MVP: pin/GPS + radius over the real B-02 index, with both
edge cases. US2–US4 each add one more judged signal on top without breaking US1.

### Incremental delivery

Setup + Foundational → US1 (MVP) → US2 → US3 → US4 → Phase Z (deferred to Phase E). Each story adds
value without reworking an earlier one, since all four share the one `search.properties`/
`search.permits`/`property.get` contracts fixed in Phase 2/3 and never renamed later.
