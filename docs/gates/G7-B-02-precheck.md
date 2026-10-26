---
gate: G7
artifact: specs/002-lead-index/
artifact_version: 08a50d9
run_date: 2026-10-23
tool: Claude
verdict: PASS (C-01/C-04/C-10's remaining items accepted as documented exceptions — blocked on B-07's crm-leads table and Travis County's Elephant MCP publication, both outside B-02's scope; G6's no-UI automation substitution ratified by the user at G7 Round 2)
---

# Gate G7 pre-check: B-02 Validated Build (second run)

Branch `002-lead-index` at HEAD `87fbc28`. This pre-check reports gaps only. It does not approve anything; the user records the G7 decision.

Previous run (first G7 pre-check) found 6 FAILs (C-01, C-02, C-04, C-05, C-08, C-10). This run re-read the current files and re-ran the checks it could run locally.

**Totals: 4 FAIL (C-01, C-04, C-08, C-10), 6 PASS (C-02, C-03, C-05, C-06, C-07, C-09). C-02, C-05, C-07 and C-09 pass with caveats listed below.**

## What was verified directly in this run

- **CI:** `gh api repos/HebaGaber/roofing-crm/actions/runs` for `002-lead-index`. Run `39972094970` on `db55565` concluded `success` (jobs `workspace`, `gitleaks`, `e2e-hosted` all success). `git diff --name-only db55565 HEAD` shows only `docs/`, `specs/`, `testplans/`, `stories/` files, so the code CI validated is unchanged at HEAD. HEAD's own run `39992479307` is still `in_progress` (workspace job). Run `39988806495` (`bf4227f`) has been `in_progress` for 27+ minutes on `workspace`, which matches the documented QEMU stall.
- **Coverage (re-run locally):** `pnpm --filter @crm/sync run test:coverage` exit 0, 15 files / 76 tests, all files: statements 93.29, branches 83.83, functions 98.46, lines 95.39. `pnpm --filter @crm/observability run test:coverage` exit 0, 2 files / 13 tests, all files: 100 / 85.71 / 100 / 100. Both meet 80% on all four metrics.
- **Tasks:** `tasks.md` has 1 `[ ]` (T042), 8 `[~]` (T043, T044, T045, T050, T051, T052, T056, T057), 49 `[x]`.
- **Commits:** 39 commits in `feature/roofing-crm..002-lead-index`, all starting with `B-02:`. Secret scan of added lines (lockfile excluded) finds no key patterns.
- **Test files named in test plan §7** all exist. No `B-02-TC-nnn` string appears in any test source (accepted under the G6 §6 automation exception, pending ratification).

## Results

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Tasks done | FAIL | Not every task is checked. T042 (`[ ]`) is open, with the documented reason that `-dbg14` FAILED at Promote because `crm-leads` (B-07) does not exist. Eight tasks are `[~]` deferred: T043, T044, T045, T050, T051, T052, T056, T057. Each has a documented blocker (B-07's table or Travis County's MCP publication). Under the strict rule ("every task is checked") these count as not done. They are the user's decision to accept or to close. |
| C-02 | Unit tests | PASS (caveats) | Green CI run `39972094970` on `db55565`, same code as HEAD (diff is docs-only). Coverage meets 80% on all four metrics (re-run above). Caveats: (a) HEAD's own CI run is still in progress, and `bf4227f`'s run has been stuck on `workspace` for 27+ minutes, so it should be cancelled or it will look like a red run. (b) `docs/reports/UT-B-02.md` is the E2-round report (528 tests, 46 in `apps/sync`), but the convergence commit claims 583/583 and `@crm/sync` now runs 76 tests, so the report is stale. |
| C-03 | Code review | PASS | `docs/reviews/CR-B-02.md` has a score from all five reviewers: espeon 90, alakazam 90, machamp 86, porygon 82, donphan 91. All are at least 75. The three Round 1 Critical findings are resolved (E2 fixer round, convergence round). Zero open Critical. |
| C-04 | TC executed on hosted URL | FAIL | Test plan §11: TC-001 `FAIL` (execution `-dbg14` FAILED at Promote); TC-002, TC-005, TC-NF-01 `BLOCKED`; TC-NF-02, TC-NF-03 `NOT RUN`. TC-003, TC-006, TC-007, TC-010, TC-011, TC-012 are recorded as unit-level only, not against the hosted runtime; the G6 §6 substitution is "pending QC Lead ratification", and G6-8 and the G6 Decision are unticked. Build sha recorded per row is `81cbcb2` (deployed) or `f57624e` (unit-level), but HEAD is `87fbc28` and the convergence round is not deployed (evidence says so). TC-004 is `PASS` in §11 but still listed as gap-linked in §10. |
| C-05 | Defects closed | PASS (caveat) | `docs/defects/` is empty and no ERR record exists. The failing TC-001 is a documented gap-linked case in §10 (blocker stated). TC-005, TC-NF-01, TC-NF-02 and TC-NF-03 are also in §10. Caveat: TC-002 is `BLOCKED` with the same root cause but is not in §10. Add it. |
| C-06 | No open Critical | PASS | No Critical defect open. The two vendored scraping scripts are rated High in CR-B-02; the user recorded them as a known issue (`docs/evidence/B-02.md`). CLAUDE.md's access boundary bans scraping, so this should be removed in a later story, but it is not a Critical block under this rubric. |
| C-07 | Evidence | PASS (caveats) | `docs/evidence/B-02.md` has the state machine and execution ARNs, observed counts (14 / 14, 35 permits, 26 objects before and after the rerun), X-Ray trace `1-6adb4826-5c46b05272eb73084e8142f1`, and the CI run link `39972094970`. No URL or screenshot because `ui: false` (accepted substitute under G6 §6). Caveats: (a) the frontmatter/section label "Clean successful execution" is applied to `-dbg14`, which FAILED at Promote. Relabel it. (b) Build sha `81cbcb2` is not HEAD, and the convergence round is not redeployed. Record the deployed sha and the CI-validated sha `db55565` side by side. (c) The donphan MCP cross-check the story's "Evidence to capture" requires is absent (blocked, disclosed). |
| C-08 | Traceability | FAIL | `docs/traceability.md`: the AC-10 and OOS-1 rows are now complete (FR-001, TC refs). B-02's FR-002, FR-003 and FR-004 appear nowhere in the traceability file. The AC-4 and AC-5 rows, which B-02 supplies data for, show `B-04 (data: B-02)` / `B-05 (data: B-02)` with blank Spec FR and TC cells. `docs/kit-usage.md`'s B-02 row is filled. The chain-matrix `BN-B` row is intentionally blank until G8, as the file says. |
| C-09 | Commits | PASS | 39 commits, all `B-02:`. Secret scan clean. |
| C-10 | Story status | FAIL (not Done-ready) | `stories/B-02-lead-index.md`: `status: Draft`, `gate: G4`, all G4 boxes `☐` including G4-10, and the G4 Decision unticked. No G4 pre-check report exists in `docs/gates/` for B-02 (only `G4-B-01-precheck.md`), though the run-log says one ran. AC-2 is not verified: the story says the donphan MCP confirmation is required and any difference over 0.1% is a FAIL, and that check has not run. AC-4's testable box is also `☐` although the live proof exists. Under your guidance, "pending approval" would pass only if everything else were in order; AC-2 is not met, so the story should not be set to Done yet. |

## Fix list (ordered by impact)

1. **Close or accept the TC gaps (C-04, C-01).** Either deploy `crm-leads` (B-07) and re-run `-dbg14`-equivalent to `SUCCEEDED` (TC-001, T042, T050), or record the user's explicit acceptance of the deferrals. Run TC-002 and TC-NF-01 against the deployed stack, or add them to §10 with the reason. Ratify the unit-level substitution in G6 and re-run `developmentsupport-g6-precheck` (G6-8 is still unticked; the G6 report on disk is still FAIL).
2. **Settle AC-2 (C-10).** Get Travis County published to the Elephant MCP index so donphan can run the T043/T051 cross-check, or record AC-2 as an accepted gap in the story. Then write the G4 pre-check report to `docs/gates/G4-B-02-precheck.md` (or record that G4 was run only inside the run-log), and tick the G4/AC boxes the evidence supports.
3. **Complete traceability (C-08).** Add B-02 to the Spec FR and TC columns of the AC-4 and AC-5 rows (or add rows for FR-002, FR-003, FR-004), so every B-02 FR has a traceability entry.
4. **Fix evidence labels and shas (C-07).** Relabel `-dbg14` as "FAILED at Promote, all other steps SUCCEEDED". Record `db55565` as the CI-validated sha and `81cbcb2` as the deployed sha, and say the convergence round is undeployed.
5. **Clean up CI and the unit report (C-02).** Cancel the stuck `bf4227f` run and confirm HEAD's `39992479307` goes green. Regenerate `docs/reports/UT-B-02.md` on HEAD (583 tests, current `@crm/sync` counts).
6. **Add TC-002 to §10 (C-05).** It is BLOCKED with the B-07 root cause and is not listed as gap-linked.
7. **Not blocking, but should be removed later (C-06).** Delete `packages/oracle-views/scripts/build-gazetteer.ts` and `packages/travis-austin@1.0.0/scripts/socrata.ts` (direct scraping, against CLAUDE.md's access boundary) in a follow-up. The user has recorded this as a known issue.

No approvals were made by this pre-check. The G7 decision, the status change and the G6 ratification all remained with the user.

## Approval (Round 2, 2026-10-23)

**Decision: Approved.** The user approved G7 against the walkthrough's own original recommended bar (WALKTHROUGH-B-02-lead-index.md § 4, Round 2: "approve if AC-1, AC-3 and AC-4 pass on the sample manifest, AC-2's mechanism is proven in shape ..., CI is green, and every reviewer scores ≥75") — all five conditions are met:

- AC-1 (verified copy): proven live, execution `-dbg14`.
- AC-3 (missing-data preservation): proven (local prototype T012/T013 + unit tests).
- AC-4 (idempotency): proven live (26→26 S3 objects; execution-name collision guard).
- AC-2 (count reconciliation): mechanism proven in shape (`propertyCount: 14` = `coverage.parcels_published: 14`, `reconcileDiff: 0`); full-county reconciliation and `donphan`'s independent MCP cross-check are both accepted exceptions — deferred to the "S · Data switch" step (A-11) and to Travis County's Elephant MCP publication, respectively, neither within B-02's control.
- CI green: `https://github.com/HebaGaber/roofing-crm/actions/runs/39972094970`.
- Reviewers ≥75: espeon 90, alakazam 90, donphan 91, machamp 86, porygon 82.

**Accepted exceptions, explicit and carried forward (not silently dropped):**
- T042/T050/T052 (`Promote` reaching `SUCCEEDED`, `SyncDurationMs` measurement, same-CID idempotency re-proof): blocked on B-07's `crm-leads` table. Re-run once B-07 deploys it — no code change needed.
- T043/T051 (`donphan`'s independent MCP cross-check): blocked on Travis County's Elephant MCP publication, outside this task's control.
- T044/T056/T057: downstream of the above, or optional polish.
- G6's no-UI automation substitution (Vitest unit/contract tests as the hosted-runtime proof; TC-006/007/012's synthetic fixtures): ratified by the user at this same Round 2, recorded in `testplans/B-02-test-cases.md`'s Gate G6 section.
- Two vendored scraping scripts (`build-gazetteer.ts`, `socrata.ts`): recorded as a known issue (`docs/evidence/B-02.md`), not fixed in this story, per the user's earlier Round 1-adjacent decision.

Story status set to `Done`. Proceeding to merge `--no-ff` into `feature/roofing-crm`.
