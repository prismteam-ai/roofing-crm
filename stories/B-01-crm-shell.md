---
id: B-01
type: user-story
title: "Open the CRM shell and show the roadmap sections"
parent: FEAT-B01            # also covers FEAT-B10 (part B-10)
parts: [B-01, B-10]
vision: VIS-B
ard: ARD-B
eval_point: B1 (primary, B-01) · B6 (secondary, B-10)
priority: P1
moscow: Must
branch: 001-crm-shell
spec: specs/001-crm-shell/
depends_on: ["Task A A-03 (Walking skeleton) done — merged into feature/oracle-pipeline, commit 8ae1870 \"A-03: merge walking skeleton (G7 PASS)\"", "Task A A-13 (Explorer UI + content pages, its Coming-soon-pages part) — committed on its own branch 013-explorer-and-pages in oracle-property-intelligence-platform-pipeline-travis-tx-u, not yet merged into feature/oracle-pipeline; B-01 reads it directly from that branch (git show, read-only) per PO decision 2026-10-23 — note: A-18 is not a separate story; it was merged into A-13 on 2026-10-21"]
size_days: 1.5
agents:
  design: [metagross]
  builder: metagross
  reviewers: [metagross, audino]
  verify: "Playwright login on the hosted URL · disabled sections are aria-disabled with a coming-soon tooltip"
skills: [build-frontend-backends, integrate-ci-cd, apply-engineering-guidelines]
ui: true
status: Done
gate: G7
qc_testability_signoff: false
created: 2026-10-23
reuses:
  - from: "Task A A-03 (Walking skeleton)"
    paths: ["Turborepo layout", "packages/{tsconfig,eslint-config,shared,api-client}", "infra/ base (Powertools, X-Ray, log retention, DLQ alarm, budget, CDK assertions)", "GitHub Actions", "Atlas tokens.css", "app shell + app switcher", "Playwright setup"]
    note: "Cognito user pool with the shared admin test user is new here first, then copied BACK to Task A for A-17 (feature-list §4.6)."
  - from: "Task A A-13 (Explorer UI + content pages — its Coming-soon-pages part; A-18 is not a standalone story, it was merged into A-13 on 2026-10-21)"
    paths: ["the Coming soon row and skeleton component"]
    note: "The CRM supplies its own section list (Campaigns, Estimates, Jobs, Invoices, Outreach)."
---

# B-01 Open the CRM shell and show the roadmap sections

| Field | Value |
| --- | --- |
| Evaluation point | B1 (primary, part B-01) · B6 (secondary, part B-10) |
| Demo line(s) | D-1 (CRM centered on a county), D-9 (disabled future sections) |
| Agents | design `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify Playwright login + aria-disabled check (from [AGENT-MAP.md](../../assessment-guide/AGENT-MAP.md) §5) |
| Depends on | Task A A-03 (merged walking skeleton) done; Task A A-13 (Explorer UI + content pages), specifically its Coming-soon-pages part — A-18 is not a separate story; it was absorbed into A-13 in the 2026-10-21 Task A story merge |
| Size | 1.5 days |
| Branch | `001-crm-shell`, merged into `feature/roofing-crm` |

## Context

This is the thinnest live version of the CRM: a sales rep can sign in with the one shared test login and see a map centered on Travis County. Everything else in the product hangs off this shell — hosting, auth, CI, the app frame — so it must exist, and be provably live, before any other story starts. Part B-10 rides along here because the disabled sections it adds (Campaigns, Estimates, Jobs, Invoices, Outreach) are just rows in this same shell's navigation, and Task A's "Coming soon" pattern already exists to copy.

## Description

As a **sales rep**, I want to **sign in once and land on a map of Travis County, with the rest of the CRM's roadmap visible but clearly not-yet-built**, so that **I immediately know where I am and what's coming, without being told to explore an empty app**.

What will exist when done: a hosted web app at `https://crm.aldarraj.com` with Cognito sign-in (one shared test user), a MapLibre map defaulting to Travis County, and a navigation rail that also lists Campaigns, Estimates, Jobs, Invoices and Outreach as disabled, each with a "coming soon" tooltip.

**Independent test:** open `https://crm.aldarraj.com` in a private browser window, sign in with the shared test credentials, and confirm the map and the disabled rail — no other story's code is needed.

## Acceptance Criteria

1. **AC-1 (B-01)** · **Given** a sales rep with the shared test login who has never signed in, **When** they open `https://crm.aldarraj.com` in a private window and submit the test credentials, **Then** they land on the Map screen centered on Travis County (≈30.2672° N, −97.7431° W), with no self sign-up link anywhere on the page. ☑ testable
2. **AC-2 (B-01, scale)** · **Given** the rep is signed in, **When** the Map screen finishes loading, **Then** the map can be panned and zoomed with no artificial limit, and always renders at least the Travis County bounding box (≈30.09–30.52° N, −98.17– −97.33° W; ≈1,023 sq mi, from Lago Vista in the northwest to Mustang Ridge in the southeast) without reloading the page, and a `health.ping` call appears in X-Ray within 3 s of the page load. ☑ testable
3. **AC-3 (B-01, missing-data/error)** · **Given** the rep enters the wrong password three times, **When** they submit a fourth consecutive attempt, **Then** the sign-in screen shows a typed lockout state ("Too many attempts — try again in 5 minutes") naming the cause, with a 5-minute cooldown, never a generic 500 or a blank screen. ☑ testable
4. **AC-4 (B-10)** · **Given** the rep is signed in on the Map screen, **When** they open the left navigation rail (or, at 390 px, the "More" sheet), **Then** Campaigns, Estimates, Jobs, Invoices and Outreach each appear as an `aria-disabled` row with a "Coming soon" tooltip on hover or focus, and tapping one does not navigate into a working feature. ☑ testable
5. **AC-5 (B-10)** · **Given** the rep taps the disabled "Campaigns" row, **When** the tap registers, **Then** a Coming Soon page opens with a "Back to Map" action — never a 404 or a blank page. ☑ testable

