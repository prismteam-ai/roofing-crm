// B-09: the one AWS principal GitHub Actions CI uses (repository secrets CRM_CI_AWS_ACCESS_KEY_ID /
// CRM_CI_AWS_SECRET_ACCESS_KEY, `e2e-hosted` job only). The organization's SCP blocks the GitHub
// OIDC identity provider, so a short-lived role is not available; the PO approved this dedicated
// IAM user with a long-lived key, scoped to exactly two uses and nothing else:
//   A. tests/e2e/lib/leads-cleanup.ts deletes the B-07 test leads: Query (pk = :pk, projection
//      pk, sk) and BatchWriteItem DeleteRequests on `crm-leads`, lead partitions only;
//   B. tests/agent/publishGoldenQueryPassRate.ts: cloudwatch:PutMetricData in `RoofingCrm` only.
// Plus the Task A explicit Deny every CRM principal carries (architecture-constitution.md § 7).
//
// The key pair goes straight into Secrets Manager `roofing-crm/ci-user` from the AccessKey's own
// attributes (CloudFormation Ref / GetAtt): it never appears as a literal in the template, never
// in an Output, never in a log. Rotate by bumping CI_ACCESS_KEY_SERIAL and redeploying (CloudFormation
// creates the new key, then deletes the old one), then copying the new pair into the GitHub secrets.
import { SecretValue, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { METRICS_NAMESPACE } from "@crm/observability/metric-names";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { taskADenyStatement } from "./task-a-deny.js";

export const CI_USER_NAME = "crm-ci";
export const CI_SECRET_NAME = "roofing-crm/ci-user";
/** Bump to rotate the CI key (see the header). */
export const CI_ACCESS_KEY_SERIAL = 1;
/** Every B-07 lead pk is `48453:tcad:{request_identifier}` (leads-cleanup.ts LEAD_KEY_PATTERN).
 *  The `META#index` pointer item and any other non-lead partition fall outside it. */
export const CI_LEAD_PARTITION_PATTERN = "48453:tcad:*";
/** The only attributes the cleanup names: the table's own key (no GSI is ever used). */
const LEAD_KEY_ATTRIBUTES = ["pk", "sk"];

export interface CrmCiUserProps {
  /** The `crm-leads` table ARN (a plain string: a concrete Table does not type-check as ITable
   *  under this repo's exactOptionalPropertyTypes). */
  readonly leadsTableArn: string;
}

export class CrmCiUser extends Construct {
  public readonly user: iam.User;
  public readonly secret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: CrmCiUserProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const tableArn = props.leadsTableArn;

    this.user = new iam.User(this, "User", { userName: CI_USER_NAME });

    // `ForAllValues` is vacuously true when the key is absent, so each statement also requires
    // dynamodb:LeadingKeys to be present (`Null: false`).
    const leadPartitionsOnly = {
      "ForAllValues:StringLike": { "dynamodb:LeadingKeys": [CI_LEAD_PARTITION_PATTERN] },
      "ForAllValues:StringEquals": { "dynamodb:Attributes": LEAD_KEY_ATTRIBUTES },
      Null: { "dynamodb:LeadingKeys": "false" },
    };

    const policy = new iam.Policy(this, "Policy", {
      statements: [
        // Reads only pk/sk of lead partitions. dynamodb:Attributes is evaluated only on the
        // attributes a request names, so Select must also be SPECIFIC_ATTRIBUTES (the cleanup
        // sends it explicitly) or a query without a projection would return whole items.
        new iam.PolicyStatement({
          sid: "CiLeadsCleanupQuery",
          effect: iam.Effect.ALLOW,
          actions: ["dynamodb:Query"],
          resources: [tableArn],
          conditions: {
            ...leadPartitionsOnly,
            StringEquals: { "dynamodb:Select": "SPECIFIC_ATTRIBUTES" },
          },
        }),
        // Deletes by key in lead partitions. BatchWriteItem has no Select/ReturnValues; the
        // Attributes limit also refuses a PutRequest that would write any non-key attribute.
        new iam.PolicyStatement({
          sid: "CiLeadsCleanupDelete",
          effect: iam.Effect.ALLOW,
          actions: ["dynamodb:BatchWriteItem"],
          resources: [tableArn],
          conditions: leadPartitionsOnly,
        }),
        // PutMetricData has no resource ARN (resource type "*" in the service authorization
        // reference); the namespace condition is the scope.
        new iam.PolicyStatement({
          sid: "CiPutGoldenQueryMetric",
          effect: iam.Effect.ALLOW,
          actions: ["cloudwatch:PutMetricData"],
          resources: ["*"],
          conditions: { StringEquals: { "cloudwatch:namespace": METRICS_NAMESPACE } },
        }),
        taskADenyStatement(stack),
      ],
    });
    this.user.attachInlinePolicy(policy);

    const accessKey = new iam.AccessKey(this, "AccessKey", {
      // fromUserName: a concrete User does not type-check as IUser under exactOptionalPropertyTypes.
      user: iam.User.fromUserName(this, "UserRef", this.user.userName),
      serial: CI_ACCESS_KEY_SERIAL,
    });

    this.secret = new secretsmanager.Secret(this, "Secret", {
      secretName: CI_SECRET_NAME,
      description:
        "roofing-crm GitHub Actions CI key (IAM user crm-ci). Copy into the repository secrets CRM_CI_AWS_ACCESS_KEY_ID / CRM_CI_AWS_SECRET_ACCESS_KEY.",
      secretObjectValue: {
        // A CloudFormation Ref, not a literal: unsafePlainText only wraps the token.
        accessKeyId: SecretValue.unsafePlainText(accessKey.accessKeyId),
        secretAccessKey: accessKey.secretAccessKey,
      },
    });

    NagSuppressions.addResourceSuppressions(policy, [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "cloudwatch:PutMetricData has no resource-level ARN (service authorization reference: resource type *); the statement is limited by the condition cloudwatch:namespace = RoofingCrm. The DynamoDB statements name the crm-leads table ARN only.",
        appliesTo: ["Resource::*"],
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.secret, [
      {
        id: "AwsSolutions-SMG4",
        reason:
          "A static IAM access key for GitHub Actions CI: the organization SCP blocks the GitHub OIDC provider, so no role-based short-lived credential is possible. Secrets Manager cannot rotate an IAM access key that also lives in GitHub secrets; it is rotated by bumping CI_ACCESS_KEY_SERIAL, redeploying and updating the two GitHub secrets.",
      },
    ]);
  }
}
