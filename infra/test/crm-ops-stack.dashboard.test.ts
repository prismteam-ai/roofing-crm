// T051/T053/T055 (B-09, AC-6, contracts/observability.md): `CrmOpsStack` creates the `RoofingCrm`
// dashboard and the groundedness alarm. B-09 review fix (porygon Critical): both must read the
// dimension set the API actually emits — `[service, outcome]`, pinned against real Powertools
// output in packages/observability/test/metricNames.test.ts — never `procedure` (never emitted)
// and never "no dimensions" (a different metric in CloudWatch's eyes, so it would see no data and
// the alarm could never fire). DashboardBody is one Fn::Join'ed JSON string, so the widget
// assertions read its rendered text.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AGENT_CITING_OUTCOMES,
  API_SERVICE_NAME,
  METRIC_NAMES,
  METRICS_NAMESPACE,
} from "@crm/observability/metric-names";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

function build(): Template {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  // The DLQ/alarm/topic props are optional; the real wiring (infra/src/app.ts) supplies them.
  const stack = new CrmOpsStack(app, "CrmOps", {
    env: ENV,
    lockoutHandlerEntry: LOCKOUT_ENTRY,
  });
  return Template.fromStack(stack);
}

/** The dashboard body as plain text: the Fn::Join's string fragments concatenated. */
function dashboardBody(template: Template): string {
  const [dashboard] = Object.values(
    template.findResources("AWS::CloudWatch::Dashboard") as Record<
      string,
      { Properties: { DashboardBody: unknown } }
    >,
  );
  const body = dashboard?.Properties.DashboardBody;
  if (typeof body === "string") return body;
  const join = (body as { "Fn::Join": [string, unknown[]] })["Fn::Join"];
  return join[1].map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join("");
}

type AlarmMetric = {
  Id: string;
  Expression?: string;
  ReturnData?: boolean;
  MetricStat?: {
    Metric: {
      Namespace: string;
      MetricName: string;
      Dimensions?: { Name: string; Value: string }[];
    };
    Stat: string;
  };
};

function groundednessAlarm(template: Template): {
  Threshold: number;
  ComparisonOperator: string;
  Metrics?: AlarmMetric[];
  MetricName?: string;
} {
  const alarms = template.findResources("AWS::CloudWatch::Alarm", {
    Properties: { AlarmName: "crm-agent-citation-groundedness" },
  }) as Record<string, { Properties: ReturnType<typeof groundednessAlarm> }>;
  const [alarm] = Object.values(alarms);
  if (alarm === undefined) throw new Error("no groundedness alarm");
  return alarm.Properties;
}

const searchOf = (metricName: string): string =>
  `{${METRICS_NAMESPACE},service,outcome} MetricName="${metricName}" service="${API_SERVICE_NAME}"`;

describe("CrmOpsStack dashboard + groundedness alarm (T051/T053/T055)", () => {
  let template: Template;
  let body: string;

  beforeAll(() => {
    template = build();
    body = dashboardBody(template);
  }, 120_000);

  it("creates a CloudWatch dashboard named RoofingCrm", () => {
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardName: "RoofingCrm",
    });
  });

  it("never reads a dimension the API does not emit (no `procedure`)", () => {
    expect(body).not.toContain("procedure");
    expect(body).not.toContain("agent.ask");
  });

  it("graphs answer latency p95 over the emitted {service, outcome} set, one line per outcome", () => {
    // JSON-escaped inside the dashboard body, hence the \\" form.
    const expr = `SEARCH('${searchOf(METRIC_NAMES.AgentAnswerLatencyMs)}', 'p95', 300)`;
    expect(body).toContain(JSON.stringify(expr).slice(1, -1));
  });

  it("graphs asks by outcome (AgentAsksTotal Sum split by `outcome`)", () => {
    const expr = `SEARCH('${searchOf(METRIC_NAMES.AgentAsksTotal)}', 'Sum', 300)`;
    expect(body).toContain(JSON.stringify(expr).slice(1, -1));
    expect(body).toContain("Agent asks by outcome");
  });

  it("graphs groundedness as Sum(verified) / Sum(total) x 100 across every outcome, not an average of per-answer rates", () => {
    const verified = `SUM(SEARCH('${searchOf(METRIC_NAMES.AgentCitationsVerified)}', 'Sum', 300))`;
    const total = `SUM(SEARCH('${searchOf(METRIC_NAMES.AgentCitationsTotal)}', 'Sum', 300))`;
    expect(body).toContain(JSON.stringify(`100 * ${verified} / ${total}`).slice(1, -1));
    expect(body).not.toContain(METRIC_NAMES.AgentCitationGroundednessRate);
  });

  it("graphs the golden-query pass rate from the shared metric-name constant", () => {
    expect(body).toContain(`"${METRIC_NAMES.GoldenQueryPassRate}"`);
  });

  it("alarms on the citation ratio of the citing outcomes, each read with its real [service, outcome] dimensions", () => {
    const alarm = groundednessAlarm(template);
    expect(alarm.MetricName).toBeUndefined();
    expect(alarm.Threshold).toBe(100);
    expect(alarm.ComparisonOperator).toBe("LessThanThreshold");
    const metrics = alarm.Metrics ?? [];

    const returned = metrics.filter((m) => m.ReturnData !== false);
    expect(returned).toHaveLength(1);
    // IF(total > 0, ...): 0-of-0 periods produce no datapoint (missing = not breaching), never 0%.
    expect(returned[0]?.Expression).toMatch(/^IF\(/);

    const stats = metrics.filter((m) => m.MetricStat !== undefined);
    // Metric-math alarms accept at most 10 metrics.
    expect(stats.length).toBeLessThanOrEqual(10);
    const read = stats.map((m) => ({
      name: m.MetricStat?.Metric.MetricName,
      stat: m.MetricStat?.Stat,
      namespace: m.MetricStat?.Metric.Namespace,
      dims: Object.fromEntries(
        (m.MetricStat?.Metric.Dimensions ?? []).map((d) => [d.Name, d.Value]),
      ),
    }));
    for (const outcome of AGENT_CITING_OUTCOMES) {
      for (const name of [METRIC_NAMES.AgentCitationsVerified, METRIC_NAMES.AgentCitationsTotal]) {
        expect(read).toContainEqual({
          name,
          stat: "Sum",
          namespace: METRICS_NAMESPACE,
          dims: { service: API_SERVICE_NAME, outcome },
        });
      }
    }
    expect(read).toHaveLength(AGENT_CITING_OUTCOMES.length * 2);
  });
});
