import { App, Tags } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { expect, test } from "vitest";
import { CrmStack, PROJECT_TAG } from "../lib/crm-stack.ts";

function synth(alarmEmail?: string) {
  const app = new App();
  const stack = new CrmStack(app, "RoofingCrm", {
    env: { account: "111111111111", region: "us-east-2" },
    root: "/repo",
    bundle: false,
    oracleUrl: "https://oracle.example.com/",
    oracleMcpUrl: "https://oracle.example.com/mcp",
    oracleManifestCid: "bafkreitest",
    anthropicKeyParam: "/roofing/anthropic-key",
    agentModel: "claude-sonnet-5-5",
    agentDailyTokens: 500_000,
    agentPerIpPerMinute: 10,
    leadCreatesPerDay: 200,
    monthlyBudgetUsd: 5,
    alarmEmail,
  });
  Tags.of(app).add("project_name", PROJECT_TAG);
  return { stack, t: Template.fromStack(stack) };
}

const tagList = (tags: unknown) =>
  Array.isArray(tags) ? tags : Object.entries((tags as object) ?? {}).map(([Key, Value]) => ({ Key, Value }));

test("stack: region us-east-2, every taggable resource tagged project_name", () => {
  const { stack, t } = synth("ops@example.com");
  expect(stack.region).toBe("us-east-2");
  for (const type of [
    "AWS::Lambda::Function",
    "AWS::DynamoDB::Table",
    "AWS::SNS::Topic",
    "AWS::Amplify::App",
  ]) {
    const found = Object.values(t.findResources(type));
    expect(found.length, type).toBeGreaterThan(0);
    for (const r of found)
      expect(tagList((r as any).Properties.Tags), type).toContainEqual({
        Key: "project_name",
        Value: PROJECT_TAG,
      });
  }
});

test("stack: on-demand table with TTL and GSI1; API behind the HTTP API; agent on a Function URL", () => {
  const { t } = synth();
  t.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    GlobalSecondaryIndexes: [Match.objectLike({ IndexName: "GSI1" })],
  });
  t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "ANY /trpc/{proxy+}" });
  t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "GET /health" });
  t.hasResourceProperties("AWS::Lambda::Url", {
    AuthType: "NONE",
    Cors: Match.objectLike({ AllowMethods: ["POST"] }),
  });
  t.hasResourceProperties("AWS::Lambda::Function", { Timeout: 60 }); // agent: beyond API Gateway's 30 s
  t.hasResourceProperties("AWS::Lambda::Function", { Timeout: 29 }); // API
});

test("stack: Amplify proxies /trpc to the API (first-party cookie) and serves the SPA", () => {
  const { t } = synth();
  const app = Object.values(t.findResources("AWS::Amplify::App"))[0] as any;
  const rules = app.Properties.CustomRules;
  expect(rules[0]).toMatchObject({ Source: "/trpc/<*>", Status: "200" });
  expect(JSON.stringify(rules[0].Target)).toContain("/trpc/<*>");
  expect(rules.at(-1)).toMatchObject({ Target: "/index.html", Status: "200" });
  t.hasResourceProperties("AWS::Amplify::Branch", { BranchName: "main", Stage: "PRODUCTION" });
});

test("stack: the Claude key comes from SSM, never a plain env value", () => {
  const { t } = synth();
  for (const r of Object.values(t.findResources("AWS::Lambda::Function"))) {
    const vars = (r as any).Properties.Environment.Variables;
    expect(vars.ANTHROPIC_API_KEY).toBeUndefined();
    expect(vars.ANTHROPIC_API_KEY_PARAM).toBe("/roofing/anthropic-key");
    expect(vars.CRM_AGENT_MODEL).toBe("claude-sonnet-5-5");
  }
  const statements = Object.values(t.findResources("AWS::IAM::Policy")).flatMap(
    (p: any) => p.Properties.PolicyDocument.Statement,
  );
  const ssm = statements.filter((s: any) => s.Action === "ssm:GetParameter");
  expect(ssm).toHaveLength(1); // the agent only
  expect(JSON.stringify(ssm[0].Resource)).toContain(":parameter/roofing/anthropic-key");
});

test("stack: error, 5xx and agent-budget alarms notify SNS email; monthly budget alarm exists", () => {
  const { t } = synth("ops@example.com");
  t.resourceCountIs("AWS::CloudWatch::Alarm", 4);
  t.hasResourceProperties("AWS::CloudWatch::Alarm", {
    MetricName: "AgentTokens",
    Namespace: "RoofingCrm",
    Threshold: 400_000,
  });
  t.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "ops@example.com" });
  t.hasResourceProperties("AWS::Budgets::Budget", {
    Budget: Match.objectLike({ BudgetLimit: { Amount: 5, Unit: "USD" } }),
  });
});
