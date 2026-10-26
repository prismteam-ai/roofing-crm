---
id: CR-B-07
type: code-review-log
story: B-07
branch: 007-leads
reviewed_commit: 67234b1
tools: [/code-review medium, soofi-xyz-team-kit:metagross, soofi-xyz-team-kit:audino]
created: 2026-10-24
---

# Code Review Log: B-07 Create, manage and browse CRM leads (parts B-07 and B-08)

One review round, three reviewers in parallel, all read-only, on the diff `feature/roofing-crm...007-leads`. Fixes landed in `2a2f669`; the fixed code was re-proven on the hosted URL (see `docs/evidence/B-07.md`).

## Reviewer scores

| Reviewer | Score | Pass mark | Re-score needed |
| --- | --- | --- | --- |
| `metagross` (patterns, contracts, guardrails) | **80 / 100**, re-scored **85** | 75 | done |
| `audino` (front end, Atlas, regression tests) | **78 / 100**, re-scored **86** | 75 | done |
| `/code-review medium` | 10 ranked findings, no score | n/a | no |

### Re-score on the current head (2026-10-24, after the review fixes)

Both kit reviewers re-read the code at `ae7768c` and confirmed every finding marked Fixed holds in the code, with no new Critical or High finding.

| Reviewer | First score | Re-score | What they confirmed |
| --- | --- | --- | --- |
| `metagross` | 80 | **85** | The conflict retry is safe: it retries only a pure `TransactionConflict`, re-reads every attempt, is capped at 6 and jittered. The AC-5 presence check is batched and fails open. Findings 3, 11, 15, 16 and 17 are fixed in code |
| `audino` | 78 | **86** | The "Lead not found" page and retry policy are correct; the new hook, list, detail and not-found tests are real; the saved-notes assertion removed the textarea false pass; `.mapArea { overflow: hidden }` has no side effect on the radius overlay (it is positioned inside the area) |

New low findings from the re-score, recorded in `specs/007-leads/known-gaps.md` § 7 (7.12 to 7.14): `presentRequestIdentifiers` re-reads the manifest pointer and could, in a narrow window, see a different manifest than the caller; a lead key with no `:tcad:` marker yields an empty identifier and is flagged absent; the NOT_FOUND message echoes the lead key. The e2e test TC-006 on desktop is the regression test for the map-area fix.

## Runs

| Run | Tool | Effort | Date | Commit | Findings |
| --- | --- | --- | --- | --- | --- |
| 1 | `/code-review` | medium | 2026-10-24 | `67234b1` | 10 |
| 1 | `metagross` | n/a | 2026-10-24 | `67234b1` | 9 |
| 1 | `audino` | n/a | 2026-10-24 | `67234b1` | 10 |

The code-review agent said it covered only the lead files: the branch spans 893 files against the local base, because the base branch is behind earlier merges.

## Findings

Severities are the reviewer's. None was rated Critical.

