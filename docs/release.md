---
id: REL-B1
type: release
title: Roofing CRM, Travis County TX: assessment submission
project: prismteam-ai/roofing-crm (fork HebaGaber/roofing-crm)
version: v1.0
feature_branch: feature/roofing-crm
tag: rel-B1
pr: https://github.com/prismteam-ai/roofing-crm/pull/15
owner: HebaGaber
status: Draft
gate: G8
deployment_strategy: amplify-atomic + cdk
created: 2026-10-26
approved_date:
---

# Release REL-B1: Roofing CRM, Travis County TX v1.0

Status is **Draft**: the G8 approval, the tag and `/code-review ultra` are still open (section 6 and the gate table say which).

## 1. Release scope

| FEAT | Story | Feature | G7 passed? | Merge commit |
| --- | --- | --- | --- | --- |
| B-01 | B-01 | CRM shell, sign-in, navigation, disabled "Soon" sections | Yes | `fcd6d6a` |
| B-02 | B-02 | Lead search index built from Task A's published manifest (sync pipeline) | Yes | `d01c06e` |
| B-03 | B-03 | Map search: pin, GPS, radius, roof age, open permits, property detail | Yes | `80873e1` |
| B-07 | B-07 | Leads: create, status, notes, duplicates refused, lead list and filters | Yes, with exceptions | `8b13240` |
| B-09 | B-09 | Agent (natural-language questions with cited rows) and hardening | Yes, with exceptions | `ab6f520` |

Work after the story merges (2026-10-26) is on `feature/roofing-crm` as ordinary commits: Task A Run 3.1, owner and address data, the whole-repo review fixes, the full property view and the UI rework. They are listed in [`docs/pr-body.md`](pr-body.md), "Progress since the last update".

**Excluded (deferred or known gaps):**

| Item | Reason |
| --- | --- |
| BBB rating scores | Task A's data holds none (BBB blocks lookups); the app shows "not available" with the reason and a BBB search link |
| Verified contractors | Task A publishes names as printed on the permit only (4,552 of 15,025 permits) |
| Outbound messaging to owners | Out of scope in the README; the agent refuses such requests and Outreach is a disabled "Soon" item |
| 9 of 33 B-09 test cases | Approved as exceptions by the PO on 2026-10-25, listed in `docs/reports/TR-B-09.md` |
| Incremental Task A runs | Task A confirmed every run is a full snapshot |

## 2. What's new (user-facing)

- **Map and search:** opens on Travis County; pin drop, GPS or a place, ZIP, address, permit or TCAD account search; a configurable radius; roof age 15 years by default with 10, 13, 20, 25 and Any; open or stalled permits with the longest-open emphasised; owner filters; ready-made filter suggestions.
- **Properties and permits:** a full property view with why it is a lead, every field and its source, and every permit with contractor as printed and the BBB state.
- **Leads:** create from a property, a permit or the list, status and notes that persist, duplicates refused, undo for 15 minutes, and a lead list with filters.
- **Ask:** natural-language questions answered with cited, verified records; sample questions; refusals for places outside Travis County and for messaging owners; results also shown in the List view.
- **Disabled sections:** Campaigns, Estimates, Jobs, Invoices and Outreach.

**Known issues:** BBB scores never appear (no data); contractors are unverified; the first map search after a cold start can take several seconds; the distance on an Ask card for a radius search is the nearest-place distance (its tooltip says so); the app has no lead delete, only Undo right after creation.

## 3. Deployment configuration

