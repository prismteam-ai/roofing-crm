---
gate: G4
artifact: stories/B-01-crm-shell.md
artifact_version: "status Draft, created 2026-10-23"
run_date: 2026-10-23
tool: Claude
verdict: FAIL
---

# G4 pre-check: B-01 Open the CRM shell and show the roadmap sections

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Front matter | PASS | All fields filled. agents (metagross / metagross / metagross, audino / Playwright check) and skills match AGENT-MAP.md line 368. |
| C-02 | User story form | PASS | "As a sales rep / I want / So that" present; independent test present. |
| C-03 | GWT | PASS | AC-1 to AC-5 are all Given / When / Then. |
| C-04 | Observable and real | PASS | ACs are on the hosted URL and use real Travis County coordinates. Note: AC-2's X-Ray check is a backend trace, not a listed UI/agent/MCP/CID surface. |
| C-05 | Scale + error | PASS | Scale: AC-2. Error: AC-3. |
| C-06 | Testable | FAIL | AC-2 "across the whole of Travis County" has no bounds, so two testers could judge pan/zoom differently. AC-3 does not state the lockout threshold (three failures, or on the fourth?) or the duration {n}. Fix: add the bounding box or zoom limits and the lockout rule. Adding these values changes meaning, so it needs your decision. |
| C-07 | Edge cases | PASS | Three edge cases listed. |
| C-08 | Requirements traced | FAIL | NFR-001 and NFR-002 trace to "ARD-B §10", not to any AC. NFR-001 has no numeric threshold. Fix: add a trace to AC-2 (X-Ray, 3 s) or a new AC for the smeargle check at 390 / 768 / 1440 px. |
| C-09 | Prototype | PASS | Screens exist in design/prototype/ and the listed states are present. Wording fix: links use ".html", but the files are ".dc.html". |
| C-10 | Ready | FAIL | docs/progress.md lists 0 stories and no A-03 or A-13 entry, so the dependencies cannot be checked there. Fix: cite the Task A evidence (commit or CID) for A-03 and A-13 in depends_on. No [NEEDS CLARIFICATION] found. |
| C-11 | Slicing | PASS | One primary eval point (B1), secondary B6. 1.5 days, at the upper limit. Vertical. |

**Verdict: FAIL (3 FAILs: C-06, C-08, C-10).**

## Fix list (by impact on score)

1. C-08: trace NFR-001 and NFR-002 to an AC, and give NFR-001 a numeric threshold.
2. C-06: state the AC-2 bounds and the AC-3 lockout threshold and duration (decision needed).
3. C-10: add Task A evidence for A-03 and A-13 to depends_on.
4. Wording only: change the prototype links from ".html" to ".dc.html".

Not approved. The user records the decision.
