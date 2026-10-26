---
id: CR-B-09
type: code-review-log
story: B-09
branch: 009-agent-hardening
reviewed_commit: a769cc4 (re-scored at d78de40; final re-score at 9fc1c08, fixer round at cbb548e)
tools: [/code-review medium, soofi-xyz-team-kit:alakazam, soofi-xyz-team-kit:ash, soofi-xyz-team-kit:metagross, soofi-xyz-team-kit:audino, soofi-xyz-team-kit:porygon]
created: 2026-10-24
---

# Code Review Log: B-09 Agent and hardening (parts B-09 and B-11)

One review round, five kit reviewers plus `/code-review medium`, all read-only, in parallel, on the diff `feature/roofing-crm...009-agent-hardening` at `a769cc4`. Live data (Task A Run 2) is not online yet, so reviewers judged the code, not live answers.

## Reviewer scores

| Reviewer | Lens | Score | Pass mark | Re-score needed |
| --- | --- | --- | --- | --- |
| `alakazam` | retrieval, grounding, confidence bands | **72 / 100**, re-scored **80** | 75 | done |
| `ash` | agent runtime, limits, timeouts | **62 / 100**, re-scored **86** | 75 | done |
| `metagross` | infra, CDK, monorepo, Ask UI wiring | **68 / 100**, re-scored **84** | 75 | done |
| `audino` | design fidelity, Atlas, states | **72 / 100**, re-scored **88** | 75 | done |
| `porygon` | metrics, dashboard, count reconciliation | **58 / 100**, re-scored **88** | 75 | done |
| `/code-review medium` | correctness | 10 ranked findings, no score | n/a | no |

Every reviewer is under 75, so every Critical and every deviation from these reviewers is fixed in one fixer round (one fixer per builder), then only these reviewers re-score.

## Findings and fix owner

| # | Severity | Finding | Raised by | Fixer | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Critical | API Lambda timeout 10 s; the agent turn is sized for a 23 s abort inside a 28 s Lambda (`infra/lib/crm-api-stack.ts:84`) | /code-review, ash, metagross | ash | fixed |
| 2 | Critical | No `bedrock:InvokeModel*` grant on the API Lambda; Gateway key not wired (`crm-api-stack.ts`) | /code-review, ash, metagross | ash | fixed |
| 3 | Critical | Dashboard latency and groundedness widgets and the groundedness alarm query dimensions that are never emitted, so the alarm can never fire (`crm-ops-stack.ts`) | porygon | metagross | fixed |
| 4 | Major | Rate limit / over budget thrown as `TRPCError`, so the Ask screen never shows its throttled / paused states; those outcomes count as `error` in metrics (`routers/agent.ts`) | /code-review, ash, porygon | ash | fixed |
| 5 | Major | Usage guard fails open when its table name is unset (`routers/agent.ts`) | ash | ash | fixed |
| 6 | Major | Spend cap reserves a flat 1 cent per ask and never reconciles with real token cost (`routers/agent.ts`, `runAgent.ts`) | /code-review, ash | ash | fixed |
| 7 | Major | `confirmLead` writes (0,0) when coordinates are missing, does not check the tcadId was proposed in the thread, and has no rate limit (`routers/agent.ts`) | /code-review, ash | ash | fixed |
| 8 | Major | Permit citations looked up as property citations first and dropped (`composeAnswer.ts:656`) | /code-review | alakazam | fixed |
| 9 | Major | Scope gate runs place resolution for every intent, so lookup / coverage questions fail (`composeAnswer.ts`) | /code-review, alakazam | alakazam | fixed |
| 10 | Major | Counts, `missing` and outcome come only from property search counts; permit and lookup answers report 0 matched; exclusions hard-coded to 0 (`composeAnswer.ts`) | /code-review, alakazam | alakazam | fixed |
| 11 | Major | Claim text is not checked against cited rows (numbers, names) | alakazam | alakazam | fixed |
| 12 | Major | Deploy-time sync start reuses the CID as execution name, so a failed first sync or an A→B→A rollback never re-syncs (`crm-sync-stack.ts`) | /code-review | metagross | fixed |
| 13 | Major | Validate runs no property-count check for a first full-county run, and an unresolved county batch is skipped silently (`validate.ts`, `bindManifest`) | /code-review | metagross | fixed |
| 14 | Major | Alarm email hard-coded in `infra/src/app.ts` instead of config | metagross | metagross | fixed |
| 15 | Major | `AgentTimeouts` / `AgentThrottled` / `AgentOverBudget` in the contract but never emitted; contract dimension columns wrong | porygon | metagross (contract + dashboard), ash (emit by `outcome`) | fixed |
| 16 | Major | Ask: "How I read this" shown on system-limit outcomes; empty-result copy does not say why; no candidate-place buttons for clarification; place / limits hard-coded in copy | audino, alakazam | metagross (web), after alakazam | fixed |
| 17 | Minor | Groundedness averaged per answer instead of Sum(verified)/Sum(total); planted citations filtered before counting | porygon, alakazam | metagross, alakazam | fixed |
| 18 | Minor | `GoldenQueryPassRate` literal repeated; publisher never invoked | porygon | metagross | fixed |
| 19 | Minor | Type casts (`as unknown as`) in infra and `askApi.ts` | metagross | metagross | fixed |
| 20 | Minor | Ask: working state has no progress indicator; focus not moved to the result; comments cite the wrong prototype files | audino | metagross (web) | fixed |

