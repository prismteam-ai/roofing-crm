// leads.undoCreate adds exactly one DynamoDB action on the leads table, DeleteItem, scoped to the
// table ARN (not the indexes); leads.presence's BatchGetItem is already inside the read grant.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const HEALTH_ENTRY = new URL("../../apps/api/src/handlers/health.ts", import.meta.url).pathname;
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

type Statement = { Effect: string; Action: string | string[]; Resource: unknown };

function statements(): Statement[] {
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
    aiProvider: "bedrock",
    agentModelId: "eu.anthropic.claude-sonnet-4-6",
  });
  const policies = Template.fromStack(stack).findResources("AWS::IAM::Policy");
  return Object.values(policies).flatMap(
    (p) => p.Properties.PolicyDocument.Statement as Statement[],
  );
}
const actionsOf = (s: Statement): string[] => (Array.isArray(s.Action) ? s.Action : [s.Action]);
const text = (s: Statement): string => JSON.stringify(s.Resource);

describe("CrmApi leads table grants", () => {
  it("DeleteItem appears exactly once, alone, on the crm-leads table ARN and no index ARN", () => {
    const deletes = statements().filter((s) => actionsOf(s).includes("dynamodb:DeleteItem"));
    const onLeads = deletes.filter((s) => text(s).includes("crm-leads"));
    expect(onLeads).toHaveLength(1);
    const only = onLeads[0] as Statement;
    expect(actionsOf(only)).toEqual(["dynamodb:DeleteItem"]);
    expect(only.Effect).toBe("Allow");
    expect(text(only)).not.toContain("index/");
  });

  it("BatchGetItem on the leads table comes from the existing read grant (no new statement)", () => {
    const batch = statements().filter(
      (s) => actionsOf(s).includes("dynamodb:BatchGetItem") && text(s).includes("crm-leads"),
    );
    expect(batch.length).toBeGreaterThan(0);
  });

  it("no other action on the leads table allows Delete, Scan-free writes stay Put/Update/Check", () => {
    const writes = statements()
      .filter((s) => text(s).includes("crm-leads"))
      .flatMap(actionsOf)
      .filter((a) => /Delete|BatchWrite|Update|Put/.test(a));
    expect(new Set(writes)).toEqual(
      new Set(["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]),
    );
  });
});