| Item | Value |
| --- | --- |
| Runtime URL | https://crm.aldarraj.com (the commit it serves is at `/build.json`) |
| Frontend | Amplify app `d1zmhc6kkyzsbe`, branch `feature/roofing-crm` |
| Backend | CDK stacks CrmData, CrmSync, CrmOps, CrmApi, CrmWeb, CrmDomain in `eu-north-1` (demo project, region-locked), deployed from a clean checkout of the same commit as the web build |
| Data snapshot | Task A Run 3.1, manifest `bafkreidbqsav3rsbxqy5fx3li73uskfth254nz5zw34xwac5w3fd4tmbai` (run `travis-full-run3-1-20261025`) |
| CI | GitHub Actions on the fork, [all runs on the branch](https://github.com/HebaGaber/roofing-crm/actions?query=branch%3Afeature%2Froofing-crm): type-check, lint, Prettier, unit tests, cdk synth with cdk-nag, secret scan, Playwright on the hosted URL |

Deploy: see "How to redeploy and where the data comes from" in `docs/pr-body.md` and `docs/runbook.md`.

## 4. Rollback plan

| Item | Value |
| --- | --- |
| Trigger | A smoke test fails after a deploy, or a sync alarm fires (failed, held, memory-high) |
| Frontend | Amplify console: redeploy the previous build of `feature/roofing-crm` |
| Backend | `git checkout <previous commit>` then `cdk deploy --all` from a clean checkout (about 3 minutes plus the build) |
| Data | `scripts/sync-ops.sh rollback --yes` flips the served index back to the previous manifest (Run 3, `bafkreifndsdibdllvgpzwmif6getzwvc6rupk5tgeak4eypccaw3t7vlfm`) without a rebuild; manifests are immutable |
| Tested | Partly: the script's dry run was executed against the live table on 2026-10-26 and named both CIDs and verified the previous index files exist; the pointer flip itself was not executed on the live app. The earlier path (redeploying with an older manifest CID) was exercised when Run 3.1 replaced Run 3 |

## 5. Baseline metrics

| Metric | Value | Measured |
| --- | --- | --- |
| Unit and integration tests | 2,715 passed, 0 failed | `pnpm turbo run test` on the branch head, 2026-10-26 |
| Hosted Playwright | Parallel and isolated phases at 390, 768 and 1440 px, green on the last full CI run | GitHub Actions |
| Golden queries on the deployed agent | 51 of 51 (17 queries, 3 repeats) at commit `098fb75`; the agent then gained a TCAD-account example in its plan prompt and a follow-up inheritance change, and the suite was not re-run (PO decision); both are covered by stubbed-model unit tests | `docs/evidence/B-09.md` |
| Map search latency | p95 1.11 s, p50 0.86 s over 20 timed radius changes (6 to 25 mi) on the deployed index; first search after a cold start 4 to 10 s | `tests/e2e/perf.spec.ts` on the hosted URL, 2026-10-26 |
| Agent latency | p95 15.1 s, max 15.8 s on 54 timed asks (target under 20 s) | `docs/evidence/B-09.md` |
| Coverage of new code, defect fix time, deploy downtime | Not measured in this round | |

## 6. Post-deploy verification

| Check | Result |
| --- | --- |
| Opens in a private window, no setup | Passed in fresh browser contexts by two independent evaluator runs (not yet by the PO in a private window) |
| Full Playwright demo suite on the hosted URL | Green on the last full CI run |
| Test credentials work | Yes (admin user, password in Secrets Manager, shared privately) |
| CloudWatch alarms configured and OK | Six `crm-sync-*` alarms exist and read OK |
| `/code-review ultra` on the feature branch: 0 open Critical | **Not run** (PO types it) |
| `slowking` self-score | 80/100 with the demo gate treated as passed; 0/100 as scored because the video is not recorded |

## 7. Golden Path conformance (checks.md section 5, run 2026-10-26)

| # | Rule | Result |
| --- | --- | --- |
| 1 | TypeScript only | Pass. The only Python files are Spec Kit's own scripts under `.specify/` (kit tooling), none in application code |
| 2 | CDK only, region from config, tagged | Pass. `infra/cdk.json`, no Terraform, SAM or Serverless files, region from config, resource tags in the data stack |
| 3 | Turborepo layout and one shared `api-client` | Pass |
| 4 | Zod on procedures, no `any` | Pass. No `any` in code (matches are comments and a lint fixture); ESLint `no-explicit-any` is an error |
| 5 | Vercel AI SDK only | Pass. No provider SDK imports |
| 6 | Queued external boundaries | Pass for part fetches: SQS dead-letter queue, backoff with jitter, content-addressed keys and a conditional pointer flip for idempotency |
| 7 | One self-resolving alarm per DLQ | Pass, with an OK action |
| 8 | Powertools Logger, Tracer, Metrics, X-Ray | Pass: every sync handler is wrapped |
| 9 | Business metrics | Pass: sync, lead and agent metrics |
| 10 | PagerDuty | Documented gap: SNS email instead (constitution Article IX exception, no PagerDuty account) |
| 11 | Tests and CI | Pass |
| 12 | No secrets in Git, logs or PR | Pass: `gitleaks` is green in CI |

---

## Gate G8: Release Approval

| # | Criterion | Status |
| --- | --- | --- |
| G8-01 | Every FEAT in scope has passed G7 and is merged into the feature branch | ☑ |
| G8-02 | `docs/progress.md` regenerated; no status/merge mismatches | ☐ (to run) |
| G8-03 | CI green on the feature branch head | ☐ (confirm on the final commit) |
| G8-04 | Hosted URL verified in a private window; full demo suite green | ☐ (PO private-window login) |
| G8-05 | Rollback plan documented and tested | ◐ documented; tested in part (section 4) |
| G8-06 | Release notes complete, and the known gaps are honest | ☑ |
| G8-07 | Demo video recorded, following the README transcript in order | ☑ recorded and linked: https://www.youtube.com/watch?v=Iq4KyMsz6mc (YouTube was still processing it when linked; confirm it plays in a private window) |
| G8-08 | Admin test credentials shared privately, not in Git | ☐ (PO shares privately) |
| G8-09 | AI pre-check (`developmentsupport-g8-precheck`): PASS | ☐ (to run) |

**Decision:** ☐ Approved, open the PR and tag `rel-B1` ☐ Returned, reason: {…} · {date}
