// The metric contract shared by the emitting side (Lambdas, via ./index.ts) and the reading side
// (infra/lib/crm-ops-stack.ts's RoofingCrm dashboard and alarm, tests/agent's golden-harness
// publisher). Deliberately imports nothing, so the CDK app can load it through the
// `@crm/observability/metric-names` subpath without pulling Powertools into a synth
// (test/metricNames.test.ts pins that). Metric names are constants here, never inline string
// literals at a call site (tasks.md T011). specs/009-agent-hardening/contracts/observability.md
// documents the same names, units and dimensions.

export const METRICS_NAMESPACE = "RoofingCrm";

export const METRIC_NAMES = {
  SyncDurationMs: "SyncDurationMs",
  IndexColdLoadMs: "IndexColdLoadMs",
  IndexManifestAgeHours: "IndexManifestAgeHours",
  LeadsCreated: "LeadsCreated",
  LeadsStatusUpdated: "LeadsStatusUpdated",
  LeadsAssigned: "LeadsAssigned",
  LeadsNoteAdded: "LeadsNoteAdded",
  LeadsRead: "LeadsRead",
  LeadsListed: "LeadsListed",
  LeadsUndone: "LeadsUndone",
  LeadsErrors: "LeadsErrors",
  // B-09 T046 (US2, contracts/observability.md agent-metrics table): the full agent metric set,
  // namespace `RoofingCrm`, emitted from apps/api/src/routers/agent.ts and
  // apps/api/src/agent/composeAnswer.ts per real `agent.ask` call. No per-`property_cid`
  // dimension anywhere (high-cardinality, unsuitable for a CloudWatch dashboard).
  AgentAsksTotal: "AgentAsksTotal",
  AgentAnswerLatencyMs: "AgentAnswerLatencyMs",
  AgentModelCallsTotal: "AgentModelCallsTotal",
  AgentCitationsTotal: "AgentCitationsTotal",
  AgentCitationsVerified: "AgentCitationsVerified",
  AgentCitationGroundednessRate: "AgentCitationGroundednessRate",
  AgentLeadsProposed: "AgentLeadsProposed",
  // B-09 T054: published by the golden harness (tests/agent/publishGoldenQueryPassRate.ts) after
  // a real run against the hosted runtime, never by a Lambda. No dimensions.
  GoldenQueryPassRate: "GoldenQueryPassRate",
} as const;
export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

/** The Powertools `serviceName` apps/api's agent router flushes under — it becomes the `service`
 *  dimension on every agent metric. */
export const API_SERVICE_NAME = "crm-api";

/** The one dimension set every agent metric is flushed under. Powertools adds `service` as a
 *  default dimension; agent.ts adds `outcome` before its single flush per `agent.ask`, and a flush
 *  applies its dimensions to every stored metric, so the citation/lead metrics composeAnswer.ts
 *  stores earlier in the same call carry `outcome` too. A CloudWatch metric is identified by its
 *  full dimension set: a read that names any other set (e.g. no dimensions, or `procedure`) sees
 *  no data at all. */
export const AGENT_METRIC_DIMENSIONS = ["service", "outcome"] as const;

/** The AgentAnswer outcomes whose path can record a non-zero citation count (composeAnswer.ts:
 *  only the composed path verifies citations; every other outcome records 0 of 0). The
 *  groundedness alarm reads exactly these, because a metric-math alarm can't use SEARCH and is
 *  capped at 10 metrics. */
export const AGENT_CITING_OUTCOMES = ["answered", "empty_in_scope"] as const;
