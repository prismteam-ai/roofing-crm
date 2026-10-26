# Open items and status

Rewritten 2026-10-26 to match the branch and the live app. Earlier versions of this file described the Run 2 and Run 3 hand-over; those steps are done and are recorded in `docs/progress.md`, `docs/evidence/` and `docs/reuse-log.md`.

Rules that carry over: never merge the PR into `prismteam-ai/roofing-crm`; no hash character followed by a number in commits, PR text or comments (write `F-8` or "finding 8"); commit messages start with the story ID; no secrets in git or logs; AWS profile `assess`, region `eu-north-1`.

## 0. State now

| Item | Value |
| --- | --- |
| Pull request | `prismteam-ai/roofing-crm` PR 15 from `HebaGaber:feature/roofing-crm`, open and ready for review since 2026-10-26. Its text on GitHub follows `docs/pr-body.md` (republished 2026-10-26 after the final evaluator score) |
| Data the app serves | Task A **Run 3.1** (contract v1.2), run `travis-full-run3-1-20261025`, manifest `bafkreidbqsav3rsbxqy5fx3li73uskfth254nz5zw34xwac5w3fd4tmbai`: 441,961 properties, 15,025 Austin roofing permits, 4,552 with a printed contractor name. Rebuilt on 2026-10-26 with Task A's review changes (fa6771a). Run 3 (`bafkreifndsdibdllvgpzwmif6getzwvc6rupk5tgeak4eypccaw3t7vlfm`) is `previous` and the rollback ([`docs/runbook.md`](runbook.md)) |
| Deployed code | See `/build.json` on https://crm.aldarraj.com; the API and sync stacks are deployed from the same commit as the web build. CI on the last full push was green (secret scan, workspace checks, hosted Playwright) |
| How a new run is picked up | Change `DATA_MANIFEST_CID` (GitHub repository variable and the deploy shell); a deploy starts one sync (execution `{cid}-{deployNonce}`); an already promoted CID is a no-op. Details in [`docs/runbook.md`](runbook.md) |
| Deploy method | Clean checkout of the commit, `eval "$(aws configure export-credentials --profile assess --format env)"`, then `cdk deploy --all --require-approval never` from `infra/` with `AWS_REGION`, `CDK_DEFAULT_REGION`, `CDK_DEFAULT_ACCOUNT=515618610572`, `DATA_MANIFEST_CID`, `AI_PROVIDER=bedrock`, `AGENT_MODEL_ID=eu.anthropic.claude-sonnet-4-6`. CI never deploys |

## 1. Gates (a missing gate scores 0 whatever else is done)

| Gate | Status | What closes it |
| --- | --- | --- |
| PR to `prismteam-ai/roofing-crm` | Open and ready for review (PR 15) | Update its text from `docs/pr-body.md` after the push (section 2, step 4) |
| Hosted URL opens in a private window and the login survives a reload | Passed (evaluator, fresh browser contexts at 390, 768 and 1440 px, 2026-10-26) | Repeat once after the next deploy |
| Credentials | Passed. Test user `admin@roofing-crm.test`; the password is in Secrets Manager `roofing-crm/admin-user`, shared privately, never in a file | Share privately with the assessor |
| Demo video linked from the PR and playable without signing in | Linked: https://www.youtube.com/watch?v=Iq4KyMsz6mc. YouTube was still processing it when linked | PO confirms it plays in a private window |

## 2. To finish the current round (in this order)

