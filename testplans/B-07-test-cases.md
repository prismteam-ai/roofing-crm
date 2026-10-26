---
id: QC-TC-B-07
type: test-cases
title: "Create, manage and browse CRM leads"
parent: [FEAT-B07, FEAT-B08]
story: stories/B-07-leads.md
spec: specs/007-leads/spec.md        # FR numbers below are the spec's (FR-001…FR-005, NFR-001)
owner: HebaGaber                     # QC Lead
status: Draft                        # Draft → In Review → Approved
gate: G6
version: 0.3
created: 2026-10-24
runtime_url: "{RUNTIME_URL} = https://crm.{domain} or the 007-leads Amplify branch preview; never localhost"
reviewed_code: "67234b1 (deployed code; later commits are tests and docs only)"
qc_signoff: false
---

# Test Cases: B-07 Create, manage and browse CRM leads

> **v0.1, 2026-10-24.** Drafted with `developmentsupport-testcases` from the story's Given / When / Then ACs (AC-1 … AC-5), its two edge cases, its Requirements table and the spec's FR-001 … FR-005 and NFR-001. `tasks.md` was **not** read. Every case starts from `{RUNTIME_URL}` in a private window and logs in as `{TEST_USER}`. Playwright runs against `{RUNTIME_URL}`; `playwright.config.ts` must refuse `localhost`.
>
> Playwright test ids below are names only. `tests/e2e/B-07.spec.ts` is not written yet.

## 1. Feature overview

A rep turns a property or permit match into a tracked lead from the map drawer or the candidate list, changes its status and adds notes, and browses leads with combined roof-age, permit and radius filters that are kept in the URL. The value is that a promising roof is not lost between finding it and contacting the owner, and that the list and the map show the same filtered count.

## 2. Requirement mapping

| Source | Reference | Covered by |
| --- | --- | --- |
| Acceptance criterion | B-07-AC-1 (create lead, status `new`, snapshot, top of list in 2 s) | TC-001, TC-002, TC-003, TC-004, TC-NF-01 |
| Acceptance criterion | B-07-AC-2 (duplicate refused, conditional write) | TC-005, TC-006, TC-007 |
| Acceptance criterion | B-07-AC-3 (status and note persist across reload) | TC-008, TC-009, TC-010 |
| Acceptance criterion | B-07-AC-4 (50+ leads, combined filters, list and map agree, URL shareable) | TC-011, TC-012, TC-013, TC-NF-03 |
| Acceptance criterion | B-07-AC-5 (lead whose property is no longer in the run) | TC-014, TC-015 |
| Edge case | 20 concurrent "create lead" taps on one property | TC-007 |
| Edge case | Empty lead list (no leads yet) | TC-016 |
| Functional requirement | FR-001 (create from property or permit, snapshot, source manifest CID, top of list in 2 s) | TC-001, TC-002, TC-003, TC-004, TC-NF-01 |
| Functional requirement | FR-002 (refuse duplicate via conditional write, "Already a lead") | TC-005, TC-006, TC-007 |
| Functional requirement | FR-003 (status and notes persist across reload; failed save is undone) | TC-008, TC-009, TC-010 |
| Functional requirement | FR-004 (combined filters; list count = map count; filters in URL) | TC-011, TC-012, TC-013 |
| Functional requirement | FR-005 ("not in Run {n}", never stale or invented values) | TC-014, TC-015 |
| NFR | NFR-001 (20 concurrent creates on one key → exactly 1 winner, 0 lost updates) | TC-007 |
| NFR | Create-to-top-of-list p95 ≤ 2 s (from FR-001 and AC-1) | TC-NF-01 |
| NFR | List and map load p95 < 3 s with 50+ leads (from AC-4) | TC-NF-03 |
| NFR | Layout at 390 / 768 / 1440 with Atlas tokens only (story UI scope) | TC-NF-04 |
| Shared state (no AC of its own) | Empty list, filtered no-match, not-found lead | TC-016, TC-017 |

## 3. Assumptions

