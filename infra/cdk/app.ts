import {
  App,
  Stack,
  Tags,
  CfnOutput,
  RemovalPolicy,
  CfnParameter,
  Duration,
  BootstraplessSynthesizer,
  Fn,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import {
  Function as LambdaFunction,
  Runtime,
  Code,
} from "aws-cdk-lib/aws-lambda";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  Distribution,
  ViewerProtocolPolicy,
  ResponseHeadersPolicy,
  CachePolicy,
  AllowedMethods,
  OriginRequestPolicy,
  Function as EdgeFunction,
  FunctionCode,
  FunctionEventType,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin, HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { validatedRegion } from "../../packages/hosted-runtime/src/release";
import {
  MICRO_MODEL,
  LITE_MODEL,
} from "../../packages/runtime-config/src/index";
/** P3 bootstrapless template. Synthesis never performs an account lookup or service call. */
class CrmCandidateStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      env: {
        region: validatedRegion(process.env.PRISM_REGION ?? "us-east-1", [
          process.env.AWS_REGION,
          process.env.AWS_DEFAULT_REGION,
        ]),
      },
      synthesizer: new BootstraplessSynthesizer(),
    });
    const stage = "p3-review";
    const removal = RemovalPolicy.RETAIN;
    Tags.of(this).add("Project", "PrismAssessment");
    Tags.of(this).add("Phase", "P3");
    Tags.of(this).add("Stage", stage);
    Tags.of(this).add("DataRetention", "14-days");
    const deploymentBucket = new CfnParameter(this, "DeploymentAssetBucket", {
      type: "String",
      allowedPattern: "[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]",
      description: "Explicit dedicated bootstrapless task deployment bucket",
    });
    const archiveHash = new CfnParameter(this, "LambdaArchiveDigestPin", {
      type: "String",
      allowedPattern: "[a-f0-9]{64}",
      description: "Measured exact clean-release zip SHA256",
    });
    const releaseBuildId = new CfnParameter(this, "ReleaseBuildPin", {
      type: "String",
      allowedPattern: "[a-f0-9]{64}",
    });
    releaseBuildId.overrideLogicalId("ReleaseBuildId");
    archiveHash.overrideLogicalId("LambdaArchiveSha256");
    const oracle = new CfnParameter(this, "OracleApiOrigin", {
      type: "String",
      allowedPattern: "https://[A-Za-z0-9.-]+",
      description: "Exact approved HTTPS Oracle origin; no path or credentials",
    });
    const secret = new CfnParameter(this, "ReviewAccessSecretArn", {
      type: "String",
      noEcho: true,
      allowedPattern:
        "arn:aws:secretsmanager:us-east-1:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+",
      description: "Existing secret ARN reference only; shared with Oracle",
    });
    const model = new CfnParameter(this, "BedrockModelId", {
      type: "String",
      default: MICRO_MODEL,
      allowedValues: [MICRO_MODEL, LITE_MODEL],
      description:
        "Direct regional model only; Lite additionally requires persisted measured Micro failures",
    });
    const enabled = new CfnParameter(this, "EnableModel", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
    });
    const mapEnabled = new CfnParameter(this, "EnableMap", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
    });
    const promptRevision = new CfnParameter(this, "ModelPromptRevision", {
      type: "String",
      default: "base",
      allowedValues: ["base", "repair-1"],
    });

    const table = (name: string) =>
      new Table(this, name, {
        partitionKey: { name: "pk", type: AttributeType.STRING },
        sortKey: { name: "sk", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: "expiresAt",
        removalPolicy: removal,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      });
    const sharedTableArn = new CfnParameter(
      this,
      "SharedSessionQuotaTableArn",
      {
        type: "String",
        allowedPattern:
          "arn:aws:dynamodb:us-east-1:[0-9]{12}:table/[A-Za-z0-9_.-]+",
        description: "Oracle-owned shared evaluator session/quota table ARN",
      },
    );
    const leads = table("Leads"),
      quota = Table.fromTableArn(
        this,
        "SharedSessionQuota",
        sharedTableArn.valueAsString,
      );
    const assets = new Bucket(this, "FrontendAssets", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: removal,
      autoDeleteObjects: false,
    });
    const logs = new LogGroup(this, "ApiLogs", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: removal,
    });
    const fn = new LambdaFunction(this, "CrmHandler", {
      runtime: Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: Code.fromBucket(
        Bucket.fromBucketName(
          this,
          "DeploymentAssets",
          deploymentBucket.valueAsString,
        ),
        Fn.join("", [
          "prism-p3/crm/lambda/",
          archiveHash.valueAsString,
          ".zip",
        ]),
      ),
      timeout: Duration.seconds(25),
      reservedConcurrentExecutions: 2,
      memorySize: 512,
      logGroup: logs,
      environment: {
        LEADS_TABLE_NAME: leads.tableName,
        QUOTA_TABLE_NAME: quota.tableName,
        REVIEW_ACCESS_SECRET_ARN: secret.valueAsString,
        ORACLE_API_URL: oracle.valueAsString,
        ORACLE_APPROVED_ORIGINS: oracle.valueAsString,
        BEDROCK_MODEL_ID: model.valueAsString,
        PRISM_ENABLE_MODEL: enabled.valueAsString,
        PRISM_ENABLE_MAP: mapEnabled.valueAsString,
        PRISM_MODEL_PROMPT_REVISION: promptRevision.valueAsString,
        PRISM_REGION: "us-east-1",
        PRISM_STAGE: stage,
      },
    });
    leads.grantReadWriteData(fn);
    quota.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.valueAsString],
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          Fn.join("", [
            "arn:aws:bedrock:us-east-1::foundation-model/",
            model.valueAsString,
          ]),
        ],
        conditions: { StringEquals: { "aws:RequestedRegion": "us-east-1" } },
      }),
    );
    const api = new HttpApi(this, "CrmApi");
    api.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration("CrmIntegration", fn),
    });
    const rewrite = new EdgeFunction(this, "SpaIndex", {
      code: FunctionCode.fromInline(
        'function handler(event) { var r=event.request; if(r.uri.indexOf(".") === -1 && r.uri.indexOf("/api/") !== 0) r.uri="/index.html"; return r; }',
      ),
    });
    const security = new ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: "DENY" as never, override: true },
        referrerPolicy: {
          referrerPolicy: "strict-origin-when-cross-origin" as never,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://maps.geo.us-east-1.amazonaws.com; connect-src 'self' https://maps.geo.us-east-1.amazonaws.com; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          override: true,
        },
      },
    });
    const distribution = new Distribution(this, "Frontend", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(assets),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: security,
        functionAssociations: [
          { function: rewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new HttpOrigin(
            `${api.apiId}.execute-api.${this.region}.${this.urlSuffix}`,
          ),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: security,
        },
      },
    });
    new Alarm(this, "ApiErrors", {
      metric: fn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    new CfnOutput(this, "ProviderDomain", {
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, "AssetBucket", { value: assets.bucketName });
    new CfnOutput(this, "ReleaseBuildId", {
      value: releaseBuildId.valueAsString,
    });
    new CfnOutput(this, "LambdaArchiveSha256", {
      value: archiveHash.valueAsString,
    });
    new CfnOutput(this, "Region", { value: "us-east-1" });
    new CfnOutput(this, "Stage", { value: stage });
    new CfnOutput(this, "ApiOrigin", { value: api.apiEndpoint });
    new CfnOutput(this, "FrontendDistributionId", {
      value: distribution.distributionId,
    });
    new CfnOutput(this, "LeadTableName", { value: leads.tableName });
  }
}
const app = new App({ outdir: "cdk.out" });
new CrmCandidateStack(app, "PrismCrmP3Review");
app.synth();