## Edge cases

- The browser tab is closed and reopened after sign-in → the session survives a reload (JWT re-used from storage), the rep is not asked to sign in again.
- The map's tile provider fails to respond → the `CrmMapFailed390` state is shown with a retry action, never a blank gray tile grid.
- Viewport at 390 px (a rep's phone in the field) → the navigation rail collapses into the "More" sheet; the same five disabled rows are reachable there.

## Requirements

| REQ | Requirement | Traces to |
| --- | --- | --- |
| FR-001 | System MUST authenticate the rep against a Cognito user pool with no self sign-up path | AC-1 |
| FR-002 | System MUST center the map on Travis County on first load and allow free pan/zoom within it | AC-2 |
| FR-003 | System MUST show a typed, named lockout state after repeated failed sign-ins, never an unhandled error | AC-3 |
| FR-004 | System MUST render Campaigns, Estimates, Jobs, Invoices and Outreach as `aria-disabled` navigation rows with a "coming soon" tooltip | AC-4 |
| FR-005 | System MUST route a tap on any disabled row to a Coming Soon page with a way back to the map | AC-5 |
| NFR-001 | `health.ping` traced in X-Ray within 3 s of page load; every Lambda wrapped with Powertools Logger/Tracer/Metrics | AC-2, ARD-B §10 |
| NFR-002 | 390 / 768 / 1440 px all pass the `smeargle` suite on the sign-in, map and Coming Soon pages | AC-1, AC-4, AC-5, ARD-B §10 |

No `[NEEDS CLARIFICATION]` remaining.

## Prototype reference

| Element | Value |
| --- | --- |
| Claude Design screen | `design/prototype/CrmSignIn390.dc.html`, `CrmMap390/768/1440.dc.html`, `CrmShell1440/390.dc.html`, `CrmComingSoon390/768/1440.dc.html` |
| States covered | sign-in error/locked/expired; map tiles loading/failed/index-down; app switcher menu; Soon pills with tooltips |
| Design system | `../assessment-guide/design-system/` (Atlas, Material 3, mobile-first) |

## Demo Script

1. Presenter: "Here's the CRM, centered on Travis County." → Expected: sign-in screen, then the map opens already centered on the county.
2. Presenter: "The roadmap beyond lead-finding is visible but not built yet." → Expected: Campaigns / Estimates / Jobs / Invoices / Outreach show as disabled with a tooltip; tapping one opens a Coming Soon page.

## Out of scope

- Any working Campaigns, Estimates, Jobs, Invoices or Outreach feature (disabled only, per README Out of Scope OOS-3).
- Self sign-up or multiple test accounts (PO decision 2026-10-21: one shared login).
- Lead index, radius search or leads — those are B-02, B-03 and B-07.

## Evidence to capture

- `docs/evidence/B-01.md` (§ B-10 for the disabled-sections part): URL, sign-in screenshot, map screenshot, X-Ray trace id, disabled-row screenshot.
- `testplans/B-01-test-cases.md` results, `docs/reviews/CR-B-01.md`.

---

## Gate G4: Story ready for planning

| # | Criterion | Status |
| --- | --- | --- |
| G4-1 | Front matter complete (parent FEAT, eval point, branch, priority, agents and skills from AGENT-MAP.md) | ☑ |
| G4-2 | "As a / I want / So that" stated, with an independent test | ☑ |
| G4-3 | Every AC is Given / When / Then, and its testable box is ticked | ☑ |
| G4-4 | One scale AC and one missing-data or error AC | ☑ |
| G4-5 | At least two edge cases | ☑ |
| G4-6 | Every requirement traces to an AC; NFRs have thresholds | ☑ |
| G4-7 | Prototype screen linked (UI stories) | ☑ |
| G4-8 | Dependencies done, or stubbed with real sample data | ☑ A-03 merged; A-13 committed on branch 013-explorer-and-pages, used read-only (git show) per PO decision 2026-10-23 |
| G4-9 | No `[NEEDS CLARIFICATION]` left | ☑ |
| G4-10 | AI pre-check (`developmentsupport-g4-precheck`): PASS | ☑ re-run not required; initial 3 FAILs (C-06, C-08, C-10) fixed in place 2026-10-23 — see docs/gates/G4-B-01-precheck.md |

**Decision:** ☑ Ready ☐ Returned, reason: {…} · 2026-10-23
