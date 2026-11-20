/**
 * RoofingCrmLeads: the persisted leads (increment 3). One on-demand DynamoDB table, the leads Lambda with
 * its own role, its own HTTP API behind the pipeline's shared token authorizer (imported by ARN from SSM),
 * and one alarm. Leads are written only through this API: IAM allows the leads role item actions on the
 * table, and the table's resource policy denies data-plane writes to every other principal.
 */
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

/** Published by OracleLaDataApi (pipeline repo). */
export const AUTHORIZER_ARN_PARAM = "/oracle-la/api/authorizer-arn";
/** Published by OracleLaGuards (pipeline repo). */
export const ALERT_TOPIC_PARAM = "/oracle-la/alerts/topic-arn";
export const METRICS_NAMESPACE = "RoofingCrm";

/** Data-plane writes denied to every principal except the leads role (TransactWriteItems is covered by
 * PutItem, UpdateItem and DeleteItem: it has no IAM action of its own). No control action is listed. */
export const DENIED_WRITE_ACTIONS = [
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:BatchWriteItem",
  "dynamodb:PartiQLInsert",
  "dynamodb:PartiQLUpdate",
  "dynamodb:PartiQLDelete",
];
/** What the leads role may do, on the table only. */
export const LEADS_ROLE_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:Scan",
];

export interface LeadsDataProps {
  removalPolicy: cdk.RemovalPolicy;
  deletionProtection: boolean;
}

/** The leads table, the leads role, the role's table policy and the table's resource policy. */
export class LeadsData extends Construct {
  readonly table: dynamodb.Table;
  readonly role: iam.Role;
  constructor(scope: Construct, id: string, props: LeadsDataProps) {
    super(scope, id);
    this.role = new iam.Role(this, "FunctionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description:
        "Roofing CRM leads Lambda: the only principal that may write leads",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    this.table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "parcel_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.DEFAULT, // AWS-owned key: no KMS charge
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 35,
      },
      deletionProtection: props.deletionProtection,
      removalPolicy: props.removalPolicy,
      resourcePolicy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: "WritesOnlyThroughTheLeadsApi",
            effect: iam.Effect.DENY,
            principals: [new iam.StarPrincipal()],
            actions: DENIED_WRITE_ACTIONS,
            // As in the AWS CloudFormation example for a table's ResourcePolicy (avoids a self-reference).
            resources: ["*"],
            conditions: {
              ArnNotEquals: { "aws:PrincipalArn": this.role.roleArn },
            },
          }),
        ],
      }),
    });
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: LEADS_ROLE_ACTIONS,
        resources: [this.table.tableArn],
      }),
    );
  }
}

export interface CrmLeadsStackProps extends cdk.StackProps {
  /** Repository root (for bundling the leads Lambda). */
  root: string;
  /** The CRM site origin (CORS). */
  origin: string;
}

export class CrmLeadsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CrmLeadsStackProps) {
    super(scope, id, props);
    const data = new LeadsData(this, "Leads", {
      removalPolicy: cdk.RemovalPolicy.RETAIN, // leads cannot be recreated
      deletionProtection: true,
    });

    const fn = new nodejs.NodejsFunction(this, "Api", {
      entry: `${props.root}apps/leads-api/src/handler.ts`,
      projectRoot: props.root,
      depsLockFilePath: `${props.root}pnpm-lock.yaml`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      role: data.role,
      logGroup: new logs.LogGroup(this, "ApiLogs", {
        retention: logs.RetentionDays.THREE_MONTHS, // 90 days (kit: apply-engineering-guidelines/rules/observability-logging-tracing.md, "Logging Standards")
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: data.table.tableName,
        POWERTOOLS_SERVICE_NAME: "roofing-crm-leads",
        POWERTOOLS_METRICS_NAMESPACE: METRICS_NAMESPACE,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        bundleAwsSDK: true,
        minify: true,
        sourceMap: true,
        target: "node22",
      },
    });

    // The pipeline's token authorizer (one token store for both repos). sameEnvironment: the ARN is a
    // deploy-time token, so CDK cannot infer the account; without it no invoke permission is created.
    const sharedAuthorizer = lambda.Function.fromFunctionAttributes(
      this,
      "SharedAuthorizer",
      {
        functionArn: ssm.StringParameter.valueForStringParameter(
          this,
          AUTHORIZER_ARN_PARAM,
        ),
        sameEnvironment: true,
      },
    );
    const authorizer = new HttpLambdaAuthorizer(
      "TokenAuthorizer",
      sharedAuthorizer,
      {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
        identitySource: ["$request.header.Authorization"],
        resultsCacheTtl: cdk.Duration.minutes(5),
      },
    );

    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "roofing-crm-leads-api",
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [props.origin],
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        maxAge: cdk.Duration.minutes(10),
      },
    });
    api.addStage("DefaultStage", {
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 5, burstLimit: 10 },
    });
    api.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("ApiIntegration", fn),
      authorizer,
    });

    // One alarm (CloudWatch always-free allowance; listed in the pipeline's docs/metrics.md).
    const topic = sns.Topic.fromTopicArn(
      this,
      "Alerts",
      ssm.StringParameter.valueForStringParameter(this, ALERT_TOPIC_PARAM),
    );
    new cloudwatch.Alarm(this, "Http5xx", {
      alarmName: "roofing-crm-leads-http-api-5xx",
      alarmDescription: "Leads HTTP API returned 5xx",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "5xx",
        dimensionsMap: { ApiId: api.apiId, Stage: "$default" },
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new actions.SnsAction(topic));

    new cdk.CfnOutput(this, "LeadsApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: data.table.tableName });
  }
}

/**
 * Throwaway stack for the destroy proof (built only with `-c destroyCheck=true`): the same table settings,
 * role and resource policy, but removal DESTROY and no deletion protection, so `cdk destroy` deletes the
 * table. No data, no Lambda.
 */
export class CrmLeadsDestroyCheckStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const data = new LeadsData(this, "Leads", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });
    new cdk.CfnOutput(this, "TableName", { value: data.table.tableName });
  }
}