1. Golden queries on Run 3.1: the `tests/agent/golden.json` re-baseline (manifest, run id, permit and count truths, plus an adversarial set) and a run of at least 3 repeats under about US$2 of Bedrock; save results as `tests/agent/results/run3-1-pass*`, add a Run 3.1 section to `docs/evidence/B-09.md`. Status: worker running.
2. Merge the golden branch, run the full local gate (type-check, lint, prettier, all unit tests), push once.
3. Deploy from a clean checkout; check `/build.json`, the sync alarms exist, and re-run the hosted suites (parallel and isolated phases). Re-run `tests/e2e/responsive/drawer-actions.spec.ts` (its two CSS fixes are unverified until then). Do not run hosted lead tests while CI runs: they share one DynamoDB table.
4. Replace the PR text with `docs/pr-body.md` (`gh pr edit 15 -R prismteam-ai/roofing-crm --body-file docs/pr-body.md`) and turn its last progress row ("Pending when this was written") into measured results.
5. Real-data performance test on Run 3.1 (`CRM_PERF=1`, `CRM_REAL_INDEX_DIR` set to a copy of the served index) and a p95 sample against the hosted API; the evaluator saw only single timings (a map search after GPS took about 3.6 s against the 3 s target).
6. Done 2026-10-26: `machamp` re-scored 79 and `smeargle` 83 on the fixed code; all scores are in `docs/kit-usage.md`.
7. Release steps still open: R1 Golden Path sweep (`../assessment-guide/reference/checks.md` section 5) and `/simplify` once; R3 `/code-review ultra` (**PO types it**); R4 `docs/release.md`, `/developmentsupport-g8-precheck`, the private-window login and `git tag rel-B1`; R5 `babysit-release` for PR readiness only; R6 a fresh `slowking` self-score once the demo link exists; R7 the demo video (**PO**).

## 3. Findings from the 2026-10-26 whole-repo review, still open

Scores: `audino` 84, `metagross` 82, `espeon` 82, `ash` 82, `alakazam` 78, `porygon` 78, `machamp` 68 then 79 after fixes, `smeargle` 66 then 83 after fixes. Evaluator self-scores with the demo gate treated as passed: about 68 (estimate), 75 (first measured), 80 (final measured, 2026-10-26); 0 as scored because the demo video is not recorded. Fixed already on the branch: the permit-filter limit, "Open" meaning, Ask dropping the permit condition, failed and held sync alerts, the replay and rollback runbook, shared rules, tenure wording, constitution text, responsive test gaps.

| Finding | From | Decision needed |
| --- | --- | --- |
| No AI SDK `experimental_telemetry` in the agent path although the agent decision record promises OpenTelemetry and a LangSmith adapter | `ash` | Wire it, or amend the record to say the agent's own logs and X-Ray subsegment are the trace |
| Cost gate is a size and count gate, not a spend gate; its document limit was raised from 600,000 to 1,000,000 to fit Run 3 | `espeon`, `machamp` | Documented in ADR-05; no change planned |
| No size check of fetched bytes against the declared size; no clean-up of old index versions in S3 | `espeon` | Check `fetchPart.ts`; add a retention note or a lifecycle rule |
| The index build runs in one maximum-size Lambda (2,600 MB DuckDB limit in 3,008 MB) with no scale-out path | `espeon`, `machamp` | Fargate for BuildIndex is the documented next step if a run grows past the limit; the failed-run alarm now fires |
| Hex-cell aged counts are computed at the fixed 15-year default; the legend buckets are fixed at 15, 20 and 25 | `porygon` | Confirm headline counts use the user's threshold; decide whether the roof-age default stays 15 |
| Lead snapshot does not store roof-age confidence; Ask rows show roof age without confidence | `audino` | Needs a lead-snapshot change; decide |
| `search.permits` returns at most 500 rows; a listed property whose permit falls past that page shows without permit detail | `fin-perm` worker | The UI already says so; decide whether to page it |
| Search suggestions drop over the toolbar at 390 and 768 px (recorded as an annotation, not asserted) | `fin-e2e` worker | Decide whether the toolbar must stay visible |
| Conversation memory keeps only the last plan and proposed ids; concurrent asks on one thread overwrite the plan; the rate limiter is a fixed window; model prices are hard-coded | `ash`, `alakazam` | Accepted for the demo; listed in `docs/decisions/tech-debt.md` |
| `composeAnswer.ts` is about 1,700 lines | `ash`, `alakazam` | Split in a later story |
| No automated accessibility scan (axe); `packages/ui` has three test files | `audino` | Add if time allows |
| Raw pixel sizes remain in two component files; 20 max-width media queries remain | `audino` | Cosmetic |
| Final `/code-review medium` follow-ups for B-09 (eight items) | CR-B-09 | Listed in [`docs/reviews/CR-B-09.md`](reviews/CR-B-09.md) |
| Time-to-submit: `docs/00-timeline.md` row "Assignment sent" is blank | evaluator | **PO provides the time** |

