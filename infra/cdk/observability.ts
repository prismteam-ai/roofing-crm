import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
} from "aws-cdk-lib";
import {
  Alarm,
  Dashboard,
  GraphWidget,
  Metric,
} from "aws-cdk-lib/aws-cloudwatch";
import { LambdaAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Code, Function, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Role, ServicePrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";

/** Low-cardinality operational telemetry; no source data or model text in metrics. */
export function assessmentObservability(input: {
  stack: Stack;
  api: Function;
  code: Code;
  alarms: readonly Alarm[];
  pagerDutyEnabled: boolean;
  reservedMode: boolean;
}) {
  const { stack } = input;
  const routing = new Secret(stack, "PagerDutyRouting", {
    secretName: `${stack.stackName}-PagerDutyRouting`,
    description:
      "Populate routingKey privately only after a candidate-controlled free integration is available",
    secretStringValue: SecretValue.unsafePlainText('{"status":"unconfigured"}'),
  });
  routing.applyRemovalPolicy(RemovalPolicy.RETAIN);
  const logs = new LogGroup(stack, "AlertLogs", {
    retention: RetentionDays.THREE_MONTHS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const alertRole = new Role(stack, "AlertRole", {
    roleName: `${stack.stackName}-AlertRole`,
    assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole",
      ),
    ],
  });
  const notifier = new Function(stack, "AlertNotifier", {
    role: alertRole,
    runtime: Runtime.NODEJS_24_X,
    handler: "index.alertHandler",
    code: input.code,
    memorySize: 128,
    timeout: Duration.seconds(10),
    logGroup: logs,
    tracing: Tracing.ACTIVE,
    retryAttempts: 0,
    maxEventAge: Duration.minutes(1),
    ...(input.reservedMode ? { reservedConcurrentExecutions: 1 } : {}),
    environment: {
      PRISM_PAGERDUTY_SECRET_ARN: routing.secretArn,
      PRISM_PAGERDUTY_ENABLED: input.pagerDutyEnabled ? "1" : "0",
      POWERTOOLS_SERVICE_NAME: "prism-crm-alerts",
      POWERTOOLS_METRICS_NAMESPACE: "PrismAssessment",
      POWERTOOLS_LOGGER_LOG_EVENT: "false",
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: "false",
      POWERTOOLS_TRACER_CAPTURE_ERROR: "false",
    },
  });
  routing.grantRead(notifier);
  for (const alarm of input.alarms) {
    alarm.addAlarmAction(
      new LambdaAction(notifier, { useUniquePermissionId: true }),
    );
    alarm.addOkAction(
      new LambdaAction(notifier, { useUniquePermissionId: true }),
    );
  }
  const metric = (metricName: string) =>
    new Metric({
      namespace: "PrismAssessment",
      metricName,
      dimensionsMap: { service: "prism-crm-review" },
      period: Duration.minutes(5),
      statistic: "Sum",
    });
  const dashboard = new Dashboard(stack, "AssessmentDashboard", {
    dashboardName: "prism-crm-assessment-review",
    periodOverride: undefined,
  });
  dashboard.addWidgets(
    new GraphWidget({
      title: "Crm requests and refused access",
      left: [
        metric("RequestCount"),
        metric("AuthFailure"),
        metric("RateLimitFailure"),
      ],
    }),
    new GraphWidget({
      title: "Crm latency",
      left: [
        input.api.metricDuration({
          period: Duration.minutes(5),
          statistic: "p95",
        }),
        metric("QueryLatency").with({ statistic: "Average" }),
      ],
    }),
    new GraphWidget({
      title: "Errors and snapshot validation",
      left: [
        input.api.metricErrors(),
        metric("RequestError"),
        metric("SnapshotUnavailable"),
        metric("SnapshotValidated"),
      ],
    }),
    new GraphWidget({
      title: "Observed source coverage",
      left: [
        metric("SourceCoverageProperties").with({ statistic: "Maximum" }),
        metric("SourceCoverageAddresses").with({ statistic: "Maximum" }),
      ],
    }),
  );
  dashboard.addWidgets(
    new GraphWidget({
      title: "Grounded agent and lead workflow",
      left: [
        metric("AgentRequest"),
        metric("AgentModelInvocation"),
        metric("AgentTypedRetrieval"),
        metric("AgentRefusal"),
        metric("AgentProviderFailure"),
        metric("LeadMutation"),
        metric("LeadConflict"),
      ],
    }),
  );
  new CfnOutput(stack, "PagerDutySecretArn", { value: routing.secretArn });
  new CfnOutput(stack, "PagerDutyEnabled", {
    value: input.pagerDutyEnabled ? "true" : "false",
  });
  new CfnOutput(stack, "AlertFunctionName", { value: notifier.functionName });
  new CfnOutput(stack, "DashboardName", { value: dashboard.dashboardName });
  return { notifier, routing, dashboard };
}
