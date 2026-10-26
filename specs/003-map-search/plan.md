# Implementation Plan: Search a radius for aged roofs and open permits, with full detail

**Branch**: `003-map-search` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-map-search/spec.md`

## Summary

Add the radius+GPS search, roof-age threshold filter, open-permit sort/badge and property detail
drawer to the existing Map screen (B-01) over the existing `DuckDbParquetLeadIndex` (B-02,
`apps/api/src/adapters/duckDbParquet.ts`). Two additions carry the whole story: (1) a new
`packages/domain` with pure, shared `bboxFor`/`distanceMeters`/`isLongOpen`/`openDurationLabel`
functions, so the map, the API and (later) the agent compute the same radius and badge rule
exactly once (architecture-constitution.md §5); (2) extending `LeadIndex`'s
`SearchPropertiesQuery`/`SearchPermitsQuery` (already shaped for bbox/roof-age/permit-sort by
B-02) to accept a center point + radius, and a new `apps/api/src/routers/search.ts` +
`property.ts` tRPC router exposing `search.properties`, `search.permits`, `property.get` —
wired into the existing `appRouter` (`apps/api/src/routers/index.ts`), which today only has
`health`+`auth`. The UI copies A-13's `FilterSheet`/`ResultRow`/`PermitChip`/`ContractorBadge`/
`PropertyDetail` drawer and `ExploreFilters.state.ts` URL-filter-state pattern (per the reuse
table), adds pin-drop + the browser Geolocation API to the existing `CrmMap` component, and adds
the "View lineage in Explorer" link that is new in the CRM. No new AWS resource: this story reads
the index B-02 already built and syncs (A-03 sample manifest), and adds API + UI only.

## Data flow (architecture-constitution.md §2.4)

`apps/web`'s `CrmMap`/`FilterSheet` call `search.properties`/`search.permits`/`property.get` via
`packages/api-client` (tRPC). Each procedure computes `bbox` from `center`/`radiusMi` via
`packages/domain`, calls the existing B-02 `LeadIndex` adapter (DuckDB over the already-promoted
`crm_property`/`crm_permit` Parquet — no new download, no new cold-load path), applies the
exact-circle cut and the `isLongOpen`/`isAgedRoof` flags (also `packages/domain`), and returns
rows plus `manifestCid`/`traceId` for provenance. No write path exists in this story — every
procedure is read-only, matching the sequence diagram's `L->>X` query step with no new participant
added to it.

## Technical Context

**Language/Version**: TypeScript (Node.js + React 19, matching the existing `apps/web`/`apps/api` toolchain)

**Primary Dependencies**: `maplibre-gl` (already in `apps/web`, B-01) for the pin/radius-ring UI; the browser `navigator.geolocation` API (GPS); `@duckdb/node-api` via the existing `DuckDbParquetLeadIndex` (B-02, no new adapter); Zod on every new tRPC input; `packages/index-schema` (`CrmProperty`/`CrmPermit`, unchanged); `packages/oracle-contract`'s `bbb_status`/`bbb_status_reason` columns (vendored, read-only)

**Storage**: None new. Reads the existing `crm-index` S3 Parquet (`crm_property`/`crm_permit`) the B-02 sync already promotes; no new table, no new bucket.

**Testing**: Vitest unit tests for `packages/domain` (radius/distance/badge math) and the extended `LeadIndex` query methods, written first; Playwright e2e per AC against the Amplify preview URL only (`RUNTIME_URL={preview}`, config fails on `localhost`), including `context.grantPermissions(["geolocation"])` + `context.setGeolocation(...)` for AC-1/AC-2; a local `tests/fixtures/sample-travis/` synthetic volume fixture (never deployed, never cited as real) for the scale assertion in AC-4's unit/local test only.

**Target Platform**: Existing Amplify-hosted `apps/web` + the existing API Lambda (`eu-north-1`, region from `packages/config`) — no new CDK stack or resource.

**Project Type**: Web application, frontend + backend addition inside the existing Turborepo monorepo (`ui: true` per the story front matter)

**Performance Goals**: Search end-to-end p95 < 3 s on the hosted URL (NFR-001, architecture-constitution.md §10); warm API server time p95 < 500 ms (the index itself is already loaded by B-02's sync/promote cycle — this story adds no new cold-load path)

**Constraints**: Radius bounds 0.5–25 mi (Zod-validated at the tRPC boundary, architecture-constitution.md §6); roof-age threshold default 15 years; long-open badge at `openDays > 1826` (5 years, per the design consult); BBB shown only when `bbb_status === "rated"`, otherwise "not available" + the literal `bbb_status_reason` (P0-4); no owner name anywhere (ADR-03 — this story never touches it, but must not accidentally add it to a result row or the drawer)

**Scale/Scope**: Built and tested against the already-synced B-02 index (A-03 sample manifest, 35 roofing rows); AC-4's scale proof additionally uses the local synthetic volume fixture for the unit/Playwright-scale assertion only, never deployed or shown as real (WALKTHROUGH-B-sample-first.md §2)

## Kit Agent Ownership *(mandatory, constitution XIII–XVII)*

Copied from `stories/B-03-map-search.md` front matter and `specs/003-map-search/agent-design.md`.

| Role | Agent(s) | Skills loaded | What it decided (cite agent-design.md) |
|------|----------|---------------|----------------------------------------|
| Design consult | `metagross` (sole consult — one builder, one screen, one query path) | `build-frontend-backends`, `frontend-bug-fix`, `apply-engineering-guidelines` | The `search.properties`/`search.permits` query shape and response fields (verbatim from `CrmProperty`/`CrmPermit`); the exact `roofAgeBasis`/`roofAgeConfidence`/`openDays`/`statusClass` field names; the long-open badge rule (`openDays > 1826`, never re-derived from `issueDate`); the detail-drawer provenance fields and the `bbb_status`/`bbb_status_reason` absent-state rule. No disagreements (sole consult). |
| Builder | `metagross` (two task groups: map+radius+GPS; roof-age+permit layer+detail drawer) | `build-frontend-backends`, `frontend-bug-fix`, `apply-engineering-guidelines` | Patterns below |
| Reviewer(s) | `metagross`, `audino` | — | `metagross`: are the services/contracts/patterns the ones it would choose; `audino`: UI drift from the Claude Design prototype (`design/prototype/Crm*.dc.html`) |
| Verify | Playwright with geolocation mock on the hosted preview; 15→25 roof-age count change; permits sorted by open days; a BBB-not-available case | — | Proven on the Amplify branch preview for `003-map-search`, never localhost |

**Patterns the code must show** (from the builder's answer):
- Shared business rules, written once (architecture-constitution.md §5): `packages/domain/src/radius.ts` (`bboxFor`, `distanceMeters`), `packages/domain/src/permit.ts` (`isLongOpen`, `openDurationLabel`), `packages/domain/src/roofAge.ts` (`isAgedRoof`, `DEFAULT_ROOF_AGE_YEARS = 15`) — imported by both `apps/web` and `apps/api`, never reimplemented in either, and the threshold is a named constant rather than a literal `15` repeated across the UI and the API.
- tRPC contracts, Zod-validated, no `any`: `apps/api/src/routers/search.ts` (`search.properties`, `search.permits`), `apps/api/src/routers/property.ts` (`property.get`), wired into `apps/api/src/routers/index.ts`'s `appRouter`.
- Reused, never re-derived (ADR-07): the extended `LeadIndex.searchProperties`/`searchPermits` still read `crm_property`/`crm_permit` fields verbatim; no roof-age/status recomputation in the new routers.
- Atlas tokens only (P0-14): every new component in `packages/ui` or `apps/web/src/components`, none with inline/ad hoc styling.
- Provenance on every display (XI): every result row and the detail drawer render `cid`, `sourceManifestCid`, `capturedAt`, and any `missingReasons[]` entry via the copied `Provenance`/`MissingReason`/`CidDisplay` components.
- URL filter state (reused from A-13): `apps/web/src/routes/Map/ExploreFilters.state.ts`, so radius/threshold/permit-view are shareable and restorable from the URL.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Mark each ✅ / ❌ / N/A; every ❌ needs a row in Complexity Tracking.*

| # | Article | Check for this plan | Status |
|---|---------|---------------------|--------|
| I | Outcome first | Every AC proven on the Amplify branch preview for `003-map-search` with the real (sample) Travis data, never localhost | ✅ |
| II–IV | Stack | TypeScript throughout; no new CDK stack (reads the existing index); extends the existing Turborepo packages (`domain` new, `index-schema`/`oracle-contract` unchanged); one `api-client` | ✅ |
| V–VI | Contracts and LLM | Every new tRPC input (`search.properties`, `search.permits`, `property.get`) is Zod-validated with explicit bounds (radius ≤25 mi, roof-age threshold, limit); no LLM calls in this story — N/A for Article VI | ✅ (VI: N/A) |
| VII–IX | Operations | No new external/queued boundary (this story reads the already-built index); existing Powertools/X-Ray on the API Lambda covers the new routers automatically | ✅ |
| X | Quality gates | Vitest for `packages/domain` and the extended adapter methods, written first; Playwright against the Amplify preview (fails on localhost); lint/tsc/format in the existing CI | ✅ |
| XI | Data honesty | Every result and the drawer carry `cid`/`sourceManifestCid`/`capturedAt`/`missingReasons`; BBB and contractor absence always shown with a stated reason, never blank or invented (AC-7) | ✅ |
| XII | Secrets | None added; no secrets in this plan | ✅ |
| XIII–XV | Owner agents | Kit Agent Ownership section above filled from the story front matter; `specs/003-map-search/agent-design.md` exists (sole consult, word for word); builder patterns listed map to concrete file paths | ✅ |
| XVI | Owner review | `metagross`, `audino` plus `/code-review medium` score the branch in `docs/reviews/CR-B-03.md`; 75-point threshold blocks merge until fixed or justified (Phase D) | ✅ (planned, not yet executed) |
| XVIII–XXIII | Delivery | G4 passed (3 wording fixes applied, A-13 dependency flagged for Round 1); tests written and shown failing first; branch `003-map-search`; any hosted test failure gets a `docs/defects/ERR-{n}.md` record | ✅ |
| Addendum | Task B (B1–B3) | B1: all property/permit data still comes only from the already-CID-verified B-02 index, never a new Task A read path. B2: this story never writes a lead (B-07's scope); it only reads and displays. B3: N/A — no agent in this story. | ✅ (B2, B3: N/A beyond read-only display) |

## Project Structure

### Documentation (this feature)

```text
specs/003-map-search/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── agent-design.md      # Phase "Agents design" output (already written)
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/domain/                          # NEW — pure business rules, shared by web + api
├── src/
│   ├── radius.ts                         # bboxFor(center, radiusMi), distanceMeters(a, b)
│   ├── permit.ts                         # isLongOpen(openDays), openDurationLabel(openDays)
│   └── roofAge.ts                        # isAgedRoof(years, threshold), DEFAULT_ROOF_AGE_YEARS
└── test/                                 # Vitest, written first