## 4. Decisions the PO still owes

- Delete the test data in the live Leads list before recording: the lead the evaluator created (217 E 6 ST, TCAD 194459) and the seeded test leads such as TCAD B07STALE. Deleting is irreversible, so it waits for the PO.
- Roof-age default 15 years or none (a default filter hides most of the county's properties at lower values; the README suggests 15).
- Whether to rebuild lead snapshots server-side (leads store a copy of the signals at creation).
- Whether to close the Task A question about a stable Explorer link per property (question 14, still open on their side).

## 5. Task A data gaps that remain in Run 3.1 (answered by Task A on 2026-10-26)

No roof date from TCAD (built year stands in, confidence Low; 9,510 properties use a closed roofing permit); situs city and ZIP not published (inside the address text); 7,945 properties without coordinates; 32,572 properties without an owner (15,410 confidential, about 17,160 names not parsed); contractors only as printed and unverified (4,552 of 15,025 permits); no BBB rating; permits are Austin only; 952 of the 1,674 "stalled" permits carry a final date (Task A derives stalled from a missing status plus an old issue date and ignores the final date), so the CRM treats them as finished: a permit is live (open or stalled) only if it has no final date, which leaves 722 stalled and 73 open (7 of the 80 open also carry one), and the drawer labels the others `Finaled {date} (status not in source)`; 372 properties have an owner mailing address without a ZIP. The app shows "not published" with the contract reason for each. Full text: [`docs/task-a-questions-run3.md`](task-a-questions-run3.md).

## 6. Demo rehearsal

Before recording, run the README Demo Transcript once on `https://crm.aldarraj.com`: central Austin for roof-age and permit steps. Open permits are rare (80 county-wide, 1,674 stalled), so use a location where "Open" (open and stalled) has rows; the evaluator found 861 properties within 5 mi of Congress Ave once the permit filter ran on the server. Clear the test leads first (section 4).

## 7. Deferred features (not part of the README criteria)

Ask: editable assumption chips, Cancel while working, a low-confidence reason, a Close-matches tab. Map: Area and Sort menus, pin explainer toast, permit coverage hatching, county outline. Leads: multi-select status, a rep directory, numbered pages, a changed-signals pill. Sign-in banners (lockout, session expired). Done since the last version of this file: `leads.assign` and Assign to me (not yet exercised end to end with more than one user), lead confidence, recent and saved searches, similar properties, the owner filters. Proposed shapes remain in `design/board-match/`.

## 8. Cleanup and hygiene

- Retire the CI AWS access when the assessment is over: remove the `crm-ci` user from `infra/lib/crm-ci-user.ts`, redeploy, delete the repository secrets `CRM_CI_AWS_ACCESS_KEY_ID` and `CRM_CI_AWS_SECRET_ACCESS_KEY`.
- Close Docker Desktop after the last deploy (only needed to bundle the DuckDB Lambdas); do not delete Task A's volumes.
- Twenty re-captured evidence images under `docs/evidence/img/` are modified and uncommitted; commit them with the next evidence update or restore them.
- Gateway AI provider is wired but off (needs `crm:aiGatewaySecretArn` and `AI_PROVIDER=gateway`); Bedrock stays live.
- Every deploy starts one (no-op) sync; a deploy while a sync of the same CID runs starts a second concurrent run, which is safe (parts are content-addressed and Promote is conditional).
