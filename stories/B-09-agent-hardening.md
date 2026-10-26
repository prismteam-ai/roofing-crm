---
id: B-09
type: user-story
title: "Answer roofing-opportunity questions with a grounded agent, hardened for production"
parent: FEAT-B09            # also covers FEAT-B11
parts: [B-09, B-11]
vision: VIS-B
ard: ARD-B
eval_point: B5 (primary, B-09) · B6 (secondary, B-11 responsiveness/observability)
priority: P1
moscow: Must
branch: 009-agent-hardening
spec: specs/009-agent-hardening/
depends_on: ["B-07 merged"]
depends_on_deferred: ["Task A A-14 (Agent + MCP) — still Ready, not Done; agent runtime built natively in roofing-crm this round, accepted deviation, swap for A-14's version once it merges", "Task A A-13 (Explorer UI + content pages) — still Draft, not Done; responsive config built natively this round, swap for A-13's version once it merges"]
size_days: 1.5
agents:
  design: [alakazam, ash, smeargle, porygon]
  builder: alakazam           # retrieval
  builder_2: ash               # agent runtime
  builder_3: metagross          # responsive + observability (B-11)
  reviewers: [alakazam, ash, metagross, audino, porygon]
  verify: "golden queries G1–G7 (checks.md §7) · full smeargle suite at 390/768/1440 · CloudWatch RoofingCrm dashboard"
skills: [build-rag-systems, build-ai-agents, use-elephant-mcp, responsive-design-tests, unify-metrics, build-frontend-backends, apply-engineering-guidelines]
ui: true
status: Done
gate: G7
qc_testability_signoff: false
created: 2026-10-23
reuses:
  - from: "Task A A-14 (Agent + MCP) — NOT reused this round: A-14 is still status Ready in the oracle repo, no agent.ask.ts/getModel.ts exist yet to copy"
    paths: []
    note: "Built natively inside roofing-crm instead (accepted deviation): getModel()/AI_PROVIDER switch, agent.ask tRPC procedure with its timeouts and $3/day cap, the Answer panel, geocodePlace, the golden-query Vitest harness, and the new createLead + map-pin tools. Swap-back condition: once the user confirms A-14 has merged and published these, reconcile roofing-crm's version against it (no architecture change expected, since both follow the same ADR-06 contract)."
  - from: "Task A A-13 (Explorer UI + content pages) — NOT reused this round: A-13 is still status Draft, no breakpoints config or tablet.css/compact.css exist yet to copy"
    paths: []
    note: "Built natively inside roofing-crm instead (accepted deviation): smeargle breakpoints config and container-query rules (tablet.css, compact.css), reusing B-01/B-03's existing responsive baseline where present. Swap-back condition: once the user confirms A-13 has merged, reconcile against its config. Lead business metrics and the CloudWatch dashboard (B-11) are new work either way."
---

# B-09 Answer roofing-opportunity questions with a grounded agent, hardened for production

