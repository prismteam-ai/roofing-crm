// B-09 T054 (US3; contracts/observability.md "Continuous AC-4 check" layer 3; agent-design.md
// porygon §4): publishes `GoldenQueryPassRate` (namespace `RoofingCrm`, the same namespace every
// other agent metric already uses — packages/observability/src/index.ts's `METRICS_NAMESPACE`)
// so the `RoofingCrm` dashboard's golden-query widget (infra/lib/crm-ops-stack.ts T053) reflects
// the last real harness run instead of only a green/red CI badge with no visible trend.
//
// A thin, reusable function rather than inline PutMetricData calls in golden.test.ts, so a CI
// wrapper step can also call it after a scheduled (non-Vitest) re-run of the same harness, per
// this task's own "(or a thin wrapper script run after it in CI)" allowance.
//
// golden.test.ts calls it at the end of every real run against the hosted runtime, guarded by
// `shouldPublishGoldenQueryPassRate` below: only when the harness actually ran (RUNTIME_URL and the
// Cognito test login are set) and AWS credentials are present. Metric name and namespace are the
// shared constants the dashboard reads (`@crm/observability/metric-names`), never a literal here.
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { METRIC_NAMES, METRICS_NAMESPACE } from "@crm/observability/metric-names";

/** The environment variables the AWS SDK's default credential chain reads credentials (or where
 *  to get them) from. Present = this machine/CI job can reach CloudWatch. */
const AWS_CREDENTIAL_ENV_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_PROFILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
] as const;

/** The golden harness's publish guard: publish only after a real run (`harnessRan`), only with AWS
 *  credentials configured, and never when `CRM_PUBLISH_GOLDEN_METRIC=false` opts out. A run
 *  without credentials still gates the merge; it just has no trend datapoint to add. */
export function shouldPublishGoldenQueryPassRate(input: {
  readonly harnessRan: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
}): boolean {
  if (!input.harnessRan) return false;
  if (input.env.CRM_PUBLISH_GOLDEN_METRIC === "false") return false;
  return AWS_CREDENTIAL_ENV_VARS.some((name) => (input.env[name] ?? "") !== "");
}

export interface GoldenQueryPassRateInput {
  /** How many of the `repeats * queries.length` individual golden-query assertions in this run
   *  passed, out of the total attempted -- not "all queries in one run pass/fail together" (a
   *  single repeat hitting a transient timeout on one query should move the rate, not zero it). */
  readonly passedCount: number;
  readonly totalCount: number;
  /** Defaults to the real CloudWatch client; overridable in a unit test so no AWS call is ever
   *  made outside a real CI/scheduled run (publishGoldenQueryPassRate.test.ts stubs it). */
  readonly client?: Pick<CloudWatchClient, "send">;
  readonly region?: string;
}

/** `Verified/Total`, matching `AgentCitationGroundednessRate`'s own `Verified/Total` shape
 *  (packages/observability/src/index.ts's METRIC_NAMES comment) so both are read the same way on
 *  the dashboard: a percentage, 0-100, never a raw pass/fail count. */
export function goldenQueryPassRatePercent(passedCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    throw new Error("publishGoldenQueryPassRate: totalCount must be > 0");
  }
  return (passedCount / totalCount) * 100;
}

export async function publishGoldenQueryPassRate(input: GoldenQueryPassRateInput): Promise<void> {
  const client =
    input.client ??
    new CloudWatchClient(input.region === undefined ? {} : { region: input.region });
  const value = goldenQueryPassRatePercent(input.passedCount, input.totalCount);
  await client.send(
    new PutMetricDataCommand({
      Namespace: METRICS_NAMESPACE,
      MetricData: [
        {
          MetricName: METRIC_NAMES.GoldenQueryPassRate,
          Value: value,
          Unit: StandardUnit.Percent,
          Timestamp: new Date(),
        },
      ],
    }),
  );
}
