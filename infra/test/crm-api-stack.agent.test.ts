// B-09 review fixes (CR findings 1 + 2): the tRPC Lambda's nested-timeout layering and its
// least-privilege Bedrock grant. ADR-06 §6.1 / architecture-constitution.md §8: the agent aborts
// server-side at 23 s, the Lambda times out at 28 s, the HTTP API limit is 30 s. `AI_PROVIDER=bedrock`
// is the default, so the Lambda must be able to invoke the configured cross-region inference
// profile — and nothing broader: the profile ARN in this account/region, plus the foundation-model
// ARNs that profile routes to, only when called through that profile.
//
// `aws:cdk:bundling-stacks: []` skips the Docker-bundled DuckDB asset build (stacks.test.ts pays
// that once already); these assertions only read the synthesized IAM/Lambda properties.
import { App, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
// The shared turn limit is a dependency-free constant file; importing it by path keeps the CDK
// workspace free of an app-package dependency (the stack itself never imports app code).
import { AGENT_TURN_LIMIT_MS } from "../../packages/shared/src/agent/limits.js";
import { CrmApiStack, TRPC_LAMBDA_TIMEOUT_SECONDS } from "../lib/crm-api-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const HEALTH_ENTRY = new URL("../../apps/api/src/handlers/health.ts", import.meta.url).pathname;
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

function build(aiProvider: string, agentModelId: string): { stack: Stack; template: Template } {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
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
    aiProvider,
    agentModelId,
  });
  return { stack, template: Template.fromStack(stack) };
}

type Statement = {
  Effect: string;
  Action: string | string[];
  Resource: unknown;
  Condition?: Record<string, Record<string, unknown>>;
};

function bedrockStatements(template: Template): Statement[] {
  const policies = template.findResources("AWS::IAM::Policy");
  return Object.values(policies).flatMap((p) =>
    (p.Properties.PolicyDocument.Statement as Statement[]).filter((s) =>
      (Array.isArray(s.Action) ? s.Action : [s.Action]).some((a) => a.startsWith("bedrock:")),
    ),
  );
}

describe("CrmApi tRPC Lambda — agent runtime limits (CR finding 1)", () => {
  it("times out at 28 s (inside the 30 s HTTP API, outside the 23 s server abort) with 2048 MB (GAP-1 headroom)", () => {
    const { template } = build("bedrock", "eu.anthropic.claude-sonnet-4-6");
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "crm-api-trpc",
      Timeout: 28,
      MemorySize: Match.anyValue(),
    });
    const fn = Object.values(template.findResources("AWS::Lambda::Function")).find(
      (r) => r.Properties.FunctionName === "crm-api-trpc",
    );
    expect(fn?.Properties.MemorySize).toBe(2048);
  });

  it("nests the shared 23 s agent turn limit inside the Lambda timeout, itself inside the 30 s HTTP API", () => {
    // At least 3 s between the server abort and the Lambda timeout: room to reconcile spend,
    // record the thread turn and return the typed `timed_out` answer before the Lambda is killed.
    const MIN_MARGIN_MS = 3_000;
    const HTTP_API_LIMIT_MS = 30_000;
    const lambdaMs = TRPC_LAMBDA_TIMEOUT_SECONDS * 1000;
    expect(AGENT_TURN_LIMIT_MS + MIN_MARGIN_MS).toBeLessThanOrEqual(lambdaMs);
    expect(lambdaMs).toBeLessThanOrEqual(HTTP_API_LIMIT_MS);
  });
});

describe("CrmApi tRPC Lambda — Bedrock least-privilege grant (CR finding 2)", () => {
  it("grants InvokeModel(+WithResponseStream) on exactly the configured inference profile ARN", () => {
    const { template } = build("bedrock", "eu.anthropic.claude-sonnet-4-6");
    const statements = bedrockStatements(template);
    const profile = statements.find(
      (s) => JSON.stringify(s.Resource).includes("inference-profile/") && s.Condition === undefined,
    );
    expect(profile).toBeDefined();
    expect([profile?.Action].flat().sort()).toEqual([
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]);
    expect(JSON.stringify(profile?.Resource)).toContain(
      "arn:aws:bedrock:eu-north-1:515618610572:inference-profile/eu.anthropic.claude-sonnet-4-6",
    );
  });

  it("grants the underlying foundation model only in the EU regions the profile routes to, and only via that profile", () => {
    const { template } = build("bedrock", "eu.anthropic.claude-sonnet-4-6");
    const statements = bedrockStatements(template);
    const fm = statements.find((s) => JSON.stringify(s.Resource).includes("foundation-model/"));
    expect(fm).toBeDefined();
    const resources = [fm?.Resource].flat() as string[];
    expect(resources.sort()).toEqual(
      ["eu-central-1", "eu-north-1", "eu-south-1", "eu-south-2", "eu-west-1", "eu-west-3"]
        .map((r) => `arn:aws:bedrock:${r}::foundation-model/anthropic.claude-sonnet-4-6`)
        .sort(),
    );
    expect(resources.some((r) => r.includes("*"))).toBe(false);
    expect(JSON.stringify(fm?.Condition)).toContain("bedrock:InferenceProfileArn");
    expect(JSON.stringify(fm?.Condition)).toContain(
      "inference-profile/eu.anthropic.claude-sonnet-4-6",
    );
  });

  it("never grants bedrock:* or a wildcard resource", () => {
    const { template } = build("bedrock", "eu.anthropic.claude-sonnet-4-6");
    for (const s of bedrockStatements(template)) {
      expect([s.Action].flat()).not.toContain("bedrock:*");
      expect(JSON.stringify(s.Resource)).not.toMatch(/"\*"/);
    }
  });

  it("takes the model id from config, never a hard-coded one", () => {
    const { template } = build("bedrock", "eu.anthropic.claude-sonnet-4-5-20250929-v1:0");
    const json = JSON.stringify(bedrockStatements(template));
    expect(json).toContain("inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(json).toContain("foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(json).not.toContain("claude-sonnet-4-6");
  });

  it("adds no Bedrock grant on the gateway path, and refuses to synth it until the Gateway key is wired from Secrets Manager", () => {
    const { stack, template } = build("gateway", "anthropic/claude-sonnet-4.6");
    expect(bedrockStatements(template)).toHaveLength(0);
    Annotations.fromStack(stack).hasError(
      "*",
      Match.stringLikeRegexp("AI_PROVIDER=gateway.*Secrets Manager"),
    );
  });
});
