---
id: B-03
type: user-story
title: "Search a radius for aged roofs and open permits, with full detail"
parent: FEAT-B03            # also covers FEAT-B04, FEAT-B05, FEAT-B06
parts: [B-03, B-04, B-05, B-06]
vision: VIS-B
ard: ARD-B
eval_point: B1 (primary, B-03) · B2 (B-04) · B3 (B-05, B-06)
priority: P1
moscow: Must
branch: 003-map-search
spec: specs/003-map-search/
depends_on: ["B-02 merged", "Task A A-13 (Explorer UI + content pages) done"]
size_days: 1.5
agents:
  design: [metagross]
  builder: metagross
  reviewers: [metagross, audino]
  verify: "Playwright with geolocation · 15 → 25 changes the roof-age count · permits sorted by open days · includes a BBB not available case"
skills: [build-frontend-backends, frontend-bug-fix, apply-engineering-guidelines]
ui: true
status: Done
gate: G7
qc_testability_signoff: true
created: 2026-10-23
reuses:
  - from: "Task A A-02 (Data contract)"
    paths: ["gazetteer and Area + radius logic in query-core", "roof-age and open-days derivations", "result-card signal chips"]
  - from: "Task A A-13 (Explorer UI + content pages)"
    paths: ["PropertyDetail drawer", "ContractorBadge", "provenance line", "CID with copy"]
    note: "The CRM adds its own 'View lineage in Explorer' link from the drawer back to CountyLens (A-13); nothing else in the drawer is re-derived."
---

# B-03 Search a radius for aged roofs and open permits, with full detail

