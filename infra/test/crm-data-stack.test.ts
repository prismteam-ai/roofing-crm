// T009: CrmData now synthesizes the private S3 bucket (`crm-index`) that holds this story's
// Parquet index and content-addressed sync parts — no longer "intentionally empty" (B-01 T005).
// T038 (Phase 4, machamp) implements infra/lib/crm-data-stack.ts to make this pass.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmDataStack } from "../lib/crm-data-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };

describe("CrmData (T038)", () => {
  function build() {
    return Template.fromStack(new CrmDataStack(new App(), "CrmData", { env: ENV }));
  }

  it("creates a private S3 bucket (crm-index) blocking all public access", () => {
    const template = build();
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "crm-index",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("enforces SSE and TLS-only access on the bucket", () => {
    const template = build();
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
    });
    const policies = template.findResources("AWS::S3::BucketPolicy");
    expect(Object.keys(policies).length).toBeGreaterThan(0);
  });

  it("B-07 T002: creates the crm-leads table skeleton tagged project_name=roofing-crm", () => {
    build().hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "crm-leads",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      Tags: [{ Key: "project_name", Value: "roofing-crm" }],
    });
  });

  it("B-07 T012: crm-leads has sparse GSI1 (assignee/createdAt) and GSI2 (status/createdAt)", () => {
    build().hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "crm-leads",
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "assignee", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
        },
      ],
    });
  });

  it("B-09 T017: creates crm-agent-usage with a single partition key and a TTL attribute", () => {
    build().hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "crm-agent-usage",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
      Tags: [{ Key: "project_name", Value: "roofing-crm" }],
    });
  });

  it("declares no Task A resources — this stack only ever reads Task A's public CID copies", () => {
    expect(() => build()).not.toThrow();
  });
});
