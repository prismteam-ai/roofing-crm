// T007B: a second line of defense (architecture-constitution.md §7, espeon P0-1) alongside never
// calling Task A's APIs in code. Names Task A's *actual* deployed resource ARN patterns, read
// directly from the shared AWS account (eu-north-1, account 515618610572) rather than invented:
// S3 bucket `countylensdata-cidcopy*` and every SSM parameter under `/countylens/*`
// (ssm:DescribeParameters, checked 2026-10-23 — see specs/001-crm-shell/run-log.md). Task A has
// no DynamoDB tables yet, so no table Deny is needed today; this statement is re-checked whenever
// Task A's footprint changes (ARD-B §13 "Accepted deviations" pattern).
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Stack } from "aws-cdk-lib";

export function taskADenyStatement(stack: Stack): PolicyStatement {
  return new PolicyStatement({
    sid: "DenyTaskAResources",
    effect: Effect.DENY,
    actions: ["s3:*", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
    resources: [
      // Task A's CID-copy bucket (CloudFront origin), every object in it.
      `arn:${stack.partition}:s3:::countylensdata-*`,
      `arn:${stack.partition}:s3:::countylensdata-*/*`,
      // Task A's SSM parameter namespace (architecture-constitution.md § 7: "no reading
      // /countylens/* SSM parameters").
      `arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter/countylens/*`,
    ],
  });
}