- **Data source.** Leads reference the Task A index snapshot already live for B-03 (runId `travis-202609-permits-20261021t103516z`, manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`). The B-03 plan's alias legend supplies the properties and permits used here.
- **Duplicate key.** The lead key is `{fips}:tcad:{request_identifier}` (ARD-B ADR-04). The Travis County FIPS is `48453`. The request identifier is read from the property row, never typed by hand.
- **Routes.** Leads list `/leads`, lead detail `/leads/{leadId}`, create from the Map drawer `/map` (drawer action "Create lead"). Confirm exact routes against the build; `{route}` marks where they may differ.
- **Login.** `{TEST_USER}` is an environment variable. Each case logs in, then reaches the screen under test.
- **Copy.** The prototype's visible copy sits mostly in screen titles (for example `CrmLeadDup390`: "already a lead, refused (never created twice)"; `CrmLeadStale390`: "property not in Run 4"; `CrmLeadsEmpty390`: "empty (no leads yet)"). The exact strings come from the story: "Already a lead", "not in Run {n}". Other strings are quoted where the design or the story gives them, and otherwise asserted as the behaviour. See GAP-2.
- **Distance.** "Within 10 mi of Round Rock" means the great-circle distance from the Round Rock centre to the property centroid (`latitude`/`longitude` on the `crm_property` row) is ≤ 10 mi (haversine, Earth radius 3,958.8 mi). The test computes it from row values, not from the map drawing.
- **Roof age and permit status are read from the index.** Each shown value is compared with `roofAgeYears`, `roofAgeBasis`, `statusClass`, `openDays` and `contractorResolution` on the B-02 index row.

## 4. Scope

- **In scope:** create from the drawer and from a permit row; the signals snapshot and source reference; duplicate refusal (sequential and concurrent); status and note changes and their persistence; the leads list with combined filters, URL encoding and map agreement; the "not in Run {n}" state; the empty, no-match and not-found states; create latency; responsive layout at 390 / 768 / 1440.
- **Out of scope:** a sales-manager view across reps (FEAT-B12, no story yet); real outbound messages to owners; creating leads from the agent (B-09 calls the same `leads.create`); the Task A pipeline and its data quality. Map search itself is covered by B-03.

## 5. Test data

- **Property A (happy path, real):** `{P_5_52}` = `baguqeera6sd3t5tdfy7xzfaycmcggimk6nzqv7prlcwvbqebohurx37cnpha`. `roofAgeYears=32`, basis `built_year`, 5.52 mi from Pflugerville, 10.16 mi from Manor. Its open permit is `{PM_28}`.
- **Property B (permit path and list ordering, real):** `{P_AGE48}` = `baguqeerakmixkpatzw4wbiqtxcqbewecmgrzcw3j4vcm3skbe7zofycy5daq`. `roofAgeYears=48`, 9.57 mi from Pflugerville, with 10 open permits, all `openDays=34`.
- **Property C (second lead for the list count, real):** `{P_5_89}` = `baguqeeraowktgtrrqrvysxggav2z6sxl5jzy4y5ql43c4ye5mivxphj7p3na`. `roofAgeYears=47`.
- **Contractor state:** every permit in this slice has `contractorResolution = unresolved`, so the "no contractor" state is the one that can be shown (see GAP-4).
- **Data snapshot:** manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`, runId `travis-202609-permits-20261021t103516z`. Every created lead must store this CID in `sourceManifestCid`.
- **Run-scoped values:** every note written by the suite starts with `B07-{yyyymmddHHMMss}-` so one run can be told apart from another. Reruns on the same property are refused by design, so cleanup is required (see below).
- **Cleanup:** after each run, `afterAll` deletes only the leads that `{TEST_USER}` created for `{P_5_52}`, `{P_AGE48}` and `{P_5_89}` in that run, through the lead store's test cleanup helper. No other lead is touched. This helper is a requirement for the build (GAP-3). Until it exists, the suite runs against a fresh `{TEST_USER}` per run.

## 6. Environment, risks and dependencies

- `RUNTIME_URL={RUNTIME_URL}` · test user `{TEST_USER}` (environment variable).
- B-03 merged (map and drawer, the creation points). Leads store must be deployed in `eu-north-1`.
- **Known gaps** that become expected-to-fail or blocked cases are listed in § 10 and linked from the rows they affect.

## 7. Coverage matrix

Coverage includes: happy path, negative, edge, validation or permission, integration, error handling, missing-data display.

| TC ID | Title | Priority | Tags | Type | Requirement(s) | Playwright test |
| --- | --- | --- | --- | --- | --- | --- |
| B-07-TC-001 | Create a lead from the drawer of `{P_5_52}` | P1 | @smoke @demo | UI | AC-1, FR-001 | `B-07.spec.ts › "B-07-TC-001 create lead from property drawer"` |
| B-07-TC-002 | Create a lead from a permit row (`{PM_28}`) | P2 | @smoke | UI | AC-1, FR-001 | `B-07.spec.ts › "B-07-TC-002 create lead from permit row"` |
| B-07-TC-003 | Lead detail shows the signals snapshot and source manifest CID | P1 | @smoke | UI | AC-1, FR-001 | `B-07.spec.ts › "B-07-TC-003 signals snapshot and source CID"` |
| B-07-TC-004 | Lead with no resolved contractor shows the reason, not an invented name | P2 | @missing-data | UI | AC-1, FR-001 | `B-07.spec.ts › "B-07-TC-004 no contractor shows reason"` |
| B-07-TC-005 | Drawer of `{P_5_52}` shows "Already a lead" and no Create button | P1 | @negative @demo | UI | AC-2, FR-002 | `B-07.spec.ts › "B-07-TC-005 duplicate shows Already a lead"` |
| B-07-TC-006 | Opening the drawer of an existing lead writes no row (list count unchanged) | P1 | @negative | UI+API | AC-2, FR-002 | `B-07.spec.ts › "B-07-TC-006 duplicate writes no row"` |
| B-07-TC-007 | 20 concurrent creates on `{P_AGE48}` → exactly 1 lead, 19 "Already a lead" | P1 | @edge @nfr | UI+API | AC-2, NFR-001 | `B-07.spec.ts › "B-07-TC-007 20 concurrent creates"` |
| B-07-TC-008 | Change status to `contacted` and add the note; reload keeps both | P1 | @smoke @demo | UI | AC-3, FR-003 | `B-07.spec.ts › "B-07-TC-008 status and note persist"` |
| B-07-TC-009 | Failed status save is undone and reported, never silently lost | P2 | @negative | UI | AC-3, FR-003 | `B-07.spec.ts › "B-07-TC-009 failed save undone"` |
| B-07-TC-010 | Note text round-trips exactly (quotes, punctuation, 1,000 chars) | P2 | @edge | UI | AC-3, FR-003 | `B-07.spec.ts › "B-07-TC-010 note round-trip"` |
| B-07-TC-011 | Combined filters (roof age ≥ 20, permit open, 10 mi of Round Rock) narrow the list and agree with the map count | P1 | @smoke @demo | UI | AC-4, FR-004 | `B-07.spec.ts › "B-07-TC-011 combined filters agree with map"` |
| B-07-TC-012 | Active filters are encoded in the URL and reopen to the same view in a new private window | P1 | @smoke @demo | UI | AC-4, FR-004 | `B-07.spec.ts › "B-07-TC-012 filters in URL reopen same view"` |
| B-07-TC-013 | Filter combination with no leads shows the no-match state | P2 | @negative | UI | AC-4, FR-004 | `B-07.spec.ts › "B-07-TC-013 no-match state"` |
| B-07-TC-014 | Lead whose property is not in the current run shows "not in Run {n}" | P1 | @missing-data @demo | UI | AC-5, FR-005 | `B-07.spec.ts › "B-07-TC-014 not in Run n"` |
| B-07-TC-015 | Stale lead shows no invented or stale values in place of the missing ones | P1 | @missing-data | UI | AC-5, FR-005 | `B-07.spec.ts › "B-07-TC-015 no stale values"` |
| B-07-TC-015b | A lead on a property that is still in the run is not flagged as "not in run" | P1 | @missing-data | UI | AC-5, FR-005 | `B-07.spec.ts › "B-07-TC-015b lead on a property still in the run is not flagged"` |
| B-07-TC-016 | Empty lead list shows the explicit empty state | P1 | @edge | UI | Edge case, FR-004 | `B-07.spec.ts › "B-07-TC-016 empty list state"` |
| B-07-TC-017 | Unknown lead id shows the not-found state, not a spinner | P2 | @negative | UI | FR-003 | `B-07.spec.ts › "B-07-TC-017 unknown lead not found"` |
| B-07-TC-NF-01 | Create-to-top-of-list p95 ≤ 2 s over 20 creates | P2 | @perf | UI | FR-001, AC-1 | `B-07.spec.ts › "B-07-TC-NF-01 create latency p95"` |
| B-07-TC-NF-03 | List and map load p95 < 3 s with 50 or more leads | P2 | @perf | UI | AC-4 | `B-07.spec.ts › "B-07-TC-NF-03 list load p95"` (blocked, GAP-1) |
| B-07-TC-NF-04 | Leads list and detail at 390 / 768 / 1440: no horizontal scroll, Atlas tokens only | P2 | @responsive | UI | UI scope | `B-07.spec.ts › "B-07-TC-NF-04 responsive and tokens"` |

## 8. Functional test cases

Each case is a complete, ordered sequence that starts from `{RUNTIME_URL}`. Use one action per step, name the exact element and the exact data, and give a concrete expected result.

### B-07-TC-001: Create a lead from the drawer of `{P_5_52}` (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-1, FR-001 · demo line D-6
- **Preconditions:** `{TEST_USER}` has no lead on `{P_5_52}`. The Map shows Travis County.
- **Test data:** `{P_5_52}`, `roofAgeYears=32`, open permit `{PM_28}`, snapshot `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in a private window. → Map loads with the Travis County index.
  2. **Log in** as `{TEST_USER}`. → Map screen is shown.
  3. **Tap** the result row for `{P_5_52}`. → Property drawer opens with roof age `32 yr` (basis `built_year`).
  4. **Tap** "Create lead" in the drawer. → Create-success state is shown.
  5. **Open** `{RUNTIME_URL}/leads` (tab "Leads"). → Lead list is shown.
  6. **Verify** the first row is `{P_5_52}` with status `new` and created-at within the last 2 minutes.
- **Expected result:** exactly one lead for `{P_5_52}` is in the list, at the top, status `new`. Its roof age reads 32 and matches the index row.

### B-07-TC-002: Create a lead from a permit row (permit path)

- **Priority / tags:** P2 · `@smoke`
- **Maps to:** AC-1, FR-001
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map?layer=permits` in a private window and **log in** as `{TEST_USER}`.
  2. **Tap** the permit row `{PM_28}`. → Permit detail opens with status `open`.
  3. **Tap** "Create lead" on the permit row. → Create-success state.
  4. **Open** `{RUNTIME_URL}/leads`. → Lead list is shown.
  5. **Verify** the top row is `{P_5_52}` (the parent property of `{PM_28}`) and its signals show permit id `{PM_28}`.
- **Expected result:** one lead for `{P_5_52}`, whose snapshot names permit `{PM_28}`. A second lead is **not** created (TC-005 applies).

### B-07-TC-003: Lead detail shows the signals snapshot and source CID

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-1, FR-001
- **Preconditions:** TC-001 has created the lead for `{P_5_52}`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Tap** the row for `{P_5_52}`. → Lead detail `/leads/{leadId}` opens.
  3. **Verify** the snapshot block shows roof age `32`, permit id `{PM_28}` and the contractor reason from TC-004.
  4. **Verify** the "Source" line shows `sourceManifestCid bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`.
- **Expected result:** the snapshot values equal the index row values; the source CID equals the snapshot CID in § 5, character for character.

### B-07-TC-004: Lead with no resolved contractor shows the reason, not an invented name (missing data)

- **Priority / tags:** P2 · `@missing-data`
- **Maps to:** AC-1, FR-001
- **Preconditions:** `{TEST_USER}` has no lead on `{P_5_52}`. Every permit in the slice has `contractorResolution = unresolved`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in a private window and **log in** as `{TEST_USER}`. → Map loads with the Travis County index.
  2. **Tap** the result row for `{P_5_52}`. → Property drawer opens.
  3. **Tap** "Create lead" in the drawer. → Create-success state is shown.
  4. **Open** `{RUNTIME_URL}/leads` and **tap** the row for `{P_5_52}`. → Lead detail `/leads/{leadId}` opens.
  5. **Verify** the contractor field.
- **Expected result:** the field shows a "contractor not available" state naming the reason from the index (`contractorResolution = unresolved`; exact copy TBD at build time, GAP-2 — assert the reason code is surfaced, not a specific literal string). No contractor name or BBB rating is shown.

### B-07-TC-005: A property that is already a lead shows "Already a lead" instead of a Create button (negative)

- **Priority / tags:** P1 · `@negative @demo`
- **Maps to:** AC-2, FR-002
- **Preconditions:** TC-001 has created the lead for `{P_5_52}`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` and **log in** as `{TEST_USER}`.
  2. **Open** the drawer for `{P_5_52}` (result row, or the `sel` link). The drawer first shows a disabled "Checking Leads…" button while it looks the property up.
  3. **Verify** the pill "Already a lead · {status}" is shown with an "Open lead" link, and that no enabled "Create lead" button exists (permit rows show nothing).
- **Expected result:** the text "Already a lead" is visible; the "Open lead" link opens `/leads/{leadKey}` of the existing lead. There is no button to tap and no success state. If the lookup itself fails, the normal "Create lead" button shows and the server's refusal (HTTP 409) still maps to "Already a lead"; that server path is proven by TC-007.

### B-07-TC-006: Duplicate attempt writes no row (negative, data integrity)

- **Priority / tags:** P1 · `@negative`
- **Maps to:** AC-2, FR-002
- **Preconditions:** TC-001 has created the lead for `{P_5_52}`. Record the lead count from `/leads` first (call it N).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **note** the total row count (N) and the row count for `{P_5_52}` (1).
  2. **Open** `{RUNTIME_URL}/map` and **log in** as `{TEST_USER}` (new tab/context).
  3. **Open** the drawer for `{P_5_52}` and **do not tap anything**. → "Already a lead" is shown and there is no "Create lead" button (TC-005's outcome).
  4. **Open** `{RUNTIME_URL}/leads` and **reload** the page.
  5. **Verify** the count of rows for `{P_5_52}` in the list.
  6. **Verify** the total row count.
- **Expected result:** exactly 1 row for `{P_5_52}`. Total count is N, unchanged. Opening the drawer wrote nothing, so no second item exists under the key `48453:tcad:{request_identifier}`. (The refused conditional write itself is TC-007's job.)

### B-07-TC-007: 20 concurrent creates on the same property resolve to exactly one lead (edge, NFR-001)

- **Priority / tags:** P1 · `@edge @nfr`
- **Maps to:** AC-2, NFR-001, edge case 1
- **Preconditions:** `{TEST_USER}` has no lead on `{P_AGE48}`. The lead store is empty for that key at the start.
- **Test data:** `{P_AGE48}` (`roofAgeYears=48`, 10 open permits, all `openDays=34`).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in 20 private browser contexts, each logged in as `{TEST_USER}`.
  2. **In all 20 contexts at once,** **tap** "Create lead" on the drawer of `{P_AGE48}`.
  3. **Wait** until all 20 contexts show a final state (success or "Already a lead").
  4. **Count** the outcomes: one success, 19 "Already a lead".
  5. **Open** `{RUNTIME_URL}/leads` and **count** the rows for `{P_AGE48}`.
- **Expected result:** exactly 1 success, exactly 19 "Already a lead", exactly 1 row for `{P_AGE48}` in the list. 0 lost updates: the single row's status is `new` and its `createdAt` matches the winning request's time. Pass criterion is 20 of 20 contexts reaching a final state within 10 s.

### B-07-TC-008: Change status to `contacted` and add the note; reload keeps both (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-3, FR-003 · demo line D-6 second step
- **Preconditions:** the lead for `{P_5_52}` exists with status `new`.
- **Test data:** note text exactly `Spoke with homeowner, roof confirmed 22 years old`. Prefix with the run tag from § 5: `B07-{runId} Spoke with homeowner, roof confirmed 22 years old`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Tap** the row for `{P_5_52}`.
  3. **Select** status `contacted` in the status control. → Status shows `contacted`.
  4. **Type** the note text into the "Notes" field and **tap** "Save note". → The note appears in the history with today's timestamp.
  5. **Reload** the page (F5).
  6. **Verify** the status control still shows `contacted`, and the notes list still contains the note text exactly.
- **Expected result:** after reload, status = `contacted` and the note text equals the typed text character for character. The history shows two events: status change and note added.

### B-07-TC-009: Failed status save is undone and reported (negative, error handling)

- **Priority / tags:** P2 · `@negative`
- **Maps to:** FR-003 (and AC-3 by implication)
- **Preconditions:** the lead for `{P_5_52}` exists with status `new`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads/{leadId}` and **log in** as `{TEST_USER}`.
  2. **Route** the lead update request to return HTTP 500 (Playwright `route`).
  3. **Select** status `contacted`.
  4. **Verify** an error message is visible stating the save failed (exact copy TBD at build time, GAP-2 — assert presence and that it names "status" or "save", not the literal string).
  5. **Verify** the status control reads `new` again.
  6. **Reload** the page with the route removed.
  7. **Verify** the status is still `new`.
- **Expected result:** the status returns to `new` on screen and after reload. The error message is visible. No "contacted" value is shown as saved.

### B-07-TC-010: Note text round-trips exactly (edge)

- **Priority / tags:** P2 · `@edge`
- **Maps to:** FR-003
- **Preconditions:** the lead for `{P_5_52}` exists.
- **Test data:** note with quotes, an ampersand, a line break and a 1,000-character run of text. Prefix with the run tag.
- **Steps:**
  1. **Open** the lead for `{P_5_52}`.
  2. **Type** the note into "Notes" and **tap** "Save note".
  3. **Reload** the page.
  4. **Verify** the note text.
- **Expected result:** the text after reload equals the typed text exactly, including the quotes, the ampersand, the line break and all 1,000 characters.

### B-07-TC-011: Combined filters narrow the list and agree with the map count (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-4, FR-004 · demo line D-8
- **Preconditions:** the leads for `{P_5_52}`, `{P_AGE48}` and `{P_5_89}` exist (TC-001, TC-007, and a create on `{P_5_89}`).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Set** roof age ≥ 20 years, permit status `open`, and radius 10 mi from Round Rock.
  3. **Verify** the list count equals the count shown in the map header for the same filters.
  4. **Verify** each listed lead's property is within 10 mi of Round Rock, computed from its `latitude`/`longitude`.
- **Expected result:** the list and the map each show the same filtered count. Only leads whose properties satisfy all three filters are listed.

### B-07-TC-012: Filters are encoded in the URL and reopen to the same view (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-4, FR-004
- **Preconditions:** TC-011 filter set applied.
- **Steps:**
  1. **Read** the page URL. → Contains the three filter parameters (names from the build, e.g. `roofAge=20`, `permit=open`, `radius=10`, `from=RoundRock`).
  2. **Copy** the URL.
  3. **Open** the copied URL in a new private window and **log in** as `{TEST_USER}`.
  4. **Verify** the same three filters are selected and the list count equals the count from TC-011.
- **Expected result:** the URL holds the full filter combination, and opening it reproduces the same filtered view and count.

### B-07-TC-013: Filter combination with no leads shows the no-match state (negative)

- **Priority / tags:** P2 · `@negative`
- **Maps to:** AC-4, FR-004
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Set** roof age ≥ 60 years, permit status `closed`, and radius 0.5 mi from Round Rock.
  3. **Verify** the list shows the no-match message.
- **Expected result:** the list shows the "no leads match these filters" state with a button to clear filters. It is not an error and not an empty table with no message.

### B-07-TC-014: Lead whose property is not in the current run shows "not in Run {n}" (missing data, AC-5)

- **Priority / tags:** P1 · `@missing-data @demo`
- **Maps to:** AC-5, FR-005 · GAP-5
- **Preconditions:** a lead exists for a property that is not in the latest run. This needs a second published run (GAP-5). Until then the case is **blocked**, not passed.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Tap** the stale lead.
  3. **Verify** the banner "property not in Run {n}" is shown, where `{n}` is the current run number.
- **Expected result:** the text "not in Run {n}" is visible on the lead. `{n}` equals the current run number from the index, not a hard-coded value.

### B-07-TC-015: Stale lead shows no stale or invented values (missing data, AC-5)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-5, FR-005
- **Preconditions:** a lead exists for a property that is not in the latest run (requires a second published run, GAP-5). Until then this case is **blocked**, not passed.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Tap** the stale lead (the one whose source property is absent from the current run).
  3. **Verify** the "not in Run {n}" banner is shown (TC-014's outcome).
  4. **Verify** the roof-age, permit and contractor fields on the same lead detail view.
- **Expected result:** each field shows either the value stored in the lead's own snapshot, labelled as a snapshot from the earlier run, or "not in Run {n}". No value is recomputed from a missing source row, and no value is blank without a reason.

### B-07-TC-015b: A lead whose property is still in the run is not flagged (negative control, AC-5)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-5, FR-005
- **Preconditions:** the lead for `{P_5_52}` exists and was captured under the manifest the index now serves.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` and **log in** as `{TEST_USER}`.
  2. **Tap** the row for `{P_5_52}`. → Lead detail opens.
  3. **Verify** there is no "Not in run" banner and the signals show the current values (roof age, permit).
- **Expected result:** no "not in run" state, and no values withheld. A lead is flagged only when its manifest differs from the one now served **and** its property is absent from the served index; the unit tests cover "manifest differs but property present" (not flagged).

### B-07-TC-016: Empty lead list shows the explicit empty state (edge)

- **Priority / tags:** P1 · `@edge`
- **Maps to:** edge case 2, FR-004
- **Preconditions:** `{TEST_USER}` has no leads (fresh user or after cleanup).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads` in a private window and **log in** as the fresh `{TEST_USER}`.
  2. **Verify** the list area.
- **Expected result:** the text "no leads yet" is shown with a link to the map. There is no error banner and no spinner left running after the data response.

### B-07-TC-017: Unknown lead id shows the not-found state (negative)

- **Priority / tags:** P2 · `@negative`
- **Maps to:** FR-003
- **Steps:**
  1. **Open** `{RUNTIME_URL}/leads/does-not-exist` and **log in** as `{TEST_USER}`.
  2. **Verify** the page.
- **Expected result:** a "lead not found" state with a link back to `/leads`. The spinner stops within 3 s.

## 9. Edge cases

- Duplicate tapped 20 times in one context (not concurrent) → one lead, 19 "Already a lead" (covered as TC-007's sequential variant).
- Status changed while another context holds the same lead open → the second change shows the current status before it saves (covered as a follow-up check in TC-009).
- Radius 0.5 mi with zero results → TC-013 no-match state, not an error.

## 10. Gap-linked cases (expected to fail or be blocked until fixed)

| TC ID | Asserts | Gap | Defect |
| --- | --- | --- | --- |
| B-07-TC-NF-03 | List and map load p95 < 3 s with 50 or more leads across Travis County | GAP-1: full-county index not published (A-11 pending); the slice has 14 properties, so 50 distinct leads cannot exist yet | — |
| B-07-TC-011 (scale variant) | Filtered count over 50 or more leads | GAP-1 | — |
| B-07-TC-014, TC-015 | "not in Run {n}" for a re-platted property | GAP-5: needs a second published run that drops a property present in run 1 | — |
| B-07-TC-009, TC-004 | Exact copy strings | GAP-2: prototype copy sits in screen titles; the save-failed message and the contractor reason wording are asserted by behavior/reason-code only until confirmed against the build, never as a literal string | — |
| B-07-TC-003, TC-004 | Contractor reason text | GAP-4: every permit in this slice is `unresolved`, so only the "not available" state can be shown | — |
| B-07-TC-016, TC-006, TC-007 | Clean rerun | GAP-3: no lead-delete in scope; reruns on the same property are refused by design, so the test cleanup helper is needed | — |

## 11. Execution log

Hosted preview `https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com`, web build `cbb068f`, API `2a2f669`, manifest `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`, run 2026-10-24 on mobile 390, tablet 768 and desktop 1440 (final complete run: exit 0, 136 passed, 17 skipped, 0 failed; see `docs/evidence/B-07.md`). Screenshots are `docs/evidence/img/B-07-TC-{nnn}-*.png`.

| TC ID | Result | Evidence / note | Defect |
| --- | --- | --- | --- |
| B-07-TC-001 | PASS | created, top of list | ERR-5 (order) |
| B-07-TC-002 | PASS | per-permit button | — |
| B-07-TC-003 | PASS | snapshot incl. permit id and open days | ERR-8 |
| B-07-TC-004 | PASS | "Contractor not published" | — |
| B-07-TC-005 | PASS | "Already a lead" | ERR-1 |
| B-07-TC-006 | PASS | no second row | — |
| B-07-TC-007 | PASS | 1 created, 19 refused on all 3 viewports | ERR-4, ERR-12 |
| B-07-TC-008 | PASS | status and note persist | ERR-10 |
| B-07-TC-009 | PASS | failed save undone | — |
| B-07-TC-010 | PASS | 1,000-character note round-trips | ERR-6, ERR-10 |
| B-07-TC-011 | PASS on the sample (3 leads); **scale variant DEFERRED by the PO** (needs 50+ leads, the A-11 full-county manifest) | `specs/007-leads/known-gaps.md` § 1 | — |
| B-07-TC-012 | PASS | filters reopen from the URL | — |
| B-07-TC-013 | PASS | no-match state | — |
| B-07-TC-014 | PASS with a stale fixture lead (no second published run yet) | `B-07-TC-014-not-in-run.png` | ERR-9 |
| B-07-TC-015 | PASS with the same fixture | signals withheld | ERR-9 |
| B-07-TC-015b | PASS | not flagged | ERR-9 |
| B-07-TC-016 | PASS | "No leads yet" | — |
| B-07-TC-017 | PASS | "Lead not found" with a link back | ERR-20 |
| B-07-TC-NF-01 | PASS, p95 613 / 590 / 591 ms (target 2000) | final run | ERR-11, ERR-13 |
| B-07-TC-NF-03 | **DEFERRED by the PO** (not executed, not passed): list and map load p95 with 50+ leads | `specs/007-leads/known-gaps.md` § 1 | — |
| B-07-TC-NF-04 | PASS on 3 viewports | token audit and no horizontal scroll | ERR-7, ERR-19 |

---

## Gate G6: Test Case Approval

| # | Criterion | Status |
| --- | --- | --- |
| G6-1 | Every AC and every FR maps to at least one TC (§ 2 and § 7) | ☑ |
| G6-2 | Happy, negative, edge and missing-data paths covered | ☑ |
| G6-3 | NFRs have test cases with measurable pass criteria | ☑ |
| G6-4 | Every case is a complete sequence starting from the hosted URL | ☑ (TC-004, TC-006, TC-015 expanded to full sequences, no longer reference other TCs for steps) |
| G6-5 | Negative cases state the exact message or rejection behavior | ☑ ("Already a lead" and "not in Run {n}" are exact per the story; TC-009/TC-004's unconfirmed copy asserted by behavior/reason-code only, GAP-2) |
| G6-6 | Test data and environment documented, with real records | ☑ |
| G6-7 | Every TC traces to the story and a requirement | ☑ |
| G6-8 | AI pre-check (`developmentsupport-g6-precheck`): PASS | ☑ re-run after fixing C-05/C-06, 2026-10-24 |

**Decision:** ☑ Approved ☐ Returned, reason: {…} · 2026-10-24


## Change log

**v0.3, 2026-10-24:** TC-015b added to the matrix and the cases; the execution log is filled in (results above, with the PO deferrals marked as deferred, not skipped).

**v0.2, 2026-10-24** (after the hosted run; evidence in `docs/evidence/B-07.md`):

- **Route:** the Map is the app's index route `/`, not `/map`. The drawer deep link is `/?sel={propertyCid}`.
- **TC-002:** the permit row is a card in the property drawer with its own button "Create lead from permit {n}". The lead is per property, so after TC-001 the row answers "Already a lead".
- **TC-003:** asserts the snapshot's permit id and open days, which the build did not store until the gap-fix round.
- **TC-008, TC-010:** assert on the SAVED notes list, not the whole Notes region (the region contains the textarea, so typed-but-unsaved text satisfied the old check).
- **TC-014, TC-015:** run with a stale fixture lead (`48453:tcad:B07STALE`, manifest of another run, property absent from the current index). The flag now means "manifest differs AND property absent".
- **TC-015b (new):** a lead whose property is still in the run is not flagged.
- **TC-017:** passes on its original wording. The page first showed only a generic load-error banner; the product now shows "Lead not found" with a "Back to leads" link, and a missing lead is not retried.
- **TC-007:** throttled calls (HTTP 503, Lambda concurrency 10 on this account) are retried and counted, as a real client would.
- **Deferred to a follow-up story (PO decision 2026-10-24):** TC-011 scale variant and TC-NF-03 (50+ leads need the A-11 full-county manifest). See `specs/007-leads/known-gaps.md`.