| Field | Value |
| --- | --- |
| Evaluation point | B1 (primary, part B-03: radius search) · B2 (part B-04: roof age) · B3 (parts B-05, B-06: permits, contractor + BBB) |
| Demo line(s) | D-2 (pin/GPS + radius), D-3 (roofs older than threshold), D-4 (open permits, long-open first), D-5 (contractor + BBB detail) |
| Agents | design `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify Playwright geolocation + filter checks (from [AGENT-MAP.md](../../assessment-guide/AGENT-MAP.md) §5) |
| Depends on | B-02 merged (the lead index); Task A A-13 published (copies its drawer pattern) |
| Size | 1.5 days |
| Branch | `003-map-search`, merged into `feature/roofing-crm` |

## Context

This is the rep's core workflow: drop a pin or use GPS, set a radius, and see which properties inside it are worth a knock on the door. The four original stories (radius, roof age, open permits, and the contractor/BBB detail) share one screen, one query path and one builder, so they run as one phase of the plan and one Playwright suite.

## Description

As a **sales rep**, I want to **center a search on a pin or my GPS location, set a radius, and see properties with aged roofs or long-open roofing permits inside it, with full permit, contractor and BBB detail**, so that **I can judge and prioritize candidates without leaving the map**.

What will exist when done: a radius search (pin or GPS, 0.5–25 mi) over the B-02 index; a roof-age threshold control (default 15 years) with basis and confidence shown on every result; a permit layer sorted by open duration with a "long-open" badge for permits open more than 5 years; and a property detail drawer with status, open duration, contractor, BBB rating or an honest "not available", and a source link.

**Independent test:** with B-02's index already populated, drop a pin near Pflugerville, set a 5 mi radius, change the roof-age threshold, open the permit layer, and open a property's detail drawer — no leads or agent code is needed.

## Acceptance Criteria

1. **AC-1 (B-03)** · **Given** the rep is at the Map screen, **When** they drop a pin near Pflugerville (30.4394° N, −97.6200° W) and set the radius to 5 mi, **Then** the map redraws a 5 mi ring and the result set contains only properties whose centroid falls inside it. ☐ testable
2. **AC-2 (B-03)** · **Given** the rep denies the browser's GPS permission, **When** they tap "Use my location", **Then** the UI falls back to pin-drop mode with an explicit "location denied" state, never a silent failure or blank map. ☐ testable
3. **AC-3 (B-04)** · **Given** the 5 mi radius result set around Pflugerville, **When** the rep sets the roof-age threshold to 15 years (the default), **Then** only properties with `roof_age_years ≥ 15` remain, and each row shows its `roof_age_basis` and `roof_age_confidence`. ☐ testable
4. **AC-4 (B-04, scale)** · **Given** the same 5 mi radius around Pflugerville, **When** the rep changes the threshold from 15 to 25, **Then** the visible result count decreases (the count at 25 must be lower than the count at 15, and each count must equal the full-index query result for the same inputs), proving the filter runs over the full-county index rather than a cached subset. ☐ testable
5. **AC-5 (B-05)** · **Given** the same radius, **When** the rep switches to the permit layer, **Then** results are sorted by open duration (longest first), and any permit open more than 5 years carries a visible "long-open" badge. ☐ testable
6. **AC-6 (B-06)** · **Given** the rep opens a property near Manor with an open roofing permit, **When** the detail drawer opens, **Then** it shows the permit's status, open duration, contractor name, and a "View lineage in Explorer" link to Task A's published record. ☐ testable
7. **AC-7 (B-06, missing-data)** · **Given** a permit whose BBB rating was never published by Task A, **When** the rep opens its detail drawer, **Then** it shows "BBB rating not available" with the reason — never a blank field or a fabricated rating. ☐ testable

## Edge cases

- A radius with zero matching properties (for example, 0.5 mi around a rural point near Lago Vista) → shows a "widen to {n} mi" suggestion, not a blank list.
- A GPS position resolving outside Travis County (for example, in Williamson County) → the UI states the position is outside the covered county, instead of showing an empty map.

## Requirements

| REQ | Requirement | Traces to |
| --- | --- | --- |
| FR-001 | System MUST accept a pin or GPS center point and a radius between 0.5 and 25 mi | AC-1 |
| FR-002 | System MUST fall back to pin-drop mode with an explicit state when GPS permission is denied | AC-2 |
| FR-003 | System MUST filter properties by an adjustable roof-age threshold, default 15 years, showing basis and confidence | AC-3, AC-4 |
| FR-004 | System MUST sort permit results by open duration and badge permits open more than 5 years | AC-5 |
| FR-005 | System MUST show permit status, open duration, contractor and BBB rating or its absence reason in the detail drawer | AC-6, AC-7 |
| NFR-001 | Search, end to end, p95 < 3 s on the hosted URL over the full county | ARD-B §10; AC-1, AC-4 (timed in Playwright) |

No `[NEEDS CLARIFICATION]` remaining.

## Prototype reference

| Element | Value |
| --- | --- |
| Claude Design screen | `design/prototype/CrmMapPin390.dc.html`, `CrmMapGpsDenied390.dc.html`, `CrmMapGpsOutside390.dc.html`, `CrmMapLocating390.dc.html`, `CrmProperty1440.dc.html`, `CrmProperty390.dc.html`, `CrmPropertyPartial390.dc.html`, `CrmPropertyNoContractor390.dc.html` |
| States covered | GPS asking/denied/outside-county; empty/partial results; property detail populated/partial/no-contractor |
| Design system | `../assessment-guide/design-system/` (Atlas, Material 3, mobile-first) |

## Demo Script

1. Presenter: "Drop a pin near Pflugerville and set a 5-mile radius." → Expected: ring redraws, results appear inside it.
2. Presenter: "Show roofs older than 15 years, then widen to 25." → Expected: count visibly changes.
3. Presenter: "Switch to permits, longest-open first." → Expected: sorted list with a long-open badge.
4. Presenter: "Open one property's detail." → Expected: contractor and BBB shown, or "not available" where Task A has no rating.

## Out of scope

- Creating or managing leads from these results (B-07).
- Live BBB API lookups (README out of scope; shows only what Task A published).
- Agent-driven search (B-09).

## Evidence to capture

- `docs/evidence/B-03.md` (§ B-04, § B-05, § B-06 for each part): URL, inputs, real counts, screenshots (incl. one "BBB not available" case), trace id.
- `testplans/B-03-test-cases.md` results, `docs/reviews/CR-B-03.md`.

---

## Gate G4: Story ready for planning

| # | Criterion | Status |
| --- | --- | --- |
| G4-1 | Front matter complete (parent FEAT, eval point, branch, priority, agents and skills from AGENT-MAP.md) | ☑ |
| G4-2 | "As a / I want / So that" stated, with an independent test | ☑ |
| G4-3 | Every AC is Given / When / Then, and its testable box is ticked | ☑ (format; per-AC ☐ boxes tick at G7 once proven live, per B-01/B-02 convention) |
| G4-4 | One scale AC and one missing-data or error AC | ☑ (AC-4 scale, AC-7 missing-data) |
| G4-5 | At least two edge cases | ☑ (2: zero-result radius, GPS outside county) |
| G4-6 | Every requirement traces to an AC; NFRs have thresholds | ☑ — NFR-001 now also traces to AC-1/AC-4 |
| G4-7 | Prototype screen linked (UI stories) | ☑ — corrected to the real `design/prototype/*.dc.html` paths (G4 pre-check F-2) |
| G4-8 | Dependencies done, or stubbed with real sample data | ☑ — B-02 merged (d01c06e); Task A A-13 is G7-approved with evidence complete (`ORACLE` commit 1ad7123) but its merge into `feature/oracle-pipeline` is deliberately held for A-11 merge order (PO decision, not a defect). Per this story's reuse table, its copyable components are read from the `ORACLE-u` worktree, which is exactly this case — flagged for Round 1 confirmation rather than treated as a blocker. |
| G4-9 | No `[NEEDS CLARIFICATION]` left | ☑ |
| G4-10 | AI pre-check (`developmentsupport-g4-precheck`): PASS | ☑ — `docs/gates/G4-B-03-precheck.md` (written below); its 3 findings (NFR traceability, prototype paths, AC-4 wording) fixed in this file |

**Decision:** ☑ Ready ☐ Returned · HebaGaber · 2026-10-23 (Round 1: the A-13 dependency wording above — G7-approved but merge held for A-11's order, reachable via `ORACLE-u` — is accepted as not a blocker)

---

## Gate G7: Validated Build

| # | Criterion | Status |
| --- | --- | --- |
| G7-1 | Tasks done | ☑ |
| G7-2 | Unit tests: report attached, CI green, coverage ≥ 80% of new code | ☑ `docs/reports/UT-B-03.md` — 708 tests, 100% pass rate; `apps/web` coverage raised 85.33%→96.88% stmts (two under-80% files fixed) |
| G7-3 | Code review: every `agents.reviewers` score ≥ 75, zero open Critical | ☑ `metagross` 80, `audino` 48→84→81 (two rounds), `/code-review medium` — `docs/reviews/CR-B-03.md` |
| G7-4 | Every TC executed on the hosted URL, build sha recorded | ☑ with exceptions — `testplans/B-03-test-cases.md` § 11; 16 TCs BLOCKED on GAP-7 (`crm-leads`/B-07 not deployed), 4 TCs tracked as follow-up, 9 TCs + the responsive suite genuinely PASS live |
| G7-5 | Defects closed, no open Critical | ☑ — no `docs/defects/ERR-*.md` files; every finding fixed same session |
| G7-6 | Evidence: URL, counts, screenshots, trace id | ☑ `docs/evidence/B-03.md` |
| G7-7 | Traceability and kit-usage rows complete | ☑ |
| G7-8 | Commits start with the story ID, no secrets | ☑ |
| G7-9 | AI pre-check (`developmentsupport-g7-precheck`): PASS | ☑ `docs/gates/G7-B-03-precheck.md` — 2 findings (tasks.md checkboxes, apps/web coverage), both fixed |

**Decision:** ☑ Approved ☐ Returned · HebaGaber · 2026-10-24 (Round 2: GAP-7 and the other carried-forward exceptions in `docs/gates/G7-B-03-precheck.md` accepted — cross-story/environmental, not B-03 defects)
