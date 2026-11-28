import path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as amplify from "aws-cdk-lib/aws-amplify";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

export const PROJECT_TAG = "roofing-crm";
export const METRICS_NAMESPACE = "RoofingCrm";
/** The Amplify branch the web build is deployed to (deploy/deploy-web.sh). */
export const WEB_BRANCH = "main";

export interface CrmStackProps extends StackProps {
  /** Repo root (for Lambda bundling). */
  root: string;
  oracleUrl: string;
  oracleMcpUrl: string;
  oracleManifestCid: string;
  anthropicKeyParam: string;
  agentModel: string;
  agentDailyTokens: number;
  agentPerIpPerMinute: number;
  leadCreatesPerDay: number;
  monthlyBudgetUsd: number;
  alarmEmail?: string;
  /** Tests skip esbuild bundling and use inline stand-in code. */
  bundle?: boolean;
}

/**
 * Hosted CRM: Amplify (web), the tRPC API Lambda behind an API Gateway HTTP API, the agent Lambda
 * on a Function URL (longer than API Gateway's 30 s), one DynamoDB table (leads, demo workspaces,
 * agent counters; TTL), and alarms to SNS email plus a monthly AWS Budgets alarm.
 *
 * Amplify proxies `/trpc/*` to the API, so the browser talks to one origin and the demo workspace
 * cookie is first-party. The agent is called cross-origin (no cookies), CORS limited to Amplify.
 */
