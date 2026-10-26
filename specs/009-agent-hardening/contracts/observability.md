# Contract: `RoofingCrm` dashboard, DLQ alarm, and agent metrics

Not a tRPC surface — the interface here is the CloudWatch namespace/dashboard/alarm contract
`metagross` builds to and `porygon` reviews against, per `agent-design.md` §4.

## DLQ + alarm (AC-6) — confirm, don't rebuild

**Existing** (`infra/lib/crm-sync-stack.ts`, `addFetchPartDlqAndAlarm()`): `FetchPartDlq` (SQS,
14-day retention), `FetchPartDlqAlarm` on `ApproximateNumberOfMessagesVisible > 0` for 1 period,
`treatMissingData: NOT_BREACHING` — self-resolves to OK the moment depth returns to 0, no custom
logic needed. `CrmSyncStack` already accepts `alarmEmail` → SNS `EmailSubscription`.

**Task**: confirm the deployed stack composition actually passes an `alarmEmail`. Done: the
address is cdk.json context `crm:alarmEmail`, read and validated by `infra/src/config.ts` and
passed by `infra/src/app.ts` (never a literal in code); `infra/test/config.test.ts` and
`infra/test/crm-sync-stack.alarmEmail.test.ts` pin it.

## Agent metrics (namespace `RoofingCrm`, Powertools `createObservability("crm-api")`)

Names, namespace and dimension set are constants in `packages/observability/src/metricNames.ts`
(`@crm/observability/metric-names`), shared by the emitters and by the dashboard/alarm/golden
publisher that read them.

**Dimensions.** Every agent metric is flushed once per `agent.ask`, under the one dimension set
`[service, outcome]`: Powertools adds `service` (`crm-api`) by default, and `agent.ts` adds
`outcome` before the flush, which applies to every metric stored during the call (including the
citation/lead metrics `composeAnswer.ts` stores earlier). A CloudWatch metric is identified by its
full dimension set, so every read must name `[service, outcome]` (or SEARCH over it);
`packages/observability/test/metricNames.test.ts` pins this against real Powertools EMF output.

| Metric | Unit | Dimensions | Emitted from |
| --- | --- | --- | --- |
| `AgentAsksTotal` | Count | `service`, `outcome` | `agent.ts`, every `agent.ask` call |
| `AgentAnswerLatencyMs` | Milliseconds | `service`, `outcome` | `agent.ts`, drives AC-4 p95 |
| `AgentModelCallsTotal` | Count | `service`, `outcome` | `agent.ts`, tracks the ≤3-call NFR |
| `AgentCitationsTotal` / `AgentCitationsVerified` | Count | `service`, `outcome` | citation verifier, per answer (0 / 0 on every outcome but `answered` / `empty_in_scope`) |
| `AgentCitationGroundednessRate` | Percent (0–100) | `service`, `outcome` | `Verified/Total`, per answer — kept for per-answer log reading only; the dashboard and alarm compute groundedness from the two counts instead (below) |
| `AgentLeadsProposed` | Count | `service`, `outcome` | `proposeLeads` tool |
| `GoldenQueryPassRate` | Percent (0–100) | — | `tests/agent/publishGoldenQueryPassRate.ts`, after a real golden run |

**`outcome` values**: the `AgentAnswer.outcome` enum (`answered`, `empty_in_scope`,
`out_of_scope`, `not_found`, `needs_clarification`, `field_not_published`, `timed_out`,
`rate_limited`, `paused`) plus `error` for a thrown call. Timeouts, throttling and the spend cap
are **`AgentAsksTotal` by `outcome`** (`timed_out`, `rate_limited`, `paused`) — not separate
`AgentTimeouts` / `AgentThrottled` / `AgentOverBudget` metrics.

No per-`property_cid` dimension — high-cardinality, unsuitable for a CloudWatch dashboard
(`porygon`'s design note).

## `RoofingCrm` dashboard (`infra/lib/crm-ops-stack.ts`)

`cloudwatch.Dashboard(this, "RoofingCrmDashboard", {dashboardName: "RoofingCrm"})`. Agent widgets
use `SEARCH('{RoofingCrm,service,outcome} MetricName="…" service="crm-api"', stat, 300)`, so each
emitted `outcome` is its own series and a new outcome appears without a dashboard change.
Widgets (`infra/test/crm-ops-stack.dashboard.test.ts` asserts each expression):

1. DLQ depth (`fetchPartDlq.metricApproximateNumberOfMessagesVisible()`)
2. `AlarmStatusWidget` for `FetchPartDlqAlarm`
3. Agent asks by outcome — `AgentAsksTotal`, Sum, stacked, one series per `outcome`
4. `AgentAnswerLatencyMs` p95, one series per `outcome` (percentiles can't be summed across
   dimension values; `answered` is the AC-4 line)
5. Citation groundedness = `100 * SUM(SEARCH(…AgentCitationsVerified…)) /
   SUM(SEARCH(…AgentCitationsTotal…))` — a ratio of sums over every outcome, not an Average of
   per-answer rates (target line 100)
6. `GoldenQueryPassRate` (`PutMetricData`d by the golden harness after each real run — so the
   widget reflects the last real run, not just a green CI badge)

## Continuous AC-4 check (not just a merge-time test)

Three layers sharing one definition (cited `property_cid` ∈ current index):
1. CI: `tests/agent/golden.json` + Vitest against the deployed endpoint (checks.md §7.2) — gates merges.
2. Runtime: alarm `crm-agent-citation-groundedness` on the metric-math ratio
   `IF(total > 0, 100 * verified / total)`, where verified/total are the `Sum` of
   `AgentCitationsVerified` / `AgentCitationsTotal` with dimensions `{service: crm-api, outcome}`
   for `outcome` ∈ {`answered`, `empty_in_scope`} — the only outcomes that can record citations
   (alarms can't use SEARCH and take at most 10 metrics). `< 100` for 3 × 5-minute periods → same
   SNS topic as the DLQ alarm, so citation drift pages rather than only failing a nightly test
   quietly. A period with nothing cited has no datapoint (missing = not breaching).
3. Dashboard: `GoldenQueryPassRate` trended over time, not a one-time checkmark. `golden.test.ts`
   publishes it at the end of every real run when AWS credentials are present
   (`shouldPublishGoldenQueryPassRate`; `CRM_PUBLISH_GOLDEN_METRIC=false` opts out).
