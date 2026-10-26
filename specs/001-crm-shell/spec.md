# Feature Specification: CRM shell with disabled roadmap sections

**Feature Branch**: `001-crm-shell`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Specify the story in stories/B-01-crm-shell.md: a merged story with two parts (B-01 Walking skeleton, B-10 Disabled sections). Every AC (AC-1 to AC-5) becomes at least one FR with the same number. Header from the front matter (eval points B1, B6; demo lines D-1, D-9). Facts: ../assessment-guide/reference/B-roofing-crm.md and docs/architecture-constitution.md. No technology choices."

**Story**: `stories/B-01-crm-shell.md` | **Evaluation point**: B1 (primary, B-01) · B6 (secondary, B-10) | **Demo line(s)**: D-1 (CRM centered on a county), D-9 (disabled future sections)

**Owner agents** (from the story front matter; used by the plan, not by this spec): design `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify Playwright login on the hosted URL · aria-disabled check

> Every story acceptance criterion becomes at least one FR below. No technology choices in this file; they belong in plan.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and land on the county map (Priority: P1)

A sales rep opens the CRM for the first time with the one shared test login and lands directly on a map centered on Travis County — no setup, no self sign-up, no empty screen.

**Why this priority**: Nothing else in the product is reachable without this. It is the walking skeleton every later story deploys into.

**Independent Test**: Open the hosted URL in a private browser window, sign in with the shared test credentials, and confirm the map opens centered on Travis County. No other story's code is needed.

**Acceptance Scenarios**:

1. **Given** a sales rep with the shared test login who has never signed in, **When** they open the hosted CRM URL in a private window and submit the test credentials, **Then** they land on the Map screen centered on Travis County (≈30.2672° N, −97.7431° W), with no self sign-up link anywhere on the page.
2. **Given** the rep is signed in, **When** the Map screen finishes loading, **Then** the map can be panned and zoomed with no artificial limit, always rendering at least the Travis County bounding box (≈30.09–30.52° N, −98.17–−97.33° W; ≈1,023 sq mi) without reloading the page, and a health-check call is traced end to end within 3 s of page load.
3. **Given** the rep enters the wrong password three times, **When** they submit a fourth consecutive attempt, **Then** the sign-in screen shows a typed lockout state ("Too many attempts — try again in 5 minutes") naming the cause, with a 5-minute cooldown, never a generic error or a blank screen.

---

### User Story 2 - See the roadmap, honestly marked not built yet (Priority: P2)

The same rep sees Campaigns, Estimates, Jobs, Invoices and Outreach listed in the navigation as the product's future roadmap, clearly disabled, so they know what's coming without being misled into thinking a feature works when it doesn't.

**Why this priority**: It rides on the shell from User Story 1 (same navigation, same shell) and sets rep expectations correctly, but the product is still usable end to end without it.

**Independent Test**: While signed in on the Map screen, open the navigation rail (or, at phone width, the "More" sheet), confirm the five sections are visibly disabled with a tooltip, and tap one to confirm it opens a Coming Soon page rather than a broken or missing page.

**Acceptance Scenarios**:

1. **Given** the rep is signed in on the Map screen, **When** they open the left navigation rail (or, at 390 px, the "More" sheet), **Then** Campaigns, Estimates, Jobs, Invoices and Outreach each appear as a disabled row with a "Coming soon" tooltip on hover or focus, and tapping one does not navigate into a working feature.
2. **Given** the rep taps the disabled "Campaigns" row, **When** the tap registers, **Then** a Coming Soon page opens with a "Back to Map" action — never a 404 or a blank page.

---

### Edge Cases

- The browser tab is closed and reopened after sign-in → the session survives a reload; the rep is not asked to sign in again.
- The map's tile provider fails to respond → a named failure state is shown with a retry action, never a blank gray tile grid.
- Viewport at 390 px (a rep's phone in the field) → the navigation rail collapses into the "More" sheet; the same five disabled rows are reachable there.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate the rep against a managed user directory with no self sign-up path, using one shared test account. (Traces to AC-1.)
- **FR-002**: System MUST center the map on Travis County on first load and allow free pan/zoom at least across the full county bounding box without a page reload. (Traces to AC-2.)
- **FR-003**: System MUST show a typed, named lockout state — locking on the 4th consecutive failed sign-in with a 5-minute cooldown — never an unhandled error or blank screen. (Traces to AC-3.)
- **FR-004**: System MUST render Campaigns, Estimates, Jobs, Invoices and Outreach as disabled navigation rows, each with a "coming soon" tooltip, reachable from the collapsed "More" sheet at 390 px. (Traces to AC-4.)
- **FR-005**: System MUST route a tap on any disabled row to a Coming Soon page with a way back to the map, never a 404 or blank page. (Traces to AC-5.)

### Key Entities

- **Session**: the rep's signed-in state; survives a browser reload via a reused credential, expires on sign-out or expiry.
- **Roadmap section**: a named future CRM capability (Campaigns, Estimates, Jobs, Invoices, Outreach) with no working implementation in this story, shown only as a disabled row and a Coming Soon page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rep with the shared test login reaches the Travis County map within one sign-in attempt, 100% of the time, with no self-sign-up path visible.
- **SC-002**: The map can be freely panned and zoomed across the whole of Travis County (≈1,023 sq mi) without a page reload, and a health check completes within 3 seconds of page load, verified on every page load.
- **SC-003**: After 4 consecutive failed sign-in attempts, 100% of reps see a named, specific lockout message (never a generic error) with a 5-minute wait before the next attempt is accepted.
- **SC-004**: 100% of the five roadmap sections are visibly marked disabled with an explanatory tooltip, and opening any of them reaches a Coming Soon page with a working way back to the map — never a dead end.
- **SC-005**: The sign-in, map and Coming Soon screens are usable at phone (390 px), tablet (768 px) and desktop (1440 px) widths with no loss of function.

## Assumptions

- One shared test login is sufficient for this story and the evaluator; no self sign-up or additional accounts are needed (confirmed PO decision).
- Travis County is the only county in scope for the map's default center and pan/zoom guarantee in this story.
- The roadmap sections (Campaigns, Estimates, Jobs, Invoices, Outreach) are disabled-only in this story; no working implementation of any of them is in scope here.
- Exact lockout mechanics (4th attempt, 5-minute cooldown) are a product decision recorded here, independent of which underlying auth technology enforces it — that choice belongs in plan.md.
- This story depends on two separate pieces of upstream work being functionally complete and reusable (a base application shell/hosting pattern, and an existing "coming soon" UI pattern) — which systems those come from and how they are obtained is a planning/implementation concern, not stated here.