apps/api/src/adapters/duckDbParquet.ts    # EXTEND (B-02's file) — SearchPropertiesQuery gains
                                           # { center: {lat,lng}, radiusMi }, computed via
                                           # packages/domain's bboxFor before the existing bbox
                                           # DuckDB filter; SearchPermitsQuery's existing `sort`
                                           # union already covers "openDays" (long-open badge is
                                           # a display-layer flag from packages/domain, not a new
                                           # query parameter)

apps/api/src/routers/search.ts            # NEW — search.properties, search.permits (Zod: radius
                                           # 0.5–25mi, roofAgeMinYears, permit view)
apps/api/src/routers/property.ts          # NEW — property.get (detail drawer: permit, contractor,
                                           # BBB status/reason, provenance)
apps/api/src/routers/index.ts             # EXTEND — wire search + property into appRouter

apps/web/src/components/Map/
├── CrmMap.tsx                            # EXTEND (B-01's file) — pin drop, radius ring, GPS button
├── GpsButton.tsx                         # NEW — navigator.geolocation, denied/outside-county states
└── RadiusControl.tsx                     # NEW — 0.5–25mi slider

apps/web/src/routes/Map/
├── Map.tsx                               # EXTEND — wires filters + results + drawer
├── ExploreFilters.state.ts               # COPIED from ORACLE-u (A-13) — URL filter state
├── FilterSheet.tsx                       # COPIED from ORACLE-u — roof-age + permit filter sheet
├── ResultRow.tsx                         # COPIED from ORACLE-u — candidate row
├── PermitChip.tsx                        # COPIED from ORACLE-u — long-open badge chip
└── PropertyDetail/
    ├── PropertyDetail.tsx                # COPIED from ORACLE-u — detail drawer shell
    └── ContractorBadge.tsx               # COPIED from ORACLE-u

