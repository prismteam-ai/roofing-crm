// T017: Cognito UserPool (no self sign-up), one UserPoolClient (SRP, no secret), the
// LockoutCounter DynamoDB table (data-model.md), the pre-auth lockout Lambda trigger (T018), and
// a CDK custom resource seeding one admin test user with its password written only to Secrets
// Manager (Round 1 decision D-1; constitution Article XII — never in git, logs or the PR body).
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type * as sns from "aws-cdk-lib/aws-sns";
import type * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import {
  AGENT_CITING_OUTCOMES,
  AGENT_METRIC_DIMENSIONS,
  API_SERVICE_NAME,
  METRIC_NAMES,
  METRICS_NAMESPACE,
} from "@crm/observability/metric-names";
import { taskADenyStatement } from "./task-a-deny.js";

/** One concrete dashboard widget, wrapped so it satisfies `cloudwatch.IWidget` without a cast.
 *  aws-cdk-lib's concrete widget classes declare `warnings: string[] | undefined`, which this
 *  repo's `exactOptionalPropertyTypes` won't accept for `IWidget`'s optional `warnings?:
 *  string[]`; this adapter forwards every member with the exact interface types instead. */
class DashboardWidget implements cloudwatch.IWidget {
  constructor(private readonly inner: cloudwatch.ConcreteWidget) {}

  get width(): number {
    return this.inner.width;
  }

  get height(): number {
    return this.inner.height;
  }

  get warningsV2(): { [id: string]: string } {
    return this.inner.warningsV2 ?? {};
  }

  position(x: number, y: number): void {
    this.inner.position(x, y);
  }

  toJson(): unknown[] {
    return this.inner.toJson();
  }
}

const AGENT_METRIC_PERIOD = Duration.minutes(5);

/** CloudWatch SEARCH over the exact dimension set agent metrics are flushed under
 *  (`AGENT_METRIC_DIMENSIONS`), scoped to the API's `service` value: one series per `outcome`
 *  value actually emitted, so a new outcome shows up without a dashboard change. */
function agentMetricSearch(metricName: string, statistic: string): string {
  const schema = [METRICS_NAMESPACE, ...AGENT_METRIC_DIMENSIONS].join(",");
  return (
    `SEARCH('{${schema}} MetricName="${metricName}" service="${API_SERVICE_NAME}"', ` +
    `'${statistic}', ${AGENT_METRIC_PERIOD.toSeconds()})`
  );
}

/** One agent metric for one `outcome` value, with the full emitted dimension set. */
function agentMetric(metricName: string, outcome: string): cloudwatch.Metric {
  return new cloudwatch.Metric({
    namespace: METRICS_NAMESPACE,
    metricName,
    dimensionsMap: { service: API_SERVICE_NAME, outcome },
    statistic: "Sum",
    period: AGENT_METRIC_PERIOD,
  });
}

export interface CrmOpsStackProps extends StackProps {
  /** Path to apps/api/src/auth/lockout-handler.ts, relative to this file. */
  readonly lockoutHandlerEntry: string;
  /** B-09 T053: `CrmSyncStack.fetchPartDlq` — read-only (`metricApproximateNumberOfMessagesVisible`),
   *  never granted write here. Dashboard's DLQ-depth widget is omitted when not supplied (e.g. the
   *  standalone test fixture in infra/test/crm-ops-stack.dashboard.test.ts). */
  readonly fetchPartDlq?: sqs.IQueue;
  /** B-09 T053: `CrmSyncStack.fetchPartDlqAlarm` — reused directly in an `AlarmStatusWidget`, never
   *  a second alarm definition. */
  readonly fetchPartDlqAlarm?: cloudwatch.IAlarm;
  /** B-09 T055: `CrmSyncStack.alarmTopic` — the groundedness alarm fans out to the same SNS topic
   *  as the DLQ alarm (contracts/observability.md), not a second topic/subscription. Explicitly
   *  `| undefined` (not just optional): `CrmSyncStack.alarmTopic` is itself `ITopic | undefined`
   *  (undefined when no `alarmEmail` was configured), and this repo's `exactOptionalPropertyTypes`
   *  requires that union spelled out rather than relying on `?` alone. */
  readonly alarmTopic?: sns.ITopic | undefined;
}

