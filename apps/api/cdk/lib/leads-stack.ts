/**
 * CDK stack that owns the CRM LeadRecord DynamoDB table.
 *
 * Single-table META items keyed by leadId, with GSI1 by propertyId so create
 * can find an active lead without scanning the whole table.
 */
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

export interface LeadsStackProps extends cdk.StackProps {
  /**
   * Optional explicit table name; defaults to a stack-scoped name.
   */
  leadRecordTableName?: string;
}

/**
 * Provisions the LeadRecord DynamoDB table for outreach snapshots.
 */
export class LeadsStack extends cdk.Stack {
  public readonly leadRecordTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LeadsStackProps = {}) {
    super(scope, id, props);

    this.leadRecordTable = new dynamodb.Table(this, "LeadRecordTable", {
      tableName: props.leadRecordTableName,
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    this.leadRecordTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this).add("project_name", "roofing-crm-challenge");

    new cdk.CfnOutput(this, "LeadRecordTableName", {
      value: this.leadRecordTable.tableName,
      description: "DynamoDB table name for CRM LeadRecord snapshots",
    });

    new cdk.CfnOutput(this, "LeadRecordTableArn", {
      value: this.leadRecordTable.tableArn,
      description: "DynamoDB table ARN for CRM LeadRecord snapshots",
    });
  }
}