Fix waves (so no two fixers edit the same file at once): wave 1 `ash` + `metagross` (infra, sync, metrics); wave 2 `alakazam` (answer composition); wave 3 `metagross` (Ask screen).

## Re-score on the fixed head (`d78de40`, 2026-10-24)

All five kit reviewers re-read the code at `d78de40`, confirmed each of their findings fixed in the code (with file and line evidence), and found no new Critical or Major issue. Fixes landed in `56222d5` (ash), `d81b380` (metagross, infra/sync/metrics), `84a23be` (alakazam), `d78de40` (metagross, Ask screen), plus `15f3ab9` (ERR-21, found by the PO on the preview). Deployed to the hosted stack; a live `agent.ask` through Bedrock returned HTTP 200 in 5.3 s.

Remaining Minor / Low notes (not blocking G7):

| Note | Raised by | Disposition |
| --- | --- | --- |
| `AGENT_TURN_LIMIT_SEC = 23` in the web app mirrors the server's `RUN_AGENT_TIMEOUT_MS`; no shared constant or contract test | audino | follow-up: move to `packages/shared` |
| Conversation memory is one `THREAD#` item (last plan + proposals), not a full event store | ash | accepted for v1; ADR-06 few-shot reuse not built |
| If `getModel()` throws after the spend reservation, the reservation is not reconciled (over-counts) | ash | follow-up, misconfiguration-only |
| `citationsVerified` stays 0 when the template answer replaces failed claims (under-reports groundedness) | alakazam | accepted, conservative |
| Unnamed place with no previous plan returns needs_clarification with empty candidates | alakazam | UI shows the "name a place" message (wave 3) |
| Per-answer `AgentCitationGroundednessRate` logs 100 for 0-of-0 answers (log-only; dashboard/alarm use Sum/Sum) | porygon | accepted |
| The alarm's citing-outcome list must track any new citing path | porygon | noted in code |
| Every deploy starts one (no-op) sync because of the deploy nonce | metagross | by design |
| Three `as unknown as` casts remain outside B-09's files (`leadsApi.ts`, `CrmMap.tsx`, `auth/config.ts`) | metagross | follow-up |


## Final re-score on Run 2 (`9fc1c08`, 2026-10-25)

After the ask-in-map rebuild, the SQL search, Run 2 and the day's fixes, the same five reviewers re-read `git diff a769cc4..HEAD` (read-only, in parallel). No Critical finding, nothing blocks merge.

| Reviewer | Lens | Score | Pass mark |
| --- | --- | --- | --- |
| `alakazam` | retrieval, grounding, place recognition, golden queries | **84 / 100** | 75 |
| `ash` | agent runtime, confirm flows, spend guard, keep-warm, reserved words | **87 / 100** | 75 |
| `metagross` | infra, CDK, CI, data path | **88 / 100** | 75 |
| `audino` | design fidelity, Atlas, states, accessibility | **82 / 100** | 75 |
| `porygon` | metrics, alarms, count reconciliation | **84 / 100** | 75 |

### Findings and disposition

