# Feature Specification: Grounded agent + production hardening + real-data switch + prototype re-audit

**Feature Branch**: `009-agent-hardening`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Story B-09 (merged B-09 Agent + B-11 Responsive/observable), expanded this round with AC-7 (data switch to Task A's published Run 2 manifest, read directly by CID) and AC-8 (targeted prototype re-audit and fix of drift since B-03's last clean review)."

**Story**: `stories/B-09-agent-hardening.md` | **Evaluation point**: B5 (primary, agent) · B6 (secondary, responsive/observability) | **Demo line(s)**: D-7

**Owner agents** (from the story front matter; used by the plan, not by this spec): design `alakazam`, `ash`, `smeargle`, `porygon` · builder `alakazam` (retrieval) + `ash` (agent runtime) + `metagross` (responsive + observability) · reviewers `alakazam`, `ash`, `metagross`, `audino`, `porygon` · verify golden queries G1–G7 + full `smeargle` suite + `RoofingCrm` CloudWatch dashboard

> Every story acceptance criterion becomes at least one FR below. No technology choices in this file; they belong in plan.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask a plain-language roofing-opportunity question (Priority: P1)

A sales rep types a natural-language question about roofing opportunities ("open roofing permits older than five years within five miles of Pflugerville") and gets back a grounded, cited answer, with real results they can open on the map.

**Why this priority**: This is the primary evaluation point (B5) and the README's headline agent capability (D-7); without it the story has no agent to harden.

**Independent Test**: With leads already live (B-07), ask the deployed agent a README-style question and confirm it states the center point it resolved, returns real cited records, and each result opens on the map.

**Acceptance Scenarios**:

1. **Given** the rep asks about open permits near Pflugerville, **When** the agent answers, **Then** it states the geocoded center point, returns real cited records, and each opens on the map.
2. **Given** the agent just answered with candidate properties, **When** the rep says "create a lead for the first result," **Then** a lead is created through the same path the map uses (never written by the model directly) and appears in the lead list.
3. **Given** the rep asks about a ZIP code outside Travis County, **When** the agent processes it, **Then** it states the scope is invalid or empty, with zero fabricated results.

---

### User Story 2 - Trust the agent and the app at scale (Priority: P1)

An evaluator runs the seven standard "golden" questions against the live agent and expects fast, grounded, citation-backed answers — not slow, invented, or silently wrong ones.

**Why this priority**: Scale and groundedness are the difference between a demo and a product; this is explicitly scored (AC-4).

**Independent Test**: Run all seven golden queries against the deployed endpoint and record latency and citation accuracy for each.

**Acceptance Scenarios**:

1. **Given** the seven golden queries, **When** each runs against the deployed agent, **Then** the slowest "first useful answer" among repeated runs is under 20 seconds and every cited record genuinely exists in the current data.

---

### User Story 3 - See a trustworthy app on any device, with visible health signals (Priority: P2)

An evaluator opens the app on a phone, a tablet, and a desktop, and separately checks that the system reports its own health (a stuck queue triggers and later clears an alert, visible on a dashboard).

**Why this priority**: Secondary evaluation point (B6); responsiveness and observability are properties of the whole, finished app, proven once at the end.

**Independent Test**: Run the full responsive test suite against the hosted URL at three screen widths, and separately force a processing failure to confirm the alert fires and later clears.

**Acceptance Scenarios**:

1. **Given** the hosted app, **When** it is tested at phone, tablet, and desktop widths, **Then** every screen passes with no overflow or unusable controls.
2. **Given** a processing job fails and a message lands in the retry queue, **When** that queue stays non-empty, **Then** an alert fires and later clears automatically once the queue drains, both visible on a dashboard.

---

### User Story 4 - See the real county dataset, not a small sample (Priority: P1)

A rep or evaluator browsing the CRM sees property and permit data drawn from the real, full Travis County publication Task A produced — not the 35-row sample used during earlier stories.

**Why this priority**: The user explicitly asked that the portal show real, at-scale data this round; without it, the golden queries and the demo both understate what the product does.

**Independent Test**: Confirm the data shown in the CRM and returned by the agent traces to Task A's Run 2 full-county publication (by its published content identifier), not the earlier 35-row sample.

**Acceptance Scenarios**:

1. **Given** Task A has published its Run 2 full-county data, **When** the CRM is pointed at that publication's identifier and the CRM and agent read property/permit data, **Then** they read it directly from Task A's published data, and every result traces back to that identifier.

---

### User Story 5 - The app matches the approved design, everywhere (Priority: P2)

An evaluator or the product owner compares every screen — old and new — against the approved prototype and finds no visible drift: spacing, copy, states, and tokens all match.