export class CrmStack extends Stack {
  constructor(scope: Construct, id: string, props: CrmStackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "Leads", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
    });

    const web = new amplify.CfnApp(this, "Web", {
      name: "roofing-crm",
      platform: "WEB",
    });
    const branch = new amplify.CfnBranch(this, "WebBranch", {
      appId: web.attrAppId,
      branchName: WEB_BRANCH,
      stage: "PRODUCTION",
    });
    const webOrigin = `https://${WEB_BRANCH}.${web.attrDefaultDomain}`;

    const env = {
      ORACLE_API_URL: props.oracleUrl,
      ORACLE_MCP_URL: props.oracleMcpUrl,
      ORACLE_MANIFEST_CID: props.oracleManifestCid,
      LEADS_TABLE: table.tableName,
      LEAD_CREATES_PER_DAY: String(props.leadCreatesPerDay),
      ANTHROPIC_API_KEY_PARAM: props.anthropicKeyParam,
      CRM_AGENT_MODEL: props.agentModel,
      AGENT_DAILY_TOKEN_BUDGET: String(props.agentDailyTokens),
      RATE_LIMIT_PER_MINUTE: String(props.agentPerIpPerMinute),
      AGENT_TIMEOUT_MS: "50000",
      ALLOWED_ORIGINS: webOrigin,
      POWERTOOLS_METRICS_NAMESPACE: METRICS_NAMESPACE,
    };
    const fn = (id: string, entry: string, o: { timeout: Duration; memory: number }) => {
      const common = {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: o.memory,
        timeout: o.timeout,
        tracing: lambda.Tracing.ACTIVE,
        environment: env,
        logGroup: new logs.LogGroup(this, `${id}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      };
      return props.bundle === false
        ? new lambda.Function(this, id, {
            ...common,
            handler: "index.handler",
            code: lambda.Code.fromInline("exports.handler = async () => ({ statusCode: 200 });"),
          })
        : new nodejs.NodejsFunction(this, id, {
            ...common,
            entry: path.join(props.root, entry),
            handler: "handler",
            projectRoot: props.root,
            depsLockFilePath: path.join(props.root, "pnpm-lock.yaml"),
            bundling: {
              format: nodejs.OutputFormat.ESM,
              target: "node22",
              mainFields: ["module", "main"],
              minify: true,
              sourceMap: true,
              // ESM bundles of CommonJS dependencies still call require().
              banner:
                "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
              externalModules: ["@aws-sdk/*"],
            },
          });
    };

    const api = fn("Api", "apps/api/src/lambda.ts", { timeout: Duration.seconds(29), memory: 1024 });
    const agent = fn("Agent", "apps/api/src/agent-lambda.ts", {
      timeout: Duration.seconds(60),
      memory: 1024,
    });
    table.grantReadWriteData(api);
    table.grantReadWriteData(agent);
    agent.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          this.formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: props.anthropicKeyParam.replace(/^\//, ""),
          }),
        ],
      }),
    );

    // No CORS: the browser reaches the API only through Amplify's same-origin /trpc proxy.
    const httpApi = new apigw.HttpApi(this, "HttpApi");
    const integration = new HttpLambdaIntegration("ApiIntegration", api);
    httpApi.addRoutes({ path: "/trpc/{proxy+}", methods: [apigw.HttpMethod.ANY], integration });
    httpApi.addRoutes({ path: "/health", methods: [apigw.HttpMethod.GET], integration });
    const apiUrl = httpApi.apiEndpoint;

    const agentUrl = agent.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: [webOrigin],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["content-type"],
        maxAge: Duration.hours(1),
      },
    });

    // Same-origin API through Amplify; every other path without a file extension → the SPA.
    web.customRules = [
      { source: "/trpc/<*>", target: `${apiUrl}/trpc/<*>`, status: "200" },
      { source: "/health", target: `${apiUrl}/health`, status: "200" },
      {
        source:
          "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|webmanifest)$)([^.]+$)/>",
        target: "/index.html",
        status: "200",
      },
    ];

    const topic = new sns.Topic(this, "Alarms", { displayName: "Roofing CRM alarms" });
    if (props.alarmEmail) topic.addSubscription(new subs.EmailSubscription(props.alarmEmail));
    const notify = new actions.SnsAction(topic);
    const alarms = [
      new cloudwatch.Alarm(this, "ApiErrorsAlarm", {
        alarmDescription: "The CRM API Lambda reported errors.",
        metric: api.metricErrors({ period: Duration.minutes(5), statistic: "Sum" }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "AgentErrorsAlarm", {
        alarmDescription: "The CRM agent Lambda reported errors.",
        metric: agent.metricErrors({ period: Duration.minutes(5), statistic: "Sum" }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "Api5xxAlarm", {
        alarmDescription: "The CRM HTTP API returned 5xx responses.",
        metric: new cloudwatch.Metric({
          namespace: "AWS/ApiGateway",
          metricName: "5xx",
          dimensionsMap: { ApiId: httpApi.apiId },
          period: Duration.minutes(5),
          statistic: "Sum",
        }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "AgentBudgetAlarm", {
        alarmDescription: `The CRM agent used 80% of its daily token budget (${props.agentDailyTokens}).`,
        metric: new cloudwatch.Metric({
          namespace: METRICS_NAMESPACE,
          metricName: "AgentTokens",
          dimensionsMap: { service: "roofing-crm-agent" },
          period: Duration.days(1),
          statistic: "Sum",
        }),
        threshold: Math.round(props.agentDailyTokens * 0.8),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    ];
    for (const a of alarms) a.addAlarmAction(notify);

    const subscribers = props.alarmEmail
      ? [{ subscriptionType: "EMAIL", address: props.alarmEmail }]
      : undefined;
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: `${PROJECT_TAG}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
        costFilters: { TagKeyValue: [`user:project_name$${PROJECT_TAG}`] },
      },
      notificationsWithSubscribers: subscribers && [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers,
        },
        {
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers,
        },
      ],
    });

    new CfnOutput(this, "WebUrl", { value: webOrigin });
    new CfnOutput(this, "WebAppId", { value: web.attrAppId });
    new CfnOutput(this, "WebBranchName", { value: branch.branchName });
    new CfnOutput(this, "ApiUrl", { value: apiUrl });
    new CfnOutput(this, "AgentUrl", { value: agentUrl.url });
  }
}
