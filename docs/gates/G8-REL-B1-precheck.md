---
gate: G8
artifact: docs/release.md
artifact_version: REL-B1 v1.0 (Draft)
run_date: 2026-10-26
tool: Claude
verdict: FAIL
---

# G8 pre-check: REL-B1 (Roofing CRM, Travis County TX)

The pre-check finds gaps and never approves. `docs/progress.md` was regenerated with `scripts/progress.sh` first.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Scope passed G7 | PASS | All five stories (B-01, B-02, B-03, B-07, B-09) have a G7 pre-check in `docs/gates/` and a `--no-ff` merge commit on `feature/roofing-crm` (`fcd6d6a`, `d01c06e`, `80873e1`, `8b13240`, `ab6f520`). B-07 and B-09 passed with PO-approved exceptions, listed in `docs/release.md` section 1 |
| C-02 | Progress consistent | PASS | `docs/progress.md` regenerated; it shows no status or merge mismatch |
| C-03 | CI green | PASS (re-check on the final head) | The full CI run on the last code commit `00437dc` (the commit the live site serves) is green: secret scan, workspace checks and the hosted Playwright suite at 390, 768 and 1440 px, including the seven new rendered responsive specs. Commits after it are documentation only; confirm green again on the final head before the tag |
| C-04 | Runtime | FAIL | The hosted URL is recorded and two independent evaluator runs opened it in fresh browser contexts, but `docs/release.md` section 6 still has the private-window login by the PO unticked (G8-04) |
| C-05 | Rollback | FAIL | Documented (`docs/runbook.md`, `scripts/sync-ops.sh rollback`), but tested only in part: the dry run named both CIDs and verified the previous index files; the pointer flip itself has not been executed on the live app. `docs/release.md` section 4 says so honestly, so it is not "marked tested" |
| C-06 | Release notes | PASS | What's new, known issues and excluded items are complete and state the real gaps (no BBB scores, contractors unverified, nine B-09 exception test cases, golden suite not re-run after the last prompt example) |
| C-07 | Assessment gates | PASS (verify playback) | PR 15 present and open, hosted URL present, credentials channel stated, and the demo video is linked (https://www.youtube.com/watch?v=Iq4KyMsz6mc). YouTube reported the video as still processing when it was linked; confirm it plays without signing in before submitting |
| C-08 | Traceability | FAIL | Every README row in `docs/traceability.md` names evidence, but the **Demo time** column is empty for every row: it can only be filled from the recorded video |
| C-09 | Secrets | PASS | `gitleaks` green in CI; the password is only in Secrets Manager and was never printed or written to a file in this round; the PR body carries no credentials |
| C-10 | Final review | FAIL | `/code-review ultra` has not been run (the PO types it) |

**Verdict: FAIL (4 of 10 checks fail).** All four wait on the PO (private-window login, `/code-review ultra`, rollback test) or on the video's traceability times.

## Fix list, ordered by impact on the assessment score

1. **Done: the demo video is linked** (https://www.youtube.com/watch?v=Iq4KyMsz6mc). Confirm it plays in a private window once YouTube finishes processing it (C-07).
2. **Fill the Demo time column in `docs/traceability.md`** from the video (C-08), and put the link in the "Demo video" row of `docs/pr-body.md` and in the PR.
3. **Re-confirm CI is green on the final head** (C-03) before tagging `rel-B1`.
4. **PO: log in at https://crm.aldarraj.com in a private window with the test user, reload, and tick G8-04** (C-04). Share the credentials privately and tick G8-08.
5. **Run `/code-review ultra` once** (C-10) and fix any Critical it reports before the video.
6. **Optional: run the rollback once on the live app** (C-05): `scripts/sync-ops.sh rollback --yes` and then back again, to move "documented" to "tested". It briefly serves Run 3, so do it outside demo time.

After the fixes, tick the checklist in `docs/release.md`, record the decision and date, set the status to Approved, add a row to the gate log in `docs/traceability.md`, then `git tag rel-B1 && git push origin rel-B1`.