| Field | Value |
| --- | --- |
| Evaluation point | B5 (primary, part B-09: agent) · B6 (secondary, part B-11: responsive + observable) |
| Demo line(s) | D-7 (RAG agent query) |
| Agents | design `alakazam`, `ash`, `smeargle`, `porygon` · builder `alakazam` (retrieval) + `ash` (agent runtime) + `metagross` (responsive + observability) · reviewers `alakazam`, `ash`, `metagross`, `audino`, `porygon` · verify golden queries + full `smeargle` suite (from [AGENT-MAP.md](../../assessment-guide/AGENT-MAP.md) §5) |
| Depends on | B-07 merged (leads, for the agent's `createLead` tool); Task A A-14 and A-13 published |
| Size | 1.5 days |
| Branch | `009-agent-hardening`, merged into `feature/roofing-crm` |

## Context

This is the last story, by design: it layers a plain-language agent over everything already built, then proves the whole app is responsive and observable before release. The agent never invents data — every claim is grounded in the B-02 index and cited — and it never writes a lead directly; it proposes, and the rep confirms through the same `leads.create` procedure B-07 built (constitution P0 rule, ARD-B §12.10). Part B-11 rides along here because responsiveness and observability are properties of the whole, finished app, not of any one screen.

## Description

As a **sales rep**, I want to **ask a plain-language question about roofing opportunities and get a grounded, cited answer I can open on the map or turn into a lead**, so that **I don't have to manually build a radius-and-filter search for every idea I have**; and as the **evaluator**, I want to **see the finished app work smoothly on a phone, a tablet and a desktop, with real operational signals**, so that **the product is trustworthy under real use, not just on a demo laptop**.

What will exist when done: a tRPC `agent.ask` procedure using the Vercel AI SDK (Bedrock via `AI_PROVIDER`) with Zod tools (`geocodePlace`, `searchProperties`, `searchPermits`, `getProperty`, `proposeLeads`), a confidence threshold with an honest "no results" answer, citations in every answer, numbered map pins, and a `createLead` confirmation flow; plus the full `smeargle` suite passing at 390/768/1440 px, Powertools business metrics, a self-resolving DLQ alarm, and a small CloudWatch dashboard.

**Independent test:** with B-07's leads already live, ask the deployed agent a README-style question, confirm it cites real records, open one result on the map, and create a lead from the answer — then run the full responsive suite against the same hosted URL.

## Acceptance Criteria

1. **AC-1 (B-09)** · **Given** the rep asks "open roofing permits older than five years within five miles of Pflugerville," **When** the agent answers, **Then** it states the geocoded center point it used, returns real `property_cid`s with citations, and each result can be opened on the map. ☐ testable
2. **AC-2 (B-09)** · **Given** the agent has just answered with 3 candidate properties, **When** the rep says "create a lead for the first result," **Then** a lead is created through the same `leads.create` procedure as the map (the model never writes a lead directly), and it appears in the lead list. ☐ testable
3. **AC-3 (B-09, missing-data)** · **Given** the rep asks about ZIP 99999 (not a Travis County ZIP), **When** the agent processes the question, **Then** it answers that the scope is invalid or empty, with zero fabricated results. ☐ testable
4. **AC-4 (B-09, scale)** · **Given** the 7 golden queries in `checks.md` §7 are run against the deployed agent endpoint, **When** each one executes, **Then** first-useful-answer p95 is under 20 s and 100% of cited `property_cid`s exist in the current index. ☐ testable
5. **AC-5 (B-11)** · **Given** the full `smeargle` suite, **When** it runs at 390, 768 and 1440 px against the hosted URL, **Then** every screen in the app passes with no layout overflow or inaccessible controls. ☐ testable
6. **AC-6 (B-11)** · **Given** a sync-job failure lands a message on the DLQ, **When** the DLQ depth becomes greater than 0, **Then** a CloudWatch alarm fires and self-resolves once the queue drains, visible on the `RoofingCrm` dashboard. ☐ testable
7. **AC-7 (data switch to the full county)** · **Given** Task A has published its Run 2 full-county manifest (`bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, 441,961 properties / 15,025 permits), **When** `DATA_MANIFEST_CID` is set to that CID and the sync runs, **Then** the CRM and agent read property/permit data directly from Task A's published manifest and parts by CID (constitution B1, `docs/architecture-constitution.md` §7), and every index row and answer carries that `manifestCid`. ☐ testable
8. **AC-8 (prototype re-audit)** · **Given** `design/design-review-log.md`'s 25 prior issues are already marked Incorporated, **When** `audino` (already named as a B-09 reviewer in AGENT-MAP.md §5, brought forward to also run as a read-only design-time consult alongside `smeargle`'s Phase B responsive plan — not a new agent assignment) re-diffs every existing screen (CrmMap, FilterSheet, PropertyDetail, ContractorBadge, ResultsPanel, LeadsList, LeadDetail, AppShell/NavRail, plus the new B-09 Ask screens) against the current `design/prototype/` prototype (corrected path — `design/screens/` doesn't exist in this repo; see `specs/009-agent-hardening/agent-design.md` correction #2), **Then** every newly found mismatch (spacing, tokens, copy, missing states) is logged and fixed, or explicitly deferred with a reason. ☐ testable

## Edge cases

- The model call exceeds the 23 s server-side abort → the rep sees a typed "took too long" state, never an unhandled 500.
- A place-resolution score below 0.80 → `not_found` (refuse, offer to rephrase); a score of 0.80–0.92, or two top candidates within 0.05 of each other → `needs_clarification` (ask, with the top 3 as options) instead of guessing a center point. (ADR-06 bands, `docs/architecture-constitution.md`; corrected from an earlier looser "below 0.80 → clarify" wording — see `specs/009-agent-hardening/agent-design.md` correction #1.)

## Requirements

| REQ | Requirement | Traces to |
| --- | --- | --- |
| FR-001 | System MUST answer plain-language opportunity questions with cited, real records, through Zod tools over the B-02 index | AC-1 |
| FR-002 | System MUST create a lead only through the existing `leads.create` procedure, never directly from the model | AC-2 |
| FR-003 | System MUST state an honest empty/invalid-scope answer rather than fabricate results | AC-3 |
| FR-004 | System MUST pass all 7 golden queries with p95 < 20 s and 100% citation groundedness | AC-4 |
| FR-005 | System MUST pass the `smeargle` suite at 390/768/1440 on every screen | AC-5 |
| FR-006 | System MUST alarm and self-resolve on DLQ depth, visible on a CloudWatch dashboard | AC-6 |
| NFR-001 | Agent: ≤ 3 model calls per ask, 5 asks/min/user, $3/day cap, server abort at 23 s | ARD-B §10 |
| FR-007 | System MUST read property/permit data directly from Task A's published Run 2 manifest and its parts, by CID | AC-7 |
| FR-008 | System MUST re-diff every existing and new screen against the prototype and fix or explicitly defer every mismatch found | AC-8 |

No `[NEEDS CLARIFICATION]` remaining.

## Prototype reference

| Element | Value |
| --- | --- |
| Claude Design screen | `design/prototype/CrmAsk390.dc.html` / `CrmAsk1440.dc.html`, `CrmAskNoResults390.dc.html`, `CrmAskLowConf390.dc.html`, `CrmAskConfirm390.dc.html` / `CrmAskConfirm1440.dc.html`, `CrmAskThrottled390.dc.html` (also see `CrmAskNotFound390`, `CrmAskOutside390`, `CrmAskPaused390`, `CrmAskSlow390`, `CrmAskStates` — path corrected from a stale `design/screens/` reference, see `specs/009-agent-hardening/agent-design.md` correction #2) |
| States covered | working/answer-with-citations/no-results/low-confidence/throttled/paused; create-lead confirmation |
| Design system | `../assessment-guide/design-system/` (Atlas, Material 3, mobile-first) |

## Demo Script

1. Presenter: "Ask the agent: open roofing permits older than five years within five miles of Pflugerville." → Expected: grounded, cited answer; results open on the map.
2. Presenter: "Create a lead from that answer." → Expected: lead appears in the lead list.
3. Presenter: "Here's the same app on a phone." → Expected: full layout works at 390 px; a CloudWatch dashboard/alarm is shown in a 30-second architecture tour.

## Out of scope

- Vector/semantic search over permit or contractor text (no embeddings in v1, ARD-08).
- Paging the on-call engineer through PagerDuty (accepted deviation, SNS email instead — ARD-B §13). SNS subscriber: `eng.heba.gaber@gmail.com`.
- Any new lead-store behavior beyond what B-07 already built.
- Atlas registration or an MCP name lookup for the data: the CRM reads Task A's published data directly by CID (constitution B1), so neither is needed.
- A full ground-up prototype rebuild (that already happened in B-03); this round is a targeted re-diff of drift since then (AC-8).
- **Deferred:** Following Task A's incremental runs (Run 3 onward). Task A publishes only the data groups that changed in a later run and links each manifest to the one before (`previousManifestCid`); the sync reads one manifest, so a delta-only run is held by Validate's row-drop check and the CRM stays on the last good run. Chain-following (and reusing parts already downloaded, keyed by part CID) is deferred by the PO until Tasks A and B are complete, to ship as a post-release update alongside the "coming soon" sections. It cannot be tested before Task A publishes a real incremental run.

## Release (moved out of this story)

**PO decision, 2026-10-25:** this story closes and merges on Task A's Run 2. The release steps R1 to R7 (PLAYBOOK-B Part 4), the handling of Task A's Run 3 and the other follow-up work are **not** part of B-09; they are listed with their steps in [`docs/pending-items.md`](../docs/pending-items.md) for the follow-up branch. This story still includes its own `/simplify` and `/code-review medium` rounds, the five reviewer scores (`docs/reviews/CR-B-09.md`), the hosted proof and a non-recorded demo rehearsal on the branch preview.

## Evidence to capture

- `docs/evidence/B-09.md` (§ B-11 for the hardening part): golden-query results, citation audit, screenshots at 3 breakpoints, CloudWatch dashboard screenshot, trace id.
- `testplans/B-09-test-cases.md` results, `docs/reviews/CR-B-09.md`.

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
| G4-8 | Dependencies done, or stubbed with real sample data (A-13/A-14 deviation documented, see G4 report) | ☑ |
| G4-9 | No `[NEEDS CLARIFICATION]` left | ☑ |
| G4-10 | AI pre-check (`developmentsupport-g4-precheck`): PASS | ☑ |

**Decision:** ☑ Ready ☐ Returned, reason: {…} · 2026-10-24

## Gate G7: Validated build

| # | Criterion | Status |
| --- | --- | --- |
| C-01 | Every task in `tasks.md` is done | ☑ (all but TZ07, which runs only after the merge) |
| C-02 | Unit and integration tests pass; coverage of new code at least 80 % | ☑ (1,743 passed; `docs/reports/UT-B-09.md`) |
| C-03 | Code review: every reviewer at least 75, no open Critical | ☑ (alakazam 84, ash 87, metagross 88, audino 82, porygon 84; `/code-review medium` on the final head: 8 follow-ups, none Critical; `docs/reviews/CR-B-09.md`) |
| C-04 | Test cases pass on the hosted URL | ☑ with PO exception (24 of 33 pass, none fail, 9 deferred or not proven; `docs/reports/TR-B-09.md`) |
| C-05 | Every defect closed | ☑ (ERR-21 closed; GAP-1 to GAP-5 documented) |
| C-06 | No open Critical defect | ☑ |
| C-07 | Evidence complete | ☑ (`docs/evidence/B-09.md`; only one B-09 screenshot, noted in the pre-check) |
| C-08 | Traceability and kit usage complete | ☑ |
| C-09 | Commits start with the story ID; no secrets | ☑ (four commits carry finding numbers with a hash sign, which cannot be undone) |
| C-10 | Story status Done after approval | ☑ |

**Decision:** ☑ Approved with exceptions ☐ Returned · HebaGaber (PO) · 2026-10-25

**Exceptions granted by the PO:** the 9 deferred or not-proven test cases in `docs/reports/TR-B-09.md` (TC-002, TC-017, TC-019b, TC-024, TC-NF-01 as specified, and the design sign-offs TC-021, TC-022, TC-023, TC-023b); the eight `/code-review medium` follow-ups in `docs/reviews/CR-B-09.md`; Run 3 handling and release steps R1 to R7, which move to the follow-up branch (`docs/pending-items.md`).

