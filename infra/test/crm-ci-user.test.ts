// B-09: the GitHub Actions CI user (infra/lib/crm-ci-user.ts) has exactly the two approved uses
// (B-07 lead cleanup on crm-leads lead partitions, GoldenQueryPassRate in RoofingCrm), the Task A
// Deny, and its key only in Secrets Manager, never in an Output.
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmDataStack } from "../lib/crm-data-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };

function build(): Template {
  return Template.fromStack(new CrmDataStack(new App(), "CrmData", { env: ENV }));
}

interface Statement {
  readonly Sid?: string;
  readonly Effect: string;
  readonly Action: string | string[];
  readonly Resource: unknown;
  readonly Condition?: Record<string, Record<string, unknown>>;
}

function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing: ${what}`);
  return value;
}

function ciPolicyStatements(template: Template): Statement[] {
  const userId = Object.keys(template.findResources("AWS::IAM::User"))[0];
  const policies = Object.values(
    template.findResources("AWS::IAM::Policy", {
      Properties: { Users: [{ Ref: userId }] },
    }),
  ) as { Properties: { PolicyDocument: { Statement: Statement[] } } }[];
  expect(policies).toHaveLength(1);
  return defined(policies[0], "CI policy").Properties.PolicyDocument.Statement;
}

const TABLE_ARN = { "Fn::GetAtt": [Match.stringLikeRegexp("^LeadsTable"), "Arn"] };
const LEAD_CONDITIONS = {
  "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["48453:tcad:*"] },
  "ForAllValues:StringEquals": { "dynamodb:Attributes": ["pk", "sk"] },
  Null: { "dynamodb:LeadingKeys": "false" },
};

describe("CrmData CI user (B-09)", () => {
  it("creates exactly one IAM user, crm-ci, with no managed policies or groups", () => {
    const template = build();
    template.resourceCountIs("AWS::IAM::User", 1);
    template.hasResourceProperties("AWS::IAM::User", {
      UserName: "crm-ci",
      ManagedPolicyArns: Match.absent(),
      Groups: Match.absent(),
    });
    template.resourceCountIs("AWS::IAM::AccessKey", 1);
  });

  it("grants exactly the two approved uses plus the Task A Deny, and nothing else", () => {
    const template = build();
    const statements = ciPolicyStatements(template);
    expect(statements.map((s) => s.Sid)).toEqual([
      "CiLeadsCleanupQuery",
      "CiLeadsCleanupDelete",
      "CiPutGoldenQueryMetric",
      "DenyTaskAResources",
    ]);
    const allowed = statements
      .filter((s) => s.Effect === "Allow")
      .flatMap((s) => [s.Action].flat())
      .sort();
    expect(allowed).toEqual([
      "cloudwatch:PutMetricData",
      "dynamodb:BatchWriteItem",
      "dynamodb:Query",
    ]);
  });

  it("scopes Query to the crm-leads table ARN, lead partitions, pk/sk only, SPECIFIC_ATTRIBUTES", () => {
    const template = build();
    const query = ciPolicyStatements(template).find((s) => s.Sid === "CiLeadsCleanupQuery");
    expect(query).toMatchObject({ Effect: "Allow", Action: "dynamodb:Query" });
    expect(defined(query, "query statement").Condition).toEqual({
      ...LEAD_CONDITIONS,
      StringEquals: { "dynamodb:Select": "SPECIFIC_ATTRIBUTES" },
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Sid: "CiLeadsCleanupQuery", Resource: TABLE_ARN }),
        ]),
      },
    });
  });

  it("scopes BatchWriteItem to the crm-leads table ARN (no index ARN), lead partitions only", () => {
    const template = build();
    const del = ciPolicyStatements(template).find((s) => s.Sid === "CiLeadsCleanupDelete");
    expect(del).toMatchObject({ Effect: "Allow", Action: "dynamodb:BatchWriteItem" });
    expect(defined(del, "delete statement").Condition).toEqual(LEAD_CONDITIONS);
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Sid: "CiLeadsCleanupDelete", Resource: TABLE_ARN }),
        ]),
      },
    });
    // The pattern cannot match the META#index pointer item's partition.
    const pattern = new RegExp(`^${"48453:tcad:*".replace("*", ".*")}$`);
    expect(pattern.test("META#index")).toBe(false);
  });

  it("limits PutMetricData to the RoofingCrm namespace", () => {
    const metric = ciPolicyStatements(build()).find((s) => s.Sid === "CiPutGoldenQueryMetric");
    expect(metric).toEqual({
      Sid: "CiPutGoldenQueryMetric",
      Effect: "Allow",
      Action: "cloudwatch:PutMetricData",
      Resource: "*",
      Condition: { StringEquals: { "cloudwatch:namespace": "RoofingCrm" } },
    });
  });

  it("carries the Task A explicit Deny (architecture-constitution.md § 7)", () => {
    const deny = ciPolicyStatements(build()).find((s) => s.Sid === "DenyTaskAResources");
    expect(deny?.Effect).toBe("Deny");
    expect(JSON.stringify(deny?.Resource)).toContain("countylensdata-");
    expect(JSON.stringify(deny?.Resource)).toContain("parameter/countylens/*");
  });

  it("stores the key pair in Secrets Manager roofing-crm/ci-user from the AccessKey's attributes", () => {
    const template = build();
    const secrets = template.findResources("AWS::SecretsManager::Secret", {
      Properties: { Name: "roofing-crm/ci-user" },
    });
    expect(Object.keys(secrets)).toHaveLength(1);
    const secretString = JSON.stringify(Object.values(secrets)[0]);
    const keyId = defined(
      Object.keys(template.findResources("AWS::IAM::AccessKey"))[0],
      "access key",
    );
    expect(secretString).toContain(`"Ref":"${keyId}"`);
    expect(secretString).toContain(`"Fn::GetAtt":["${keyId}","SecretAccessKey"]`);
    expect(secretString).toContain("accessKeyId");
    expect(secretString).toContain("secretAccessKey");
  });

  it("exposes neither the access key nor the secret in any Output", () => {
    const template = build();
    const keyId = defined(
      Object.keys(template.findResources("AWS::IAM::AccessKey"))[0],
      "access key",
    );
    const secretId = defined(
      Object.keys(template.findResources("AWS::SecretsManager::Secret"))[0],
      "secret",
    );
    const outputs = JSON.stringify(template.toJSON().Outputs ?? {});
    expect(outputs).not.toContain(keyId);
    expect(outputs).not.toContain(secretId);
    expect(outputs).not.toContain("SecretAccessKey");
  });
});