packages/ui/src/
├── Provenance/Provenance.tsx             # COPIED from ORACLE (base) — provenance line
├── MissingReason/MissingReason.tsx       # COPIED from ORACLE (base)
└── CidDisplay/CidDisplay.tsx             # COPIED from ORACLE (base) — CID with copy

tests/e2e/perf.spec.ts                    # COPIED from ORACLE (base) — timing harness, adapted to
                                           # this story's NFR-001 (p95 < 3s)
apps/web/test/filter-sheet-controlled.test.tsx   # COPIED from ORACLE-u
apps/web/test/explore-filters.test.tsx           # COPIED from ORACLE-u
tests/e2e/A-13-vitals.spec.ts                     # COPIED from ORACLE-u (adapted: CRM routes)

tests/e2e/B-03-map-search.spec.ts         # NEW — the 7-AC + 2-edge-case Playwright suite (geolocation mock, Amplify preview only)
tests/fixtures/sample-travis/             # NEW — local-only synthetic volume fixture (AC-4 scale test), never deployed, marked `synthetic`
```

**Structure Decision**: Frontend + backend addition inside the existing monorepo (`ui: true`). One
new package (`packages/domain`), two new API routers wired into the existing `appRouter`, one
extended adapter method (no new adapter — B-02's `DuckDbParquetLeadIndex` already has the right
shape), and UI additions under the existing `apps/web/src/routes/Map` and `components/Map`. No new
CDK stack, no new AWS resource — this story is a read-and-display layer over the index B-02
already builds and promotes.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Introducing `packages/domain` now, mid-project, rather than at B-01 | architecture-constitution.md §5 requires shared business rules live in one place, imported by web, API and (later) the agent, so no threshold is ever written twice. B-03 is the first story whose logic (radius math, the long-open badge) is genuinely shared between the map UI and the API — B-01/B-02 had no such shared pure rule to extract. | Putting the radius/badge math only in `apps/api` (and letting the web layer re-derive or duplicate it for client-side preview) would risk the map and the API silently disagreeing on which properties are "in radius" or "long-open" — exactly what §5 is written to prevent. |
