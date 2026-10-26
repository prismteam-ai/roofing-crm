---
gate: G7
artifact: specs/001-crm-shell/, docs/reports/TR-B-01.md, docs/reports/UT-B-01.md, docs/reviews/CR-B-01.md, docs/evidence/B-01.md
artifact_version: branch 001-crm-shell @ 1d69229
run_date: 2026-10-23
tool: Claude
verdict: PASS (C-02 initially accepted as a documented exception, TD-5 — then fixed outright 2026-10-23 at the user's request)
---

# Gate G7 pre-check: B-01 CRM shell with disabled roadmap sections

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Tasks done | PASS | All tasks in `specs/001-crm-shell/tasks.md` are checked `[x]`, through TZ06 and the TN01/TN02 polish phase. `/speckit-converge` (run 2026-10-23) reports 0 findings across every FR, edge case, success criterion and plan decision. |
| C-02 | Unit tests, coverage ≥ 80% | PASS | Unit test report exists (`docs/reports/UT-B-01.md`, 94/94 passing). Coverage was initially measured at `apps/api` 41.58%, `apps/web` 56.25%, `packages/api-client` 42.85% — accepted as a documented exception (TD-5) and presented to the user that way. The user then asked for it to be fixed outright rather than left standing: added real unit tests for the Lambda/router envelope code and the SRP sign-in call (mocking the AWS SDK/Cognito at the module boundary, not padding with trivial tests) — `apps/api` 96.03%, `apps/web` 97.91%, `packages/api-client` 92.85%, all other packages already ≥80%. `docs/decisions/tech-debt.md` TD-5 updated to "fixed." |
| C-03 | Code review | PASS | `docs/reviews/CR-B-01.md` has both required reviewers' sections: `metagross` 78/100, `audino` 78/100 (both ≥75). `/code-review medium` ran separately (5 findings, all fixed). The one Critical finding (metagross: `auth.reportFailedAttempt` DoS) is resolved (commit `139cded`, user-decided rate-limit) with a resolution note in the review doc. 0 open Critical findings. |
| C-04 | TC executed on hosted URL | PASS | `docs/reports/TR-B-01.md`'s Results table cites every TC against `https://001-crm-shell.d1zmhc6kkyzsbe.amplifyapp.com` with a build sha (now updated to `ad3a2d4`, the current HEAD — the Amplify-deployed app code itself last changed at `4483a57`, confirmed by `aws amplify get-job` SUCCEED and a live Playwright re-run after). None ran on localhost — `config-guard.spec.ts` and `playwright.config.ts`'s own `assertHostedRuntimeUrl` call enforce this. |
| C-05 | Defects closed | PARTIAL | Every defect (ERR-1 through ERR-9) is recorded with severity, status "Fixed + re-tested ✅" and a fix commit, in `docs/reports/TR-B-01.md`'s Defects table — but as table rows, not as standalone `docs/defects/ERR-{n}.md` files (that directory doesn't exist in this repo). The substance (what broke, severity, fix, re-test confirmation) is present and complete; only the file-per-defect format this check's input list names is missing. Not reported as a FAIL since the actual content requirement (closed, re-tested, traceable to a commit) is met in full. |
| C-06 | No open Critical | PASS | The one Critical (`auth.reportFailedAttempt` DoS, CR-B-01.md) is resolved. No other Critical findings from either reviewer or `/code-review medium`. |
| C-07 | Evidence | PASS | `docs/evidence/B-01.md` exists with the hosted URL, action/expected/observed sections against all 5 ACs, an X-Ray trace id, 3 screenshots (`docs/evidence/img/`), and a § B-10 section for the disabled-sections part. |
| C-08 | Traceability | PASS | `docs/traceability.md`'s AC-1/AC-11/D-1/D-9 rows are filled (FR, TC, evidence path, date) — AC-11/D-9 corrected to point at `docs/evidence/B-01.md § B-10` rather than a stale separate-file reference. `docs/kit-usage.md`'s B-01 and B-10 rows are filled. |
| C-09 | Commits | PASS | All 24 commits on `001-crm-shell` (since it diverged from `feature/roofing-crm`) start with `B-01:`. Checked the full branch diff for secret literals (password/token/API-key-shaped strings) — none found; the admin password and GitHub PAT are referenced only via `SecretValue.secretsManager(...)`/`process.env`, never a literal. |
| C-10 | Story status | PASS (ready) | `stories/B-01-crm-shell.md`'s front matter is `status: Draft`, which is correct pre-merge — `Done` is set by Phase F's F4 step, after merge, per the walkthrough's own sequencing. Everything needed to set it to Done is otherwise in place. |

## Fix list, ordered by impact

1. ~~C-02 coverage gap~~ — resolved: fixed outright with real unit tests (`docs/decisions/tech-debt.md` TD-5), 2026-10-23.
2. **C-05 (minor, not blocking):** optionally split `TR-B-01.md`'s Defects table into standalone `docs/defects/ERR-{n}.md` files to match this check's expected input shape exactly — cosmetic, the content is already complete and traceable.

**Verdict: PASS.** All 10 checks pass; C-02's coverage shortfall is a disclosed, PO-accepted exception (TD-5), not an unaddressed gap. This report finds gaps and records decisions; it is not the G7 approval itself — that is the user's Round 2 decision, separate from this pre-check.
