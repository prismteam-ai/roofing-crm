---
id: B-07
type: user-story
title: "Create, manage and browse CRM leads"
parent: FEAT-B07            # also covers FEAT-B08
parts: [B-07, B-08]
vision: VIS-B
ard: ARD-B
eval_point: B4 (primary, B-07) · B6 (secondary, B-08)
priority: P1
moscow: Must
branch: 007-leads
spec: specs/007-leads/
depends_on: ["B-03 merged"]
size_days: 1.5
agents:
  design: [mew, metagross]
  builder: metagross
  reviewers: [metagross, audino]
  verify: "Playwright: create, update, reload; URL-encoded combined filters"
skills: [build-frontend-backends, use-neutral-lexicon, frontend-bug-fix, apply-engineering-guidelines]
ui: true
status: Done
gate: G7
qc_testability_signoff: true
created: 2026-10-23
reuses: []  # nothing to copy from Task A (feature-list §4.6: "B-07 (leads), B08 (list) and B12 have nothing to copy")
---

# B-07 Create, manage and browse CRM leads

| Field | Value |
| --- | --- |
| Evaluation point | B4 (primary, part B-07: leads) · B6 (secondary, part B-08: lead list) |
| Demo line(s) | D-6 (convert matches into leads), D-8 (filter leads by age, permit status/duration, radius) |
| Agents | design `mew`, `metagross` · builder `metagross` · reviewers `metagross`, `audino` · verify Playwright create/update/reload + URL filters (from [AGENT-MAP.md](../../assessment-guide/AGENT-MAP.md) §5) |
| Depends on | B-03 merged (map + detail drawer, the creation points) |
| Size | 1.5 days |
| Branch | `007-leads`, merged into `feature/roofing-crm` |

## Context

Finding a promising roof is worthless if it is lost the moment the rep looks away. This story turns a property or permit match into a tracked record the rep (or a manager, later) can act on. `mew` is consulted first, read-only, to model the lead as a domain extension that **references** property and permit identities instead of copying them — matching `docs/architecture-constitution.md` ADR-04's key format (`{fips}:tcad:{request_identifier}`) and its gapless event-sourced history. There is nothing to copy from Task A here: the lead store is entirely new.

## Description

As a **sales rep**, I want to **turn a property or permit I find into a tracked lead, update its status and notes, and browse all my leads with the same filters I used to find them**, so that **good candidates never fall through the cracks between finding and contacting them**.

What will exist when done: a DynamoDB-backed lead store (status, assignee, notes, history, a signals snapshot), creation from the map drawer and the candidate list, duplicate refusal by a conditional transaction, and a paginated, filterable lead list whose filters are reflected in the URL.

**Independent test:** with B-03's map and drawer already live, create a lead from a real property, change its status, add a note, reload the page, and confirm persistence and no duplicate — no agent code (B-09) is needed.

## Acceptance Criteria

1. **AC-1 (B-07)** · **Given** a property near Manor, TX with an open roofing permit, **When** the rep taps "Create lead" from its detail drawer, **Then** a lead is created with status `new`, a signals snapshot (roof age, permit id, contractor) and `sourceManifestCid`, and appears at the top of the lead list within 2 s. ☑ testable
2. **AC-2 (B-07)** · **Given** a lead already exists for that property's key (`{fips}:tcad:{request_identifier}`), **When** the rep tries to create another lead for the same property, **Then** the UI shows "Already a lead" and no duplicate row is written, enforced by a DynamoDB conditional transaction. ☑ testable
3. **AC-3 (B-07)** · **Given** an existing lead, **When** the rep changes its status to `contacted` and adds the note "Spoke with homeowner, roof confirmed 22 years old," then reloads the page, **Then** the new status and note both persist. ☑ testable
4. **AC-4 (B-08, scale)** · **Given** 50 or more leads exist across Travis County, **When** the rep opens the Leads list and applies roof-age ≥ 20 years, permit status = open, and a 10 mi radius from Round Rock, **Then** the list and the map agree on the filtered count, and the combination of filters is reflected in the page's URL so it can be shared. ☑ testable
5. **AC-5 (B-08, missing-data)** · **Given** a lead's source property is absent from a newer Task A run (for example, re-platted), **When** the rep opens that lead, **Then** it shows a "not in Run {n}" state instead of silently showing stale or invented data. ☑ testable

## Edge cases

- 20 concurrent "create lead" taps on the same property → exactly one lead is created; the other 19 see "already a lead."
- An empty lead list (no leads created yet) → shows an explicit empty state, not an error or an infinite spinner.

## Requirements

| REQ | Requirement | Traces to |
| --- | --- | --- |
| FR-001 | System MUST create a lead from a property or a permit, with a signals snapshot and source manifest CID | AC-1 |
| FR-002 | System MUST refuse a duplicate lead for the same property key via a conditional write | AC-2 |
| FR-003 | System MUST persist status changes and notes across reloads | AC-3 |
| FR-004 | System MUST combine roof-age, permit-status/duration and radius filters on the lead list, encoded in the URL | AC-4 |
| FR-005 | System MUST show a "not in Run {n}" state for a lead whose source property is no longer published, never stale or invented data | AC-5 |
| NFR-001 | 20 concurrent creates on the same property resolve to exactly 1 winner, 0 lost updates | AC-2, ARD-B §10 |

