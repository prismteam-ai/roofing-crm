---
gate: G4
artifact: stories/B-03-map-search.md
artifact_version: "pre-fix: created 2026-10-23, status Draft"
run_date: 2026-10-23
tool: Claude (Haiku subagent)
verdict: FAIL (pre-fix); fixes applied below
---

# G4 pre-check: B-03 Search a radius for aged roofs and open permits, with full detail

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| G4-1 / C-01 | Front matter | PASS | Agents and skills match AGENT-MAP §5 row B-03. |
| G4-2 / C-02 | User story + independent test | PASS | |
| G4-3 / C-03 | GWT | PASS | Testable boxes (☐ per AC) stay unticked until G7 proof, per the B-01/B-02 convention. |
| G4-4 / C-05 | Scale + missing-data AC | PASS | AC-4 (scale), AC-7 (missing-data). |
| G4-5 / C-07 | Edge cases | PASS | 2 (zero-result radius, GPS outside Travis County). |
| G4-6 / C-08 | Traceability | FAIL | NFR-001 traced only to ARD-B §10, with no AC. **Fixed:** now also traces to AC-1, AC-4. |
| G4-7 / C-09 | Prototype | FAIL | Every linked path was wrong: `design/screens/` does not exist; real files are `design/prototype/*.dc.html`. **Fixed:** replaced with the 8 real files, verified to exist on disk. |
| G4-8 / C-10 | Dependencies | UNVERIFIED → flagged for Round 1 | B-02 merged (`d01c06e`) — PASS. Task A A-13: not `status: Done` in Task A's own feature-branch story file (still `Draft` there); it is G7-approved with evidence complete (`ORACLE` commit `1ad7123`), but its merge is deliberately held pending A-11's merge order (PO decision in that repo, not a defect). Its components are reachable read-only via the `ORACLE-u` worktree, exactly as this story's reuse table already anticipates. Recorded in the story's G4 table for Round 1 confirmation rather than treated as a silent pass or a hard block. |
| G4-9 | No `[NEEDS CLARIFICATION]` | PASS | |
| G4-10 / C-04, C-06 | AI pre-check / AC-4 vagueness | FAIL | AC-4's "several hundred to a smaller number" was not a falsifiable count. **Fixed:** "the count at 25 must be lower than the count at 15, and each count must equal the full-index query result for the same inputs." |
| C-11 | Slicing | PASS | 1.5 days, one primary eval point (B1), vertical slice across 4 merged parts. |

## Fix list (wording only, AC meaning unchanged) — all applied

1. Prototype reference → the 8 real `design/prototype/*.dc.html` paths.
2. NFR-001 "Traces to" → `ARD-B §10; AC-1, AC-4 (timed in Playwright)`.
3. AC-4 → falsifiable count wording (see above).

**Verdict after fixes: PASS, 10 of 10**, with G4-8's A-13 dependency wording carried to Round 1 for the user's confirmation (not a wording change — a decision on how to proceed, consistent with § 6 of the walkthrough).

Not approved here. The user records the Decision line.