| Severity | Finding | Raised by | Disposition |
| --- | --- | --- | --- |
| Major | Answer text said "showing the top N" with the cited-row count, not the shown-row count | porygon | fixed (`71b6e8a`), unit tests |
| Major | Lead marks silently disappear when more than 1,000 properties are in the ring or the presence read fails | audino | fixed (`cbb548e`), notice `CrmCandidatesLeadsUnavailable` in list and triage |
| Major (evidence) | G1, G2, G6 not re-run after the agent changes; pass 1 did not record resolved areas | alakazam | closed by pass 6 (`fa023a1`) |
| Minor | Empty-answer "states a reason" check was vacuous | alakazam | fixed (`71b6e8a`) |
| Minor | Tenure other than 10 years answered silently at the 10-year cutoff | alakazam | fixed: honest note |
| Minor | 15-year roof default applied to non-roof questions | alakazam | fixed: roof questions only, plus a code backstop |
| Minor | FilterSheet `aria-modal` without a Tab trap; first-visit Escape listener document-wide; pins named only "Source N"; stale board text | audino | fixed (`cbb548e`) |
| Minor | Fixture path in `pending-items.md`; Run 1 figures in the run log | metagross, porygon | fixed (`3345f06`) |
| Minor | Evidence lacks a Run 2 sync section (2,362 sub-permits excluded, 130 of 225 parts) | porygon | follow-up |
| Minor | G3 empty because "open" excludes stalled permits | alakazam | product decision, recorded in the PR |
| Minor | No automated no-horizontal-scroll check at 360, 600, 1280 px (CSS-rule test added; e2e widths listed) | audino | follow-up |
| Minor | Gateway key never refreshed after rotation; plain Error for a missing gateway key; thread ids client-supplied; reservation kept if a Lambda times out mid-turn | ash | follow-up |
| Minor | `crm:alarmEmail` committed; CI key available to any 0* branch push; static `crm-ci` key | metagross | follow-up (retire `crm-ci` after the final CI run) |

Defects found while verifying on the deployed API (not by reviewers): the lead repo was missing from the Lambda context (agent could not check or propose leads), and `leads.undoCreate` failed on the real table because `sequence` is a DynamoDB reserved word. Both fixed and deployed (`86029e9`, `7b925eb`); the golden run G7 now passes end to end including undo.

### `/code-review medium` on the final head (`33f2573`, 2026-10-25)

Run once after the five kit re-scores, on `feature/roofing-crm...HEAD`. Eight findings, none rated Critical. No fixer round was run; by the PO's decision on 2026-10-25 (G7 approved with exceptions) they are recorded as follow-ups in `docs/pending-items.md` section 5.

| Severity | Finding | Disposition |
| --- | --- | --- |
| Major | `runBounded` calls `connection.interrupt()` on the one shared DuckDB connection, so a query that reaches its 10 s budget can abort an unrelated query running at the same time; the timer also starts at call time, not at execution time (`duckDbParquet.ts:523`) | follow-up: one connection per concurrent query, or a queue, then start the timer at execution |
| Major | `countyOverview`, `getProperty`, `getPropertyByRequestIdentifier` and `presentRequestIdentifiers` run without the query budget (`duckDbParquet.ts:960, 864, 890, 905`) | follow-up: bound them with `runBounded` |
| Minor | `verifyCitations` runs twice per turn when compose claims are all dropped and re-fetches every cited property (`composeAnswer.ts:1557`) | follow-up: reuse the first fetch |
| Minor | Lockout counter key changed from the Cognito sub to the lower-cased email: counters stored under the old key are orphaned, and a sign-in with an alias could still split the key (`lockout-handler.ts:127`) | follow-up; the shared admin signs in with the email, ERR-21 is closed |
| Minor | `proposedTcadIds` accumulates over the whole thread (7 days), so a confirm accepts a proposal from an earlier turn (`threadStore.ts:77`) | accepted for now: the guard is "proposed to this user in this thread", as designed; tighten to the latest answer if the PO wants it |
| Minor | `permitNumber` lookup ignores the radius although the tool comment says it is scoped (`tools.ts:99`) | follow-up: fix the comment or add a "not narrowed by area" note |
| Minor | A timed-out turn is billed at the full conservative estimate and reports `modelCalls: 0` (`usageMeter.ts:35`) | follow-up |
| Minor | `ThreadOwnedByAnotherUserError` is shown as "proposals couldn't be saved" (`agent.ts:128`) | follow-up: distinct non-retryable outcome |

