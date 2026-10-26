# Feature Specification: Search a radius for aged roofs and open permits, with full detail

**Feature Branch**: `003-map-search`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Specify the story in stories/B-03-map-search.md: a merged story with four parts (B-03 radius, B-04 roof age, B-05 permits, B-06 detail), one section per part. Every AC (AC-1 to AC-7) becomes at least one FR with the same number. Header from the front matter (eval points B1 primary, B2/B3 secondary; demo lines D-2, D-3, D-4, D-5). Facts: ../assessment-guide/reference/B-roofing-crm.md § 3-4 and the B-02 index schema. No technology choices."

**Story**: `stories/B-03-map-search.md` | **Evaluation point**: B1 (primary, part B-03) · B2 (part B-04) · B3 (parts B-05, B-06) | **Demo line(s)**: D-2 (pin/GPS + radius), D-3 (roof-age threshold), D-4 (open permits, long-open first), D-5 (contractor + BBB detail)

**Owner agents** (from the story front matter; used by the plan, not by this spec): design `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify: Playwright with geolocation · 15 → 25 changes the roof-age count · permits sorted by open days · includes a BBB-not-available case

> Every story acceptance criterion becomes at least one FR below. No technology choices in this file; they belong in plan.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Center a search on a pin or GPS and set a radius (Priority: P1) — part B-03

As a sales rep, I drop a pin or use my device's location to center a search near a place I'm working, set how wide an area to search (0.5 to 25 miles), and see the map redraw to show only properties inside that circle, so I can judge candidates around where I actually am instead of browsing the whole county.

**Why this priority**: This is evaluation point B1, primary for this story and the gateway to every other part — roof age, permits and detail all filter the same radius result set. Nothing else in this story can be demonstrated without it.

**Independent Test**: Drop a pin near Pflugerville and set a 5 mi radius; confirm the map redraws a 5 mi ring and every result's location falls inside it, with no index or UI from the other three parts required.

**Acceptance Scenarios**:

1. **Given** the rep is at the Map screen, **When** they drop a pin near Pflugerville (30.4394° N, −97.6200° W) and set the radius to 5 mi, **Then** the map redraws a 5 mi ring and the result set contains only properties whose centroid falls inside it.
2. **Given** the rep denies the browser's location permission, **When** they tap "Use my location," **Then** the UI falls back to pin-drop mode with an explicit "location denied" state, never a silent failure or a blank map.
3. **Given** a radius with zero matching properties (for example 0.5 mi near a rural point near Lago Vista), **When** the search runs, **Then** the UI offers to widen the radius rather than showing a blank list.
4. **Given** a GPS position that resolves outside Travis County (for example in Williamson County), **When** the rep uses their location, **Then** the UI states the position is outside the covered county instead of showing an empty map.

---

### User Story 2 - Narrow results to roofs older than a threshold (Priority: P1) — part B-04

As a sales rep, within my current radius search, I set a minimum roof age (default 15 years) and see only properties that meet or exceed it, each showing how its roof age was determined and how confident that determination is, so I can prioritize the roofs most likely to need replacement.

**Why this priority**: Evaluation point B2. The age threshold is the first filter a rep applies after locating an area, and its correctness (basis, confidence, and that it runs over the real data rather than a cached slice) is itself a scored outcome (B2, scale check).

**Independent Test**: With a radius result set already showing, set the threshold to 15 years and confirm only properties at or above that age remain, each with a visible basis and confidence; then raise it to 25 and confirm the visible count drops and matches a direct query of the same inputs.

**Acceptance Scenarios**:

1. **Given** the 5 mi radius result set around Pflugerville, **When** the rep sets the roof-age threshold to 15 years (the default), **Then** only properties with a roof age of 15 years or more remain, each row showing its basis (how the age was determined) and its confidence.
2. **Given** the same 5 mi radius around Pflugerville, **When** the rep changes the threshold from 15 to 25, **Then** the visible result count at 25 is lower than at 15, and each of the two counts matches what a direct query of the full index returns for the same inputs — proving the filter runs over the complete data, not a cached subset.

---

### User Story 3 - See open roofing permits, longest-open first (Priority: P2) — part B-05

As a sales rep, within my current radius search, I switch to a view of open roofing permits ordered by how long each has been open, with a visible marker on any permit open more than 5 years, so I can prioritize properties where work was started but may be stalled.

**Why this priority**: Evaluation point B3 (shared with part B-06). This is the second filter path a rep uses alongside roof age, and the ordering itself (not just presence of permits) is what the demo and the evaluation check.

**Independent Test**: With a radius result set already showing, switch to the permit view and confirm results are ordered by open duration, longest first, with a "long-open" marker on any permit open more than 5 years.

**Acceptance Scenarios**:

1. **Given** the same radius, **When** the rep switches to the permit layer, **Then** results are sorted by open duration, longest first, and any permit open more than 5 years carries a visible "long-open" marker.

---

### User Story 4 - Review a property's full permit, contractor and BBB detail (Priority: P2) — part B-06

As a sales rep, when I open a specific property from the map or the permit view, I see its permit's status and open duration, the contractor on record, and that contractor's BBB rating where one has been published, with an honest statement when any of these is not available, so I can judge each candidate without leaving the map and without being shown a fabricated or blank value.

**Why this priority**: Evaluation point B3. This is the point at which a rep commits attention to one property, and it is the story's primary test of data honesty (never a blank field or a made-up rating).

**Independent Test**: Open a property near Manor with an open roofing permit and confirm the detail view shows status, open duration, contractor name and a working link back to Task A's published record; separately, open a property whose permit has no published BBB rating and confirm it reads "BBB rating not available" with a stated reason, never a blank field or an invented rating.

**Acceptance Scenarios**:

1. **Given** the rep opens a property near Manor with an open roofing permit, **When** the detail view opens, **Then** it shows the permit's status, open duration, contractor name, and a link back to Task A's published record for that property.
2. **Given** a permit whose BBB rating was never published by Task A, **When** the rep opens its detail view, **Then** it shows "BBB rating not available" with the reason — never a blank field or a fabricated rating.

---

### Edge Cases

- A radius with zero matching properties (e.g., 0.5 mi near a rural point near Lago Vista) → the UI offers a specific wider radius rather than a blank list (covered in User Story 1, Scenario 3).
- A GPS position outside Travis County (e.g., in Williamson County) → the UI states this explicitly instead of showing an empty map (covered in User Story 1, Scenario 4).
- A property with an open permit but no contractor resolved on it → the detail view states this is not available rather than omitting the field silently (same honesty rule as the BBB case, User Story 4).
- The roof-age and permit filters are applied together with the radius (not mutually exclusive) — the result set narrows by all active filters at once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (AC-1): System MUST accept a pin-drop or GPS center point and a search radius between 0.5 and 25 miles, and MUST return only properties whose location falls inside the resulting circle.
- **FR-002** (AC-2): System MUST, when location permission is denied, fall back to pin-drop mode with an explicit "location denied" state — never a silent failure or a blank map.
- **FR-003** (AC-3): System MUST filter the radius result set by an adjustable roof-age threshold (default 15 years), and MUST show each result's roof-age basis and confidence alongside the age.
- **FR-004** (AC-4): System MUST compute the roof-age filter over the complete underlying data for every threshold value, so that changing the threshold from 15 to 25 years produces a lower, and independently verifiable, visible count — never a value drawn from a cached or partial subset.
- **FR-005** (AC-5): System MUST, in the permit view, sort results by open duration (longest first) and MUST mark any permit open more than 5 years as "long-open."
- **FR-006** (AC-6): System MUST, in a property's detail view, show that property's open permit status, open duration, and contractor name, and MUST provide a link back to Task A's published record for that property.
- **FR-007** (AC-7): System MUST, when a permit's BBB rating was never published, show "BBB rating not available" together with the reason it is unavailable — never a blank field and never a fabricated rating.

### Key Entities

- **Property**: a parcel in the radius result set, carrying its location, roof age with basis and confidence, and whether it is residential or commercial. Sourced read-only from Task A's published data (`crm_property`, per the B-02 index schema: `propertyCid`, `latitude`/`longitude`, `roofAgeYears`, `roofAgeBasis`, `roofAgeConfidence`, plus the `missingReasons` list that states why any of these is absent).
- **Roofing permit**: a permit tied to a property, carrying its status, open duration, improvement type and a link to the contractor on record. Sourced read-only (`crm_permit`: `permitCid`, `statusClass`, `openDays`, `issueDate`, `contractorResolution`).
- **Contractor / BBB rating**: the contractor resolved on a permit and its Better Business Bureau rating, where Task A has published one; absent cases carry a stated reason rather than a blank value.
- **Search radius**: the rep's current center point (pin or GPS) and radius (0.5–25 mi), which scopes every result in all four parts of this story.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rep can go from an empty map to a radius result set centered on a chosen location in well under a minute of interaction (one pin drop or one location permission grant, plus one radius choice).
- **SC-002**: Changing the roof-age threshold from 15 to 25 years visibly changes the displayed result count every time it is tried, with the new count always lower, and always matching an independent check of the same inputs against the complete data.
- **SC-003**: In the permit view, the first result shown is always the one open the longest, for every radius tried.
- **SC-004**: Every property detail view shows a status for permit, contractor and BBB rating — populated or an honest "not available" with a reason — never a blank field, in 100% of cases checked.
- **SC-005**: A location-permission denial or an out-of-county GPS result always produces a specific, worded state on screen, never a blank or frozen map, in 100% of cases checked.

## Assumptions

- The radius search operates over the B-02 lead index (already synced from Task A's A-03 sample manifest for this story's build and test phase); this spec does not re-specify how that index is built or kept current.
- "Roof age" and "open duration" use the exact basis, confidence and status values Task A's contract defines; this story never recomputes or reinterprets them.
- A BBB rating is shown only when Task A's data marks it as rated; every other state (not checked, not found, blocked) is shown as "not available" with that reason, per architecture-constitution.md §7 and P0-4.
- GPS and location-permission behavior can only be proven against an HTTPS-hosted runtime (browsers refuse geolocation over plain HTTP); this spec's acceptance scenarios are written to be verified there, not on localhost.
- Real full-county result counts and BBB coverage are not available until Task A's A-11 publishes; this story is built and tested against the already-published A-03 sample slice, with a local synthetic fixture used only to exercise scale behavior (FR-004) in tests — never shown as real data.