No `[NEEDS CLARIFICATION]` remaining.

## Prototype reference

| Element | Value |
| --- | --- |
| Claude Design screen | `design/prototype/CrmLeadCreate390.dc.html`, `CrmLeadDup390.dc.html`/`CrmLeadDup1440.dc.html`, `CrmLeadsFiltered1440.dc.html`, `CrmLead1440.dc.html`, `CrmLeadsEmpty390.dc.html` |
| States covered | create success/duplicate/failed; combined filters; empty/loading/error/partial lead list; lead detail with status, assignee, notes, history |
| Design system | `../assessment-guide/design-system/` (Atlas, Material 3, mobile-first) |

## Demo Script

1. Presenter: "Convert two or three matches into leads." → Expected: leads created, appear in the list.
2. Presenter: "Change a status and add a note, then reload." → Expected: changes persist.
3. Presenter: "Filter leads by roof age, permit status and radius." → Expected: combined filter narrows both the map and the list, URL updates.

## Out of scope

- A sales-manager view across all reps' leads (FEAT-B12, Could, no story yet).
- Real outbound messages to property owners (README out of scope; mocked or deferred).
- Creating leads from the agent — that is B-09's "create lead" tool, which still calls this story's same `leads.create` procedure.

## Evidence to capture

- `docs/evidence/B-07.md` (§ B-08 for the list part): URL, real lead counts, screenshots of create/duplicate/status-change/reload, trace id.
- `testplans/B-07-test-cases.md` results, `docs/reviews/CR-B-07.md`.

---

## Gate G4: Story ready for planning

| # | Criterion | Status |
| --- | --- | --- |
| G4-1 | Front matter complete (parent FEAT, eval point, branch, priority, agents and skills from AGENT-MAP.md) | ☑ |
| G4-2 | "As a / I want / So that" stated, with an independent test | ☑ |
| G4-3 | Every AC is Given / When / Then, and its testable box is ticked | ☑ |
| G4-4 | One scale AC and one missing-data or error AC | ☑ |
| G4-5 | At least two edge cases | ☑ |
| G4-6 | Every requirement traces to an AC; NFRs have thresholds | ☑ (NFR-001 now traces to AC-2) |
| G4-7 | Prototype screen linked (UI stories) | ☑ (paths corrected to `design/prototype/*.dc.html`) |
| G4-8 | Dependencies done, or stubbed with real sample data | ☑ (B-03 merged) |
| G4-9 | No `[NEEDS CLARIFICATION]` left | ☑ |
| G4-10 | AI pre-check (`developmentsupport-g4-precheck`): PASS | ☑ re-run after fixing G4-6/G4-7, 2026-10-24 |

**Decision:** ☑ Ready ☐ Returned, reason: {…} · 2026-10-24

## Gate G7: Validated build

| # | Criterion | Status |
| --- | --- | --- |
| C-01 | Every task in `tasks.md` is done | ☑ (36 of 36) |
| C-02 | Unit and integration tests pass; coverage of new code at least 80 % | ☑ (845 passed, every lead file at least 80 %; `docs/reports/UT-B-07.md`) |
| C-03 | Code review: every reviewer at least 75, no open Critical | ☑ (metagross 80, re-scored 85; audino 78, re-scored 86; `docs/reviews/CR-B-07.md`) |
| C-04 | Test cases pass on the hosted URL | ☑ with PO exception (20 of 20 executed cases pass; TC-NF-03, the TC-011 scale variant and AC-4 at 50+ leads are deferred; `docs/reports/TR-B-07.md`) |
| C-05 | Every defect closed | ☑ (ERR-1 to ERR-20) |
| C-06 | No open Critical defect | ☑ |
| C-07 | Evidence complete | ☑ (`docs/evidence/B-07.md`) |
| C-08 | Traceability and kit usage complete | ☑ |
| C-09 | Commits start with the story ID; no secrets | ☑ (all start `B-07:`; gitleaks green) |
| C-10 | Story status Done after approval | ☑ |

**Decision:** ☑ Approved with exceptions ☐ Returned · HebaGaber (PO) · 2026-10-24

**Exceptions granted by the PO:**
1. TC-NF-03, the TC-011 scale variant and AC-4 at 50 or more leads are **deferred, not passed**: they need the A-11 full-county manifest, which moves to a later story. Recorded in `specs/007-leads/known-gaps.md` § 1.
2. ERR-13 (one unexplained TC-NF-01 failure) is accepted as closed **not reproduced, cause unproven**.
3. The responsive check (TZ04) used TC-NF-04 at 390 / 768 / 1440; the separate `smeargle` agent was not run.
4. The B-07 e2e spec skips on GitHub Actions (CI has no AWS credentials, and the organization policy blocks the GitHub-to-AWS role); its logged-in proof is the hosted local run recorded in `docs/evidence/B-07.md`.
5. The review findings deferred to the follow-up story (`known-gaps.md` §§ 4 and 7) are accepted, including the client-trusted `leads.create` (4.1).
