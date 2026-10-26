# Feature Specification: Create, manage and browse CRM leads

**Feature Branch**: `007-leads`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Specify the story in stories/B-07-leads.md: a merged story with two parts (B-07 Leads, B-08 Lead list). Every AC (AC-1 to AC-5) becomes at least one FR with the same number."

**Story**: `stories/B-07-leads.md` | **Evaluation point**: B4 (primary, B-07) · B6 (secondary, B-08) | **Demo line(s)**: D-6, D-8

**Owner agents** (from the story front matter; used by the plan, not by this spec): design `mew`, `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify Playwright create/update/reload + URL-encoded combined filters

> Every story acceptance criterion becomes at least one FR below. No technology choices in this file; they belong in plan.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a lead from a candidate property (Priority: P1)

A sales rep finds a promising property or permit (for example, near Manor, TX, with an open roofing permit) and wants to turn it into a tracked record before they lose track of it.

**Why this priority**: Without this, nothing else in the story has anything to act on — it is the entry point for every other scenario.

**Independent Test**: With a property or permit already visible (from the map drawer or the candidate list), tap "Create lead" and confirm a new lead appears at the top of the lead list with status `new`, a signals snapshot, and a source manifest reference.

**Acceptance Scenarios**:

1. **Given** a property near Manor, TX with an open roofing permit, **When** the rep taps "Create lead" from its detail view, **Then** a lead is created with status `new`, a signals snapshot (roof age, permit id, contractor) and a source manifest reference, and appears at the top of the lead list within 2 seconds.
2. **Given** a lead already exists for that property's identity, **When** the rep tries to create another lead for the same property, **Then** the UI shows "Already a lead" and no duplicate record is written.

---

### User Story 2 - Update a lead's status and notes (Priority: P1)

A rep who has contacted (or is working) a lead wants to record what happened and have it stick.

**Why this priority**: A lead that cannot be updated is just a list of names — the whole point of tracking is to accumulate state over time.

**Independent Test**: Open an existing lead, change its status and add a note, reload the page, and confirm both the status and the note are still there.

**Acceptance Scenarios**:

1. **Given** an existing lead, **When** the rep changes its status to `contacted` and adds the note "Spoke with homeowner, roof confirmed 22 years old," then reloads the page, **Then** the new status and note both persist.

---

### User Story 3 - Browse and filter the lead list at scale (Priority: P2)

A rep managing many leads across Travis County wants to narrow the list the same way they narrow the map — by roof age, permit status, and radius — and share that exact view with someone else.

**Why this priority**: Useful once there are enough leads that scrolling through all of them stops being practical; depends on User Story 1 already producing leads to filter.

**Independent Test**: With 50 or more leads in the system, apply a combination of filters and confirm the list and the map agree on the resulting count, and that the URL reflects the combination so it can be copied and reopened to the same view.

**Acceptance Scenarios**:

1. **Given** 50 or more leads exist across Travis County, **When** the rep opens the Leads list and applies roof-age ≥ 20 years, permit status = open, and a 10 mi radius from Round Rock, **Then** the list and the map agree on the filtered count, and the combination of filters is reflected in the page's URL so it can be shared.

---

### User Story 4 - See when a lead's source property has gone stale (Priority: P2)

A rep opens a lead whose underlying property was re-platted or otherwise dropped from a newer data run, and needs to know that instead of being shown something that looks current but isn't.

**Why this priority**: Prevents a rep from acting on invented or silently stale information; depends on leads already existing (User Story 1) and on a newer data run having occurred.

**Independent Test**: Open a lead whose source property is absent from the current data run and confirm the lead shows an explicit "not in Run {n}" state rather than stale or fabricated values.

**Acceptance Scenarios**:

1. **Given** a lead's source property is absent from a newer data run (for example, re-platted), **When** the rep opens that lead, **Then** it shows a "not in Run {n}" state instead of silently showing stale or invented data.

---

### Edge Cases

- 20 concurrent "create lead" taps on the same property → exactly one lead is created; the other 19 see "already a lead."
- An empty lead list (no leads created yet) → shows an explicit empty state, not an error or an infinite spinner.
- A rep applies filters that match zero leads → the list and the map both show zero, not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a lead from a property or a permit, capturing a signals snapshot (roof age, open permit id, contractor) and a reference to the source data run, with initial status `new`, and show it at the top of the lead list within 2 seconds of creation.
- **FR-002**: System MUST refuse to create a second lead for a property that already has one, showing "Already a lead" to the rep and writing no duplicate record — including when 20 creation attempts for the same property happen at the same time (exactly one succeeds).
- **FR-003**: System MUST let a rep change a lead's status and add notes, and MUST persist every status change and note so it survives a page reload.
- **FR-004**: System MUST let a rep combine roof-age, permit-status/duration and radius filters on the lead list, MUST keep the list's filtered count in agreement with the map's filtered count, and MUST encode the active filter combination in the page's URL so it can be shared and reopened to the same view.
- **FR-005**: System MUST show a "not in Run {n}" state for a lead whose source property is no longer present in the current data run, and MUST NOT show stale or invented values in its place.

### Key Entities

- **Lead**: A tracked record created from a property or permit candidate. Carries a unique identity tied to the source property (never duplicated for the same property), a status (`new`, `contacted`, `qualified`, `won`, `lost`), an assignee, a point-in-time signals snapshot (roof age, open permit id, contractor) taken at creation, a running history of changes, a list of notes, where it was created from (map, list, or agent), and a reference to the data run it was created from.
- **Note**: A timestamped, attributed free-text entry attached to a lead.
- **History entry**: A timestamped, attributed record of a change made to a lead (e.g. a status change), accumulated gaplessly so nothing is ever overwritten or skipped.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rep can convert a candidate property into a visible, tracked lead in under 2 seconds.
- **SC-002**: 100% of duplicate-creation attempts for the same property are refused, including under 20 simultaneous attempts — exactly one lead ever exists per property.
- **SC-003**: 100% of status and note changes a rep makes survive a page reload.
- **SC-004**: With 50+ leads in the system, a rep can apply a 3-way filter combination (roof age, permit status, radius) and get a list count that matches the map's count for the same filters, with the combination recoverable from the URL alone.
- **SC-005**: A rep opening a lead whose source property has dropped out of the current data run always sees an explicit "not in Run {n}" indicator, never a value that looks current but isn't.

## Assumptions

- The lead-creation entry points (the map's property detail view and the candidate list) already exist and surface the identifying fields a lead needs to reference its source property — delivered by the prior story in this critical path (B-03).
- "Not in Run {n}" is computed when the lead is viewed, by comparing the lead's recorded source run against the run currently being served — not by a separate scheduled process (Round 1 decision, pending confirmation in this session).
- A rep works within a single shared account; a future per-rep or manager-wide view across all reps' leads is out of scope for this story (tracked separately as FEAT-B12).
- Creating a lead from an automated agent is out of scope for this story's UI; the agent's own creation path (a later story) will reuse the same creation rule this story defines, never bypassing it.
- No outbound message is sent to the property owner when a lead is created or updated; that remains out of scope per the assignment.
