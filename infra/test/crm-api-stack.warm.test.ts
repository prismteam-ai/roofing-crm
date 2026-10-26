// Keep-warm schedule and the wired-but-off AI Gateway secret grant on the tRPC Lambda.
//   - An EventBridge rule invokes crm-api-trpc every 5 minutes with { source: "crm.warm" }; the
//     invoke permission is for that one rule only; the flag `crm:keepWarm` (default true) turns the
//     rule on or off.
//   - `AI_PROVIDER=gateway` synthesizes only when `crm:aiGatewaySecretArn` names the secret; the
//     Lambda then gets GetSecretValue on that one secret and its ARN in an env var (never the key).
//   `aws:cdk:bundling-stacks: []` skips the Docker-bundled DuckDB asset build.
import { App } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const HEALTH_ENTRY = new URL("../../apps/api/src/handlers/health.ts", import.meta.url).pathname;
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;
const SECRET_ARN = "arn:aws:secretsmanager:eu-north-1:515618610572:secret:crm/ai-gateway-AbCdEf";

function build(
  options: {
    context?: Record<string, unknown>;
    aiProvider?: string;
    agentModelId?: string;
  } = {},
) {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], ...options.context } });
  const ops = new CrmOpsStack(app, "CrmOps", { env: ENV, lockoutHandlerEntry: LOCKOUT_ENTRY });
  const stack = new CrmApiStack(app, "CrmApi", {
    env: ENV,
    healthHandlerEntry: HEALTH_ENTRY,
    userPool: ops.userPool,
    userPoolClient: ops.userPoolClient,
    lockoutTable: ops.lockoutTable,
    indexBucketName: "crm-index",
    leadsTableName: "crm-leads",
    agentUsageTableName: "crm-agent-usage",
    aiProvider: options.aiProvider ?? "bedrock",
    agentModelId: options.agentModelId ?? "eu.anthropic.claude-sonnet-4-6",
  });
  return { stack, template: Template.fromStack(stack) };
}

describe("CrmApi keep-warm schedule", () => {
  it("invokes crm-api-trpc every 5 minutes with the internal warm event, once, and is enabled by default", () => {
    const { template } = build();
    template.resourceCountIs("AWS::Events::Rule", 1);
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "rate(5 minutes)",
      State: "ENABLED",
      Targets: [
        Match.objectLike({
          Input: JSON.stringify({ source: "crm.warm" }),
          RetryPolicy: { MaximumRetryAttempts: 0 },
        }),
      ],
    });
  });

  it("is disabled (rule kept, state DISABLED) when crm:keepWarm is false, as boolean or string", () => {
    for (const value of [false, "false"]) {
      const { template } = build({ context: { "crm:keepWarm": value } });
      template.hasResourceProperties("AWS::Events::Rule", { State: "DISABLED" });
    }
  });

  it("is enabled when crm:keepWarm is true, as boolean or string", () => {
    for (const value of [true, "true"]) {
      const { template } = build({ context: { "crm:keepWarm": value } });
      template.hasResourceProperties("AWS::Events::Rule", { State: "ENABLED" });
    }
  });

  it("grants the invoke permission to events.amazonaws.com for that one rule only", () => {
    const { template } = build();
    const permissions = Object.values(template.findResources("AWS::Lambda::Permission")).filter(
      (p) => p.Properties.Principal === "events.amazonaws.com",
    );
    expect(permissions).toHaveLength(1);
    expect(permissions[0]?.Properties.Action).toBe("lambda:InvokeFunction");
    expect(permissions[0]?.Properties.SourceArn).toBeDefined();
  });

  it("adds no wildcard IAM statement for the schedule", () => {
    const { template } = build();
    const rules = Object.values(template.findResources("AWS::Events::Rule"));
    expect(JSON.stringify(rules)).not.toContain('"*"');
  });
});

describe("CrmApi AI Gateway secret (wired, off by default)", () => {
  it("bedrock (the default) has no Secrets Manager statement and no secret env var", () => {
    const { template } = build();
    expect(JSON.stringify(template.toJSON())).not.toContain("secretsmanager:");
    expect(JSON.stringify(template.toJSON())).not.toContain("AI_GATEWAY_SECRET_ARN");
  });

  it("bedrock ignores the secret context entirely", () => {
    const { template } = build({ context: { "crm:aiGatewaySecretArn": SECRET_ARN } });
    expect(JSON.stringify(template.toJSON())).not.toContain("secretsmanager:");
  });

  it("gateway without the context still fails synth with a clear message naming the context key", () => {
    const { stack } = build({ aiProvider: "gateway", agentModelId: "anthropic/claude-sonnet-4.6" });
    Annotations.fromStack(stack).hasError(
      "*",
      Match.stringLikeRegexp("AI_PROVIDER=gateway.*Secrets Manager.*crm:aiGatewaySecretArn"),
    );
  });

  it("gateway with the context grants GetSecretValue on that one secret, passes only its ARN, and adds no Bedrock grant", () => {
    const { stack, template } = build({
      aiProvider: "gateway",
      agentModelId: "anthropic/claude-sonnet-4.6",
      context: { "crm:aiGatewaySecretArn": SECRET_ARN },
    });
    expect(Annotations.fromStack(stack).findError("*", Match.anyValue())).toHaveLength(0);
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "crm-api-trpc",
      Environment: {
        Variables: Match.objectLike({
          AI_PROVIDER: "gateway",
          AI_GATEWAY_SECRET_ARN: SECRET_ARN,
        }),
      },
    });
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Resource: unknown }[],
    );
    const secretStatements = statements.filter((s) =>
      (Array.isArray(s.Action) ? s.Action : [s.Action]).some(
        (a) => typeof a === "string" && a.startsWith("secretsmanager:"),
      ),
    );
    expect(secretStatements).toHaveLength(1);
    expect(secretStatements[0]?.Action).toBe("secretsmanager:GetSecretValue");
    expect(secretStatements[0]?.Resource).toBe(SECRET_ARN);
    expect(JSON.stringify(statements)).not.toContain("bedrock:");
    // the key itself is never an env literal
    expect(JSON.stringify(template.toJSON())).not.toMatch(/AI_GATEWAY_API_KEY/);
  });

  it("rejects a context value that is not a Secrets Manager secret ARN", () => {
    const { stack } = build({
      aiProvider: "gateway",
      agentModelId: "anthropic/claude-sonnet-4.6",
      context: { "crm:aiGatewaySecretArn": "not-an-arn" },
    });
    Annotations.fromStack(stack).hasError("*", Match.stringLikeRegexp("crm:aiGatewaySecretArn"));
  });
});
