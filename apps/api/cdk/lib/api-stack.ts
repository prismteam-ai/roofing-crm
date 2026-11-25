import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface RoofingCrmStackProps extends cdk.StackProps {
  /** App name; also the cost tag and the API name. Must not change after first deploy. */
  basePath: string;
  /** Public MCP endpoint of the Oracle pipeline. The CRM's only data source. */
  oracleMcpUrl: string;
  /** `bedrock`, `anthropic` or `none`. */
  agentProvider: string;
  agentModel?: string;
  /** SSM SecureString parameter name holding the model API key (anthropic provider only). */
  agentKeyParameter?: string;
  /** Address that receives alarm notifications. Passed at deploy time, never committed. */
  alarmEmail?: string;
}

/**
 * Everything the CRM runs on. All of it is pay-per-request: with no traffic the bill is zero
 * apart from a few cents of log storage.
 */
export class RoofingCrmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RoofingCrmStackProps) {
    super(scope, id, {
      ...props,
      env: { region: 'us-east-2', account: props.env?.account },
      tags: { project_name: props.basePath },
    });

    const leads = new dynamodb.Table(this, 'Leads', {
      partitionKey: { name: 'workspaceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'leadId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const handler = new nodejs.NodejsFunction(this, 'TrpcHandler', {
      entry: path.join(here, '../../src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.THREE_MONTHS,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: props.basePath,
        POWERTOOLS_METRICS_NAMESPACE: 'RoofingCrm',
        ORACLE_MCP_URL: props.oracleMcpUrl,
        LEADS_TABLE: leads.tableName,
        AGENT_PROVIDER: props.agentProvider,
        ...(props.agentModel ? { AGENT_MODEL: props.agentModel } : {}),
        ...(props.agentKeyParameter ? { AGENT_KEY_PARAMETER: props.agentKeyParameter } : {}),
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
      },
    });
    leads.grantReadWriteData(handler);

    if (props.agentProvider === 'bedrock') {
      handler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
          resources: ['*'],
        }),
      );
    }
    if (props.agentKeyParameter) {
      handler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter'],
          resources: [
            this.formatArn({
              service: 'ssm',
              resource: 'parameter',
              resourceName: props.agentKeyParameter.replace(/^\//, ''),
            }),
          ],
        }),
      );
    }

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${props.basePath}-api`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization', 'x-workspace-id'],
        maxAge: cdk.Duration.hours(1),
      },
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('LambdaIntegration', handler),
    });

    /**
     * API Gateway cuts a request at 30 s. A multi-step agent answer can run longer, so the
     * agent call alone goes through a function URL on the same Lambda (same code, same router).
     */
    const agentUrl = handler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedHeaders: ['content-type', 'x-workspace-id'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // One alarm on handler errors, fanned out through SNS. PagerDuty (Events API v2) subscribes
    // to this topic in a company account; this exercise account has no PagerDuty service.
    const alarmTopic = new sns.Topic(this, 'CriticalAlarms');
    const errors = new cloudwatch.Alarm(this, 'HandlerErrors', {
      metric: handler.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'roofing-crm API Lambda raised an unhandled error',
    });
    errors.addAlarmAction(new cwActions.SnsAction(alarmTopic));
    errors.addOkAction(new cwActions.SnsAction(alarmTopic));

    // Frontend: one Amplify app per frontend. Manual-deploy branch (no GitHub token stored);
    // `pnpm deploy:web` uploads the built bundle.
    const web = new amplify.CfnApp(this, 'WebApp', {
      name: `${props.basePath}-web`,
      platform: 'WEB',
      customRules: [
        {
          source:
            '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
    });
    const branch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: web.attrAppId,
      branchName: 'main',
      stage: 'PRODUCTION',
    });

    // Procedure failures come back as HTTP responses, so the Lambda Errors metric never sees
    // them. This alarm watches the RequestsFailed count the API itself emits.
    const failed = new cloudwatch.Alarm(this, 'ProcedureFailures', {
      metric: new cloudwatch.Metric({
        namespace: 'RoofingCrm',
        metricName: 'RequestsFailed',
        dimensionsMap: { service: 'roofing-crm-api' },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'roofing-crm API returned 5 or more failed procedures in 5 minutes',
    });
    failed.addAlarmAction(new cwActions.SnsAction(alarmTopic));
    failed.addOkAction(new cwActions.SnsAction(alarmTopic));
    if (props.alarmEmail) {
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
    }

    // Throttle the public API so a script cannot hammer it.
    const stage = httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (stage) stage.defaultRouteSettings = { throttlingBurstLimit: 40, throttlingRateLimit: 20 };

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'AgentUrl', { value: agentUrl.url });
    new cdk.CfnOutput(this, 'WebAppId', { value: web.attrAppId });
    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${branch.branchName}.${web.attrDefaultDomain}`,
    });
    new cdk.CfnOutput(this, 'LeadsTable', { value: leads.tableName });
  }
}