**Why this priority**: A prior round already fixed 25 logged issues and re-verified clean; this round exists because new drift was spotted since, and new agent/ask screens must match from day one.

**Independent Test**: Re-diff every existing and new screen against the current prototype export and confirm every mismatch found is either fixed or explicitly logged with a reason it wasn't.

**Acceptance Scenarios**:

1. **Given** the current prototype screens, **When** every app screen (existing and new) is compared against them, **Then** every mismatch found is fixed, or logged with an explicit reason for deferring it.

### Edge Cases

- What happens when the agent's underlying model call takes too long? → The rep sees a clear "this took too long, try again" state, never a broken/blank screen.
- What happens when the rep names a place the agent isn't confident it resolved correctly? → Below a 0.80 match score, the agent declines and offers to rephrase rather than guess; between 0.80 and 0.92 (or when the top two candidates are close), it asks a clarifying question with the top options instead of guessing a location (ADR-06 bands; corrected from an earlier single-threshold description).
- What happens when the retry-queue alert fires but the underlying failure never recovers? → The alert stays active (never silently clears) until the queue is actually empty.
- What happens when a screen drift fix would require re-opening architecture already approved in an earlier story? → It is logged as deferred with a reason, not force-fixed under time pressure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST answer plain-language roofing-opportunity questions with cited, real records drawn from the property/permit index (AC-1).
- **FR-002**: System MUST create a lead only through the CRM's existing lead-creation path, never directly from the model (AC-2).
- **FR-003**: System MUST give an honest "no results / invalid scope" answer rather than fabricate results for an out-of-scope question (AC-3).
- **FR-004**: System MUST answer all seven standard golden queries with a 95th-percentile "first useful answer" time under 20 seconds and 100% of cited records verifiably real (AC-4).
- **FR-005**: System MUST pass the full responsive test suite at phone, tablet, and desktop widths on every screen in the app (AC-5).
- **FR-006**: System MUST alert when the retry/failure queue is non-empty and automatically clear that alert once the queue drains, with both states visible on a dashboard (AC-6).
- **FR-007**: System MUST read property/permit data directly from Task A's Run 2 full-county publication, by its published content identifier (AC-7).
- **FR-008**: System MUST be re-compared, screen by screen, against the current approved prototype, with every newly found mismatch fixed or explicitly deferred with a reason (AC-8).

### Key Entities

- **Agent answer**: A grounded response to a plain-language question; includes the resolved search scope (place/radius/age/permit-age filters), cited records, and a confidence level that governs whether the system answers, asks a clarifying question, or declines.
- **Lead**: A CRM record created from a property or permit match, always created through the existing lead-creation path, whether initiated from the map or from the agent.
- **Data publication reference**: The identifier that tells the CRM which published county dataset to read (Task A's Run 2 manifest, read directly by its identifier; set in one configuration value).
- **Health signal**: An operational indicator (queue depth, alert state) shown on a dashboard, independent of what any end user is doing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rep can ask a natural-language roofing question and see a grounded, cited answer with openable map results, with no invented records, 100% of the time across the seven standard test questions.
- **SC-002**: The slowest "first useful answer" across the seven standard test questions is under 20 seconds.
- **SC-003**: Every screen in the app, old and new, passes the responsive check at phone, tablet, and desktop widths with zero overflow or unusable-control failures.
- **SC-004**: A forced processing failure produces a visible alert that automatically clears once resolved, observable on a dashboard without any manual log-digging.
- **SC-005**: The CRM and agent visibly reflect Task A's full-county publication (hundreds of thousands of properties), not the earlier 35-row sample, with the data source documented.
- **SC-006**: Zero unresolved visual mismatches remain between the live app and the current approved prototype, other than ones explicitly logged as deferred with a reason.

## Assumptions

- Task A's A-13 (Explorer UI) and A-14 (Agent + MCP) stories are not yet done upstream (still Draft/Ready); this feature builds its own agent runtime and responsive configuration natively this round rather than reusing theirs, as a documented, reversible deviation — reconciled once those stories merge.
- Task A's Run 2 full-county manifest is pinned and real. The CRM reads Task A's published data directly by its identifier, so no catalog (Atlas) listing is needed.
- No vector/semantic search is added (per the project's existing architecture decision that the published data contract has no free text to embed); grounding comes from structured, cited record lookups only.
- The on-call paging mechanism for the health alert is email-based rather than a dedicated paging service, per an existing accepted project deviation.
- "Full re-audit" of the prototype means targeted re-diffing of screens likely to have drifted since the last clean review, plus every newly added screen — not a ground-up re-review of every pixel on every screen already verified clean.
