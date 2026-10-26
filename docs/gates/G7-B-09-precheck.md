---
gate: G7
artifact: docs/evidence/B-09.md
artifact_version: 731b481 plus documentation commits (branch 009-agent-hardening; tested build web 7d483df, API cbb548e)
run_date: 2026-10-25
tool: Claude
verdict: FAIL
---

# Gate G7 pre-check: B-09 Agent and hardening (parts B-09 and B-11)

This is an AI pre-check. It reports gaps only. It does not approve the gate; the PO records the decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Tasks done | PASS (one expected open item) | `specs/009-agent-hardening/tasks.md`: every task is checked except TZ07 (`bash scripts/progress.sh`). TZ07 says in its own text that it runs only after the PO approves G7 and the branch is merged with `--no-ff` (constitution XX). It cannot be ticked before the merge. Phase 9 (convergence) tasks T061 to T063 are ticked with evidence. |
| C-02 | Unit tests | PASS | `docs/reports/UT-B-09.md` attached: 179 test files, 1,743 tests passed, 0 failed (20 skipped are opt-in performance cases and inherited ones). CI `workspace` job green on `731b481` (run 40167849532). Coverage of new code is above 80 percent: `apps/api` 95.8 percent lines, `apps/web` 93.1 percent lines; `leadService.ts` is the lowest at 86.7 percent lines (its two uncovered lines are the test-only override). |
| C-03 | Code review | PASS (with caveat) | `docs/reviews/CR-B-09.md`: final scores alakazam 84, ash 87, metagross 88, audino 82, porygon 84, all 75 or more. Zero open Critical. Both Majors from the final round were fixed (`71b6e8a`, `cbb548e`). Caveat: `/code-review medium` last ran at `a769cc4` (10 findings, all fixed); it was not re-run on the final head, which changed a great deal since (Ask in the map, SQL search, Run 2, the day's fixes). The plan names it for the final round. |
| C-04 | TC executed on hosted URL | **FAIL** | Every executed TC has a hosted URL and a build sha; none ran on localhost. `docs/reports/TR-B-09.md`: 33 TCs, 24 pass, 0 fail, 9 deferred or not proven: TC-002 (Open on map, no hosted test), TC-017 (throttled and paused states at three widths), TC-019b, TC-024 (timeout state in the browser), TC-NF-01 as specified (39 asks times 3 repeats; repeats were 1), TC-021, TC-022, TC-023, TC-023b (design sign-offs waiting for the QC Lead and `audino`). Many passes are at API or unit level only, and the report says so row by row. These need an explicit PO exception, or a run before G7. |
| C-05 | Defects closed | PASS | B-09 has no numbered ERR list except ERR-21 (sign-in lockout counter), now Closed with a hosted re-test (`docs/defects/ERR-21.md`). Live-stack defects found in the closing round are listed with fix commits in `TR-B-09.md` (lead repo missing from the Lambda context `86029e9`, Undo failing on the real table because `sequence` is a DynamoDB reserved word `7b925eb`, FetchPart `DataLimitExceeded` `98960b6`, search out of memory `a502aa3`). GAP-1 to GAP-5 are documented, gap-linked cases. |
| C-06 | No open Critical | PASS | No Critical defect is open. `CR-B-09.md` reports 0 open Critical. |
| C-07 | Evidence | PASS | `docs/evidence/B-09.md` has the hosted URL, observed counts (441,961 properties, 15,025 permits, golden passes 1 to 6, CI 152 and 80 passed), one screenshot (`B-09-T057-dlq-alarm.png`) and X-Ray trace ids (added 2026-10-25). Weak point: only one B-09 screenshot exists; the UI evidence is mostly the Playwright suite and the board-match records. |
| C-08 | Traceability | PASS | `docs/traceability.md` rows AC-9, R-4 and D-7 are filled with FR refs, test cases and evidence. `docs/kit-usage.md` has B-09 and B-11 rows and five reviewer score rows. One fact is flagged "not recorded" in kit-usage (general-purpose subagent fix rounds). |
| C-09 | Commits and secrets | PASS (with caveat) | All 105 commits (including the one that adds this report) in `feature/roofing-crm..009-agent-hardening` start with `B-0` (B-09 and the earlier parts). A pattern scan of the diff found no AWS key, private key or token. CI gitleaks job passed on `731b481`. Caveat: four review-fix commits (`56222d5`, `d81b380`, `84a23be`, `d78de40`) contain finding numbers written with a hash sign, which GitHub links to other candidates' pull requests in the upstream repository. This cannot be undone; the rule is now in `CLAUDE.md` and memory. |
| C-10 | Story status | PASS | `stories/B-09-agent-hardening.md` front matter is complete. `status: Ready` stays until the PO approves G7 and merges. This is the expected open item. |

## Verdict

**FAIL.** 1 FAIL (C-04). C-04 fails on the deferred and not-proven test cases listed above. Everything else passes, with caveats on C-03 and C-09.

## Fix list (ordered by impact on the assessment score)

1. **C-04, PO exception.** The PO must either record an explicit exception for TC-002, TC-017, TC-019b, TC-024, TC-NF-01 as specified, and the design sign-offs TC-021, TC-022, TC-023, TC-023b, or have them run before merge. This pre-check cannot grant it. Cheapest to close first: TC-NF-01 with 3 repeats (about 60 cents of Bedrock) and TC-002 / TC-017 as hosted Playwright cases.
2. **C-03, `/code-review medium` on the final head.** Run it once and fix what it finds in one round (the plan's final-round rule), or record in the gate decision that the five kit reviewers' final scores stand in for it.
3. **C-07, UI screenshots.** Add screenshots of the three-pane map, the Ask answer with numbered pins, the Matches tab, the bulk Undo row and the phone Filters sheet to `docs/evidence/img/` (the Playwright suite already visits these states).
4. **C-04 and G3 product question.** G3 ("open permits over 5 years near Manor") passes as an honest empty because Manor has no open permit, only a stalled one. The PO decides whether "open" should include stalled permits.
5. **Process notes for the PO to accept.** ERR-21 is a B-01 defect closed here. The four commits with hash-sign finding numbers stay in history. Lead-create latency (B-07-TC-NF-01) passes but sits close to its 2,000 ms limit and swings by about half a second between CI runs. Release steps R1 to R7 and Run 3 handling are moved out of this story (`docs/pending-items.md`).

Nothing was deployed or run against Bedrock. AWS calls in this pre-check were read-only (X-Ray). Only this report and the evidence, defect and report updates listed above were written.
