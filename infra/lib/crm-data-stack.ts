// T038: the private S3 bucket (`crm-index`) that holds this story's sync output — content-
// addressed raw parts under `raw/{manifestCid}/` (FetchPart, apps/sync/handlers/fetchPart.ts) and
// the built `crm_property`/`crm_permit` Parquet under `index/{manifestCid}/` (BuildIndex). Block
// Public Access, SSE, `enforceSSL` (constitution P0-8, architecture-constitution.md §10 Security
// row). No longer "intentionally empty" (B-01 T005) — infra/test/crm-data-stack.test.ts (T009).
import { RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { CrmCiUser } from "./crm-ci-user.js";

export class CrmDataStack extends Stack {
  public readonly indexBucket: s3.Bucket;
  public readonly leadsTable: dynamodb.Table;
  public readonly agentUsageTable: dynamodb.Table;
  public readonly ciUser: CrmCiUser;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.indexBucket = new s3.Bucket(this, "IndexBucket", {
      bucketName: "crm-index",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Demo project (constitution Article III addendum): every run gets its own
      // index/{manifestCid}/ folder (architecture-constitution.md §11), so there is no durable
      // business data this bucket alone is the only copy of — Task A's published CIDs are the
      // source of truth and can always be re-synced.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // B-07 `crm-leads` (T002 skeleton, T012 GSIs). Grants to the API Lambda are in crm-api-stack.ts
    // (it receives the table by name, like crm-sync-stack.ts).
    this.leadsTable = new dynamodb.Table(this, "LeadsTable", {
      tableName: "crm-leads",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY, // Demo project (Article III addendum).
    });
    // Sparse indexes: only `sk=LEAD` items carry `assignee`/`status`, so only they are indexed
    // (data-model.md GSIs). KEYS_ONLY would force a second read; ALL keeps list views one query.
    this.leadsTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "assignee", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.leadsTable.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    Tags.of(this.leadsTable).add("project_name", "roofing-crm");

    // B-09 T017 (data-model.md "agent usage / rate+spend guard"): 5 asks/min/user and the $3/day
    // spend cap, each an item keyed `USER#{sub}#MIN#{windowMinute}` / `USER#{sub}#DAY#{yyyy-mm-dd}`
    // on a single partition key (no sort key needed — one item per window). TTL reclaims expired
    // windows/days automatically; grants to the API Lambda are in crm-api-stack.ts, same pattern
    // as leadsTable above.
    this.agentUsageTable = new dynamodb.Table(this, "AgentUsageTable", {
      tableName: "crm-agent-usage",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY, // Demo project (Article III addendum).
    });
    Tags.of(this.agentUsageTable).add("project_name", "roofing-crm");

    // B-09: the GitHub Actions CI principal (crm-ci-user.ts). It lives with crm-leads because its
    // DynamoDB grant is that table's ARN, partition-scoped to lead keys.
    this.ciUser = new CrmCiUser(this, "CiUser", {
      leadsTableArn: this.leadsTable.tableArn,
    });

    NagSuppressions.addResourceSuppressions(this.indexBucket, [
      {
        id: "AwsSolutions-S1",
        reason:
          "Server access logging would add another bucket and cost with no benefit for this time-boxed, $120-credit demo account (constitution Article III addendum); every write already goes through CloudTrail data events if that audit trail is ever needed.",
      },
    ]);
  }
}