| # | Reviewer | Severity | File:line | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | metagross | High | `routers/leads.ts` 23-39, `services/leads.ts` 147-160 | `create` trusts the client for address, lat, lon, `sourceManifestCid` and `fips`; never checks them against the index | **Deferred** to the follow-up story (known-gaps 4.1), by PO decision 2026-10-24 | n/a |
| 2 | metagross, code-review | Medium | `routers/leads.ts` 117-151 | `get`, `updateStatus`, `addNote` take any `leadKey` with no ownership or role check; `list` accepts any `assignee` | **Deferred** (known-gaps 7.1): the rule (private leads or a shared team view) is undecided | n/a |
| 3 | metagross, code-review | Medium | `services/leads.ts` 216-218 | A status-only list queried GSI2 and returned every user's leads | **Fixed**: the default scope is always the caller | `2a2f669` |
| 4 | metagross | Medium | `leadRepo.ts` 126, 188-222 | Throttling and `TransactionInProgress` not retried; no `ClientRequestToken`, so a retry after an ambiguous create failure could say "Already a lead" for the caller's own write | **Deferred** (known-gaps 7.2) | n/a |
| 5 | metagross | Medium | `tests/e2e/A-13-vitals.spec.ts` | An Oracle vitals spec was deleted | **Accepted**: it imported a package and helper files this repo does not have, could never run, and broke the hosted CI job before any test ran | `1c8d151` |
| 6 | metagross, code-review | Low | `services/leads.ts` 228-240, `leadRepo.ts` 164 | In-memory offset cursor; silent 1000-lead truncation makes `totalCount` wrong | **Deferred** (known-gaps 4.2) | n/a |
| 7 | metagross | Low | `trpc.ts` `withAppCode` | Copies any string `cause.code`, including AWS SDK codes, to the wire | **Deferred** (7.7) | n/a |
| 8 | metagross | Low | `routers/leads.ts` 103-107 | Unexpected errors log only the code, not the error name | **Deferred** (7.7) | n/a |
| 9 | metagross, audino | Low | `apps/web/tsconfig.tsbuildinfo` | Build artifact committed | **Fixed**: untracked, `*.tsbuildinfo` ignored | `2a2f669` |
| 10 | metagross | Low | `crm-data-stack.ts` | Table name `crm-leads` hard-coded, blocks several environments | **Deferred** (7.8) | n/a |
| 11 | code-review | High (correctness) | `services/leads.ts` 133 | Roof-age and permit filters without a radius saw only 100 arbitrary properties (the index applies `LIMIT 100`) and dropped matching leads | **Fixed**: the scan asks for the whole index. Untested at full-county size (known-gaps 7.6) | `2a2f669` |
| 12 | code-review | Medium | `LeadDetail.tsx` 146, `leadsApi.ts` | The web client never sends `expectedSequence`; two open sessions overwrite each other | **Deferred** (7.3) | n/a |
| 13 | code-review | Low | `leadRepo.ts` 220 | Any `ConditionalCheckFailed` in append becomes "changed since you loaded it"; hides a deleted lead | **Deferred** (7.4) | n/a |
| 14 | code-review | Medium | `services/leads.ts` 110 | Bare `catch` returns empty with no log; an index outage hides the AC-5 flag | **Deferred** (7.5) | n/a |
| 15 | code-review | Medium | `services/leads.ts` 209 | A centre without a radius silently disables geo filtering | **Fixed**: the router requires radius, centre latitude and centre longitude all or none | `2a2f669` |
| 16 | code-review | Low | `services/leads.ts` 97 | `requestIdOf` splits on `:tcad:` and truncates an identifier containing it | **Fixed**: `requestIdentifierOf()` splits on the first marker only | `2a2f669` |
| 17 | code-review | Low | `routers/leads.ts` 140 | A whitespace-only note is accepted | **Fixed**: the note is trimmed in the schema | `2a2f669` |
| 18 | audino | Medium | `LeadsList.tsx` 190, `LeadDetail.tsx` 160 | Assignee and created-at carry no per-datum provenance; only the signals block does | **Deferred** (7.9): whether Atlas requires it on every datum is a judgement call | n/a |
| 19 | audino | Medium | `LeadsList.tsx` 53-85 | Filter groups labelled by a `<span>`; chips read only "20" or "Open" | **Deferred** (7.9) | n/a |
| 20 | audino | Medium | `B-07.spec.ts` 269-272, 596 | TC-016 accepts either state and skips when the list is not empty; a silent fallback in another test | **Deferred** (7.10) | n/a |
| 21 | audino | Low | `LeadDetail.tsx` 155, 162-179 | Raw lower-case status in the detail; the Status field's `<dt>` is not tied to the select | **Deferred** (7.9) | n/a |
| 22 | audino | Low | `LeadsList.tsx` 119-146, `LeadCreateAction.tsx` 99-111 | Numeric filters commit on every keystroke with no inline validation; focus is not moved to the error banner | **Deferred** (7.9) | n/a |
| 23 | audino | Low | `B-07.spec.ts` 701-716 | The token audit covers a fixed property list on two pages only | **Deferred** (7.10) | n/a |

## Constitution and architecture check

| Rule | Result | Note |
| --- | --- | --- |
| Zod on every tRPC input; no `any` | ✅ | Reviewer: every procedure validates its input |
| LLM calls only through the Vercel AI SDK | n/a | No LLM in this story |
| Powertools logger, tracer and metrics in every Lambda | ✅ | The leads router wraps every procedure with a trace subsegment, a structured log line and a metric |
| No secrets or PII in code or logs | ✅ | Reviewer found none; logs carry procedure, request id and code only (P0-13) |
| P0 rules in `docs/architecture-constitution.md` | ⚠️ | Key and dedupe (P0-6) and one-writer rules confirmed. Finding 1 (client-trusted `create`) is open against "no invented data"; deferred by PO decision, tracked in known-gaps 4.1 |
| Atlas tokens only in the UI | ✅ | Reviewers: no raw colours; TC-NF-04 passes at 390, 768 and 1440 |
| Non-CDK infrastructure, direct LLM SDKs | ✅ | None found |

**Open Critical findings:** 0.

**Honest note:** the three reviewers were read-only and each ran for about 30 to 70 seconds. `audino` and `/code-review` said they did not run any tests, and `audino` did not open the design prototype boards or the evidence document. The review is a read of the code, not a substitute for the hosted run.
