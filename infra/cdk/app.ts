import {
  App,
  Stack,
  Tags,
  CfnOutput,
  RemovalPolicy,
  CfnParameter,
  Duration,
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
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { existsSync } from "node:fs";
/** Synth-only P2 candidate. Genuine package, parameter references, no lookups or deployment. */
class CrmCandidateStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const stage = this.node.tryGetContext("stage") ?? "review";
    const approvedDestroy =
      this.node.tryGetContext("approvedDestroy") === "true";
    const removal =
      stage === "disposable" && approvedDestroy
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN;
    Tags.of(this).add("Project", "PrismAssessment");
    Tags.of(this).add("Phase", "P2-NOT-DEPLOYED");
    Tags.of(this).add("Stage", stage);
    Tags.of(this).add("DataRetention", "14-days");
    const oracle = new CfnParameter(this, "OracleApiOrigin", {
      type: "String",
      allowedPattern: "https://[A-Za-z0-9.-]+",
      description: "Exact approved HTTPS Oracle origin; no path or credentials",
    });
    const secret = new CfnParameter(this, "ReviewAccessSecretArn", {
      type: "String",
      noEcho: true,
      allowedPattern:
        "arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+",
      description: "Existing secret ARN reference only; shared with Oracle",
    });
    const model = new CfnParameter(this, "BedrockModelId", {
      type: "String",
      default: "not-enabled",
      allowedPattern: "[A-Za-z0-9._:/-]+",
      description:
        "Authorized regional model or inference profile ID selected at the live gate",
    });
    const modelArn = new CfnParameter(this, "BedrockModelArn", {
      type: "String",
      default: "arn:aws:bedrock:us-east-2::foundation-model/not-enabled",
      allowedPattern:
        "arn:[a-z0-9-]+:bedrock:[a-z0-9-]+:[0-9]{0,12}:(foundation-model|inference-profile|application-inference-profile)/[A-Za-z0-9._:/-]+",
      description: "Exact authorized model ARN; no wildcard",
    });
    const enabled = new CfnParameter(this, "EnableModel", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
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
          "arn:[a-z0-9-]+:dynamodb:[a-z0-9-]+:[0-9]{12}:table/[A-Za-z0-9_.-]+",
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
    if (!existsSync("build/lambda/index.mjs"))
      throw new Error(
        "Build the real Lambda package with pnpm lambda:package before synthesis",
      );
    const fn = new LambdaFunction(this, "CrmHandler", {
      runtime: Runtime.NODEJS_24_X,
      handler: "index.handler",
      code: Code.fromAsset("build/lambda"),
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
        resources: [modelArn.valueAsString],
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
          referrerPolicy: "no-referrer" as never,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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
    if (!existsSync("dist/index.html"))
      throw new Error("Build the frontend before synthesis");
    new BucketDeployment(this, "FrontendPublication", {
      sources: [Source.asset("dist")],
      destinationBucket: assets,
      distribution,
      distributionPaths: ["/*"],
      retainOnDelete: true,
      prune: false,
      logGroup: new LogGroup(this, "FrontendPublicationLogs", {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: removal,
      }),
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
    new CfnOutput(this, "RuntimeStatus", {
      value:
        "Prepared and locally emulated only; no resources created. Shared review secret and provider permission remain live gates.",
    });
  }
}
const app = new App({ outdir: "cdk.out" });
new CrmCandidateStack(app, "PrismCrmP2Candidate");
app.synth();
