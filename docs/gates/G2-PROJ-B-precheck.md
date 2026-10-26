---
gate: G2
artifact: docs/plan.md
artifact_version: 0.1
run_date: 2026-10-21
tool: Claude
verdict: PASS
---

# G2 pre-check: PROJ-B (Roofing CRM high-level plan)

Inputs read: `docs/plan.md` v0.1, `docs/feature-list.md` v0.2 (G1 decision not recorded yet), `docs/01-intent.md` (VIS-B v0.2, approved), `.specify/memory/constitution.md`. The pre-check reports gaps only and never approves.

**Verdict: PASS (9 of 9 checks).** Two notes below; neither is a failure.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Artifact type | PASS | `classification: Project`; a phased plan (PROJ-B) is the right artifact. |
| C-02 | Scope | PASS | S-01…S-06 and OS-01…OS-04 are populated. They match FL-B § 2 and the Won't rows B13…B15; each in-scope item names its phase. |
| C-03 | Dependencies | PASS | Inter-phase DEP-01…03; external EXT-01…10 (Task A A-02, A-03, A-11, A-13, A-14, A-18, AWS, Bedrock, domain, index service); organisational ORG-01…03. |
| C-04 | Constraints | PASS | CON-01 technical, CON-02 budget, CON-03 timeline, CON-04 resourcing, CON-05 access. |
| C-05 | Risks mitigated | PASS | RISK-01…11 each have a concrete mitigation and an owner, including the seeded risks: Task A delay (01), index cost or availability on the free plan (03), source 403 / BBB (05), gateway-style throttling for Bedrock (09). |
| C-06 | Success criteria traced | PASS | SC-01…07 are measurable (p95 < 3 s, count change, 100% of drawer views, duplicate refused, G1–G7 pass, count equality) and each quotes VIS-B § 8 text. |
| C-07 | Coverage | PASS | All 11 Musts (B01…B11) appear in exactly one phase with one branch (§ 8.x, § 11). B12 (Could) is optional in Phase 3; B13…B15 (Won't) are deliberately unphased. |
| C-08 | Walking skeleton first | PASS | Phase 0 (Days 4–5) ships B-01 to the hosted URL, matching the playbook's "B-01 on day 4". It also ships a real data slice: B-02 indexes A-03's published Austin permits, and the exit criterion checks the hosted API's `sourceManifestCid` and count. |
| C-09 | No placeholders | PASS | No unfilled `{…}` values or TBDs. `stories/{ID}.md` on line 25 is the file-naming pattern, not a missing value. Unknowns (G1 decision, domain, index technology and availability, Task A dates) are Q-01…Q-05 in § 13. |

## Notes (not failures)

1. **The real data slice is visible through the API, not on the map.** In Phase 0 the hosted app proves the index through an API response, while the map shows data only from Phase 1. If you want the evaluator to see real records on day 5, add "the map shows the indexed records as points" to B-02's or B-01's exit criteria. This adds a little scope.
2. **G1 is not approved yet (Q-01).** The plan builds on FL-B v0.2. Approve G1 before G2, so the gates are recorded in order (constitution XVIII).

## Fix list (by impact on the assessment score)

1. Record the G1 decision, then G2 (gate order).
2. Get Task A finish dates for A-03, A-11, A-13, A-14 and A-18 (Q-05). Without them, RISK-02 (deadline) can't be judged; if they're late, raise the timeline with the assessor.
3. Optional: make the Phase 0 data slice visible on the map (note 1).

When you record the G2 decision, tick the G2 checklist in `docs/plan.md`, add your decision and date, and add the G2 row to the gate log in `docs/traceability.md`.