export class CrmOpsStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly adminSecret: secretsmanager.Secret;
  public readonly lockoutTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: CrmOpsStackProps) {
    super(scope, id, props);

    const lockoutTable = new dynamodb.Table(this, "LockoutCounterTable", {
      tableName: "crm-lockout-counter",
      partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY, // Demo project (Article III addendum); no durable business data.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    const lockoutHandler = new NodejsFunction(this, "LockoutHandler", {
      functionName: "crm-ops-lockout",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: props.lockoutHandlerEntry,
      handler: "handler",
      memorySize: 1024,
      timeout: Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        LOCKOUT_TABLE_NAME: lockoutTable.tableName,
        POWERTOOLS_SERVICE_NAME: "crm-ops-lockout",
        POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        // Same fix as CrmApi's TrpcHandler (crm-api-stack.ts) — esbuild's ESM output can't
        // convert a dependency's CJS `require()` calls on its own; shim it in the bundle banner.
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // Same reason as CrmApi: don't rely on the Lambda runtime's built-in AWS SDK layout.
        externalModules: [],
      },
    });
    lockoutTable.grantReadWriteData(lockoutHandler);
    lockoutHandler.role?.addToPrincipalPolicy(taskADenyStatement(this));
    this.lockoutTable = lockoutTable;

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "roofing-crm-users",
      selfSignUpEnabled: false, // No sign-up UI route (AC-1); the one seeded admin user only.
      // email as the actual Cognito username (UsernameAttributes), not an alias of a separate
      // generated username — AdminCreateUser's Username is the email address (AC-1), which
      // Cognito rejects if `username: true` is also set (that configures AliasAttributes
      // instead and email-shaped usernames are then refused at create time).
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.NONE, // No self-service path at all (AC-1).
      removalPolicy: RemovalPolicy.DESTROY,
      lambdaTriggers: {
        preAuthentication: lockoutHandler,
        // Cognito-native, unspoofable reset of the counter on an actual success (found
        // deploying — see lockout-handler.ts's module header for the full picture).
        postAuthentication: lockoutHandler,
      },
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: "roofing-crm-web",
      generateSecret: false, // SRP from the browser (research.md); no client secret.
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    // Round 1 decision D-1: the seeded admin password lives only in Secrets Manager.
    this.adminSecret = new secretsmanager.Secret(this, "AdminUserSecret", {
      secretName: "roofing-crm/admin-user",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin@roofing-crm.test" }),
        generateStringKey: "password",
        excludePunctuation: false,
        passwordLength: 20,
      },
    });

    // Accepted exception to "Powertools on every Lambda": AwsCustomResource's Lambda is CDK's own
    // framework handler (no app code to instrument) — same as CrmSync's deploy-time sync starter.
    const seedAdminUser = new cr.AwsCustomResource(this, "SeedAdminUser", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin@roofing-crm.test",
          UserAttributes: [
            { Name: "email", Value: "admin@roofing-crm.test" },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        },
        physicalResourceId: cr.PhysicalResourceId.of("roofing-crm-admin-user"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.userPool.userPoolArn],
      }),
    });

    const setAdminPassword = new cr.AwsCustomResource(this, "SetAdminPassword", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminSetUserPassword",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin@roofing-crm.test",
          Password: this.adminSecret.secretValueFromJson("password").unsafeUnwrap(),
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of("roofing-crm-admin-password"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.userPool.userPoolArn],
      }),
    });
    setAdminPassword.node.addDependency(seedAdminUser);
    this.adminSecret.grantRead(setAdminPassword);

    // --- B-09 T053/T055 (AC-6, contracts/observability.md): the RoofingCrm dashboard + the
    // continuous groundedness alarm (one of AC-4's three delivery points: CI/golden-harness at
    // merge time, this per-request runtime alarm, and the dashboard's trend widget below). ---

    // B-09 review fix (porygon Critical): every read below names the dimension set the API
    // really flushes — `[service, outcome]` (packages/observability/test/metricNames.test.ts pins
    // it against real Powertools output). A CloudWatch metric is its full dimension set, so a
    // read with no dimensions, or with one never emitted, sees no data and can never alarm.

    const agentAnswerLatencyP95 = new cloudwatch.MathExpression({
      expression: agentMetricSearch(METRIC_NAMES.AgentAnswerLatencyMs, "p95"),
      usingMetrics: {},
      period: AGENT_METRIC_PERIOD,
    });

    const agentAsksByOutcome = new cloudwatch.MathExpression({
      expression: agentMetricSearch(METRIC_NAMES.AgentAsksTotal, "Sum"),
      usingMetrics: {},
      period: AGENT_METRIC_PERIOD,
    });

    // Groundedness = Sum(verified) / Sum(total) x 100 over every outcome — a ratio of sums, not
    // an Average of per-answer percentages (which weighs a 1-citation answer like a 20-citation
    // one, and counts 0-of-0 answers as 100%).
    const agentCitationGroundednessAll = new cloudwatch.MathExpression({
      expression:
        `100 * SUM(${agentMetricSearch(METRIC_NAMES.AgentCitationsVerified, "Sum")}) / ` +
        `SUM(${agentMetricSearch(METRIC_NAMES.AgentCitationsTotal, "Sum")})`,
      usingMetrics: {},
      period: AGENT_METRIC_PERIOD,
      label: "Verified / total citations (%)",
    });

    // The alarm can't use SEARCH (CloudWatch rejects it in alarms) and takes at most 10 metrics,
    // so it reads the outcomes whose path can record citations at all (AGENT_CITING_OUTCOMES);
    // every other outcome records 0 of 0, which adds nothing to either sum.
    const citingMetrics: Record<string, cloudwatch.IMetric> = {};
    const verifiedIds: string[] = [];
    const totalIds: string[] = [];
    AGENT_CITING_OUTCOMES.forEach((outcome, index) => {
      citingMetrics[`verified${index}`] = agentMetric(METRIC_NAMES.AgentCitationsVerified, outcome);
      citingMetrics[`total${index}`] = agentMetric(METRIC_NAMES.AgentCitationsTotal, outcome);
      verifiedIds.push(`FILL(verified${index}, 0)`);
      totalIds.push(`FILL(total${index}, 0)`);
    });
    const verifiedSum = verifiedIds.join(" + ");
    const totalSum = totalIds.join(" + ");
    const agentCitationGroundednessForAlarm = new cloudwatch.MathExpression({
      // IF without an else drops the datapoint when nothing was cited, so a quiet or
      // citation-free period is missing data (not breaching), never a fake 0%.
      expression: `IF((${totalSum}) > 0, 100 * (${verifiedSum}) / (${totalSum}))`,
      usingMetrics: citingMetrics,
      period: AGENT_METRIC_PERIOD,
      label: "Verified / total citations (%)",
    });

    const goldenQueryPassRate = new cloudwatch.Metric({
      namespace: METRICS_NAMESPACE,
      metricName: METRIC_NAMES.GoldenQueryPassRate,
      statistic: "Average",
      period: Duration.hours(1),
      // Published by the golden harness after a real hosted run only, so this widget may be
      // empty until one has run — it tolerates an absent metric.
    });

    const widget = (inner: cloudwatch.ConcreteWidget): cloudwatch.IWidget =>
      new DashboardWidget(inner);

    const widgets: cloudwatch.IWidget[][] = [
      [
        ...(props.fetchPartDlq === undefined
          ? []
          : [
              widget(
                new cloudwatch.GraphWidget({
                  title: "FetchPart DLQ depth",
                  left: [props.fetchPartDlq.metricApproximateNumberOfMessagesVisible()],
                }),
              ),
            ]),
        ...(props.fetchPartDlqAlarm === undefined
          ? []
          : [
              widget(
                new cloudwatch.AlarmStatusWidget({
                  title: "FetchPart DLQ alarm",
                  alarms: [props.fetchPartDlqAlarm],
                }),
              ),
            ]),
      ],
      [
        widget(
          new cloudwatch.GraphWidget({
            title: "Agent asks by outcome",
            left: [agentAsksByOutcome],
            stacked: true,
          }),
        ),
        widget(
          new cloudwatch.GraphWidget({
            title: "Agent answer latency p95 (ms), by outcome",
            left: [agentAnswerLatencyP95],
          }),
        ),
      ],
      [
        widget(
          new cloudwatch.GraphWidget({
            title: "Agent citation groundedness, verified / total (target 100)",
            left: [agentCitationGroundednessAll],
            leftAnnotations: [{ value: 100, label: "target" }],
          }),
        ),
        widget(
          new cloudwatch.GraphWidget({
            title: "Golden-query pass rate (last real run, not just a CI badge)",
            left: [goldenQueryPassRate],
          }),
        ),
      ],
    ];

    new cloudwatch.Dashboard(this, "RoofingCrmDashboard", {
      dashboardName: "RoofingCrm",
      widgets,
    });

    // T055: citation drift pages the same SNS topic as the DLQ alarm (contracts/observability.md
    // "Continuous AC-4 check" layer 2) — never a silently-failing nightly test as the only signal.
    const agentCitationGroundednessAlarm = new cloudwatch.Alarm(
      this,
      "AgentCitationGroundednessAlarm",
      {
        alarmName: "crm-agent-citation-groundedness",
        alarmDescription:
          "Verified / total citations < 100% for 3 consecutive 5-minute periods — a cited " +
          "property_cid or permit_cid failed to resolve against the live index on a real " +
          "agent.ask call (contracts/observability.md's continuous AC-4 check, runtime layer).",
        metric: agentCitationGroundednessForAlarm,
        threshold: 100,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 3,
        // No data (no asks, or nothing cited) is not a citation-drift signal — never alarm on
        // silence.
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );
    if (props.alarmTopic !== undefined) {
      agentCitationGroundednessAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(props.alarmTopic),
      );
      agentCitationGroundednessAlarm.addOkAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    }

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); also used by CDK's own AwsCustomResource/LogRetention providers. A hand-written equivalent would grant the same actions (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcard is CDK's own auto-generated log-group-scoped policy (NodejsFunction/LogRetention/AwsCustomResource), not an app-authored grant.",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-SMG4",
          reason:
            "This secret holds the one shared, seeded admin test-user password for a time-boxed assessment demo, set once by the CDK custom resource at deploy time (Round 1 decision D-1); automatic rotation would invalidate the credential the Demo Transcript hands the evaluator mid-assessment.",
        },
        {
          id: "AwsSolutions-COG3",
          reason:
            "Cognito advanced security (Plus feature tier) bills per MAU with no budget for it in this $120-credit demo account (constitution Article III addendum); the story's exact 4th-attempt/5-minute lockout is already enforced deterministically by the custom pre-auth Lambda (research.md), which is the actual designed control, not Cognito's heuristic risk scoring.",
        },
        {
          id: "AwsSolutions-COG2",
          reason:
            "MFA would block the single shared test login the README's Demo Transcript and CLAUDE.md's hosted-runtime proof require the evaluator to use directly; this is a demo account with one seeded user, not a multi-tenant production pool.",
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "AWS679f53fa... is CDK's own internal Provider Lambda for AwsCustomResource (cr.AwsCustomResource), not app code — its runtime version is chosen and updated by the CDK framework, not by this stack.",
        },
      ],
      true,
    );
  }
}
