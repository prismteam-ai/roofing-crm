/** Synth checks for RoofingCrmLeads (offline; Lambda bundling skipped). */
import * as cdk from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { beforeAll, describe, expect, test } from "vitest";
import {
  CrmLeadsDestroyCheckStack,
  CrmLeadsStack,
  DENIED_WRITE_ACTIONS,
  LEADS_ROLE_ACTIONS,
} from "../cdk/lib/crm-leads-stack.ts";

const env = { account: "123456789012", region: "eu-north-1" };
const root = new URL("../../../", import.meta.url).pathname;
const newApp = () =>
  new cdk.App({ context: { "aws:cdk:bundling-stacks": [] } });

interface Statement {
  Action: string | string[];
  Resource?: unknown;
}
interface Props {
  [k: string]: unknown;
  ResourcePolicy?: { PolicyDocument: { Statement: Statement[] } };
  PolicyDocument?: { Statement: Statement[] };
  SourceArn?: unknown;
  FunctionName?: { Ref: string };
}
interface Res {
  Properties: Props;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
}
const resources = (t: Template, type: string) =>
  Object.values(t.findResources(type)) as Res[];
const tableOf = (t: Template) => resources(t, "AWS::DynamoDB::Table")[0]!;
const roleLogicalId = (t: Template) =>
  Object.keys(t.findResources("AWS::IAM::Role")).find((k) =>
    k.startsWith("LeadsFunctionRole"),
  )!;

describe("RoofingCrmLeads", () => {
  let stack: CrmLeadsStack;
  let t: Template;
  beforeAll(() => {
    stack = new CrmLeadsStack(newApp(), "RoofingCrmLeads", {
      env,
      root,
      origin: "https://main.example.amplifyapp.com",
    });
    t = Template.fromStack(stack);
  });

  test("table: on demand, parcel_id key, RETAIN, deletion protection, PITR 35 days, AWS-owned key, no indexes", () => {
    const table = tableOf(t);
    expect(table.DeletionPolicy).toBe("Retain");
    expect(table.UpdateReplacePolicy).toBe("Retain");
    const p = table.Properties;
    expect(p.BillingMode).toBe("PAY_PER_REQUEST");
    expect(p.KeySchema).toEqual([
      { AttributeName: "parcel_id", KeyType: "HASH" },
    ]);
    expect(p.DeletionProtectionEnabled).toBe(true);
    expect(p.PointInTimeRecoverySpecification).toEqual({
      PointInTimeRecoveryEnabled: true,
      RecoveryPeriodInDays: 35,
    });
    expect(p.SSESpecification).toEqual({ SSEEnabled: false }); // AWS-owned key
    expect(p.TableName).toBeUndefined();
    expect(p.GlobalSecondaryIndexes).toBeUndefined();
  });

  test("resource policy: one Deny of data-plane writes to every principal except the leads role, no control actions", () => {
    const doc = tableOf(t).Properties.ResourcePolicy!.PolicyDocument;
    expect(doc.Statement).toEqual([
      {
        Sid: "WritesOnlyThroughTheLeadsApi",
        Effect: "Deny",
        Principal: "*",
        Action: DENIED_WRITE_ACTIONS,
        Resource: "*",
        Condition: {
          ArnNotEquals: {
            "aws:PrincipalArn": { "Fn::GetAtt": [roleLogicalId(t), "Arn"] },
          },
        },
      },
    ]);
    for (const a of DENIED_WRITE_ACTIONS)
      expect(a).not.toMatch(/Table|Policy|Tag|Describe|Backup/);
    expect(DENIED_WRITE_ACTIONS).not.toContain("dynamodb:*");
  });

  test("leads role: exactly the item actions on the table ARN, plus X-Ray and basic execution", () => {
    const statements = resources(t, "AWS::IAM::Policy").flatMap(
      (p) => p.Properties.PolicyDocument!.Statement,
    );
    const ddb = statements.filter((s) =>
      [s.Action].flat().some((a: string) => a.startsWith("dynamodb:")),
    );
    expect(ddb).toHaveLength(1);
    expect(ddb[0].Action).toEqual(LEADS_ROLE_ACTIONS);
    const tableId = Object.keys(t.findResources("AWS::DynamoDB::Table"))[0]!;
    expect(ddb[0].Resource).toEqual({ "Fn::GetAtt": [tableId, "Arn"] });
    const other = statements
      .filter((s) => !ddb.includes(s))
      .flatMap((s) => [s.Action].flat());
    expect(other.sort()).toEqual([
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments",
    ]);
  });

  test("A2: one invoke permission on the imported pipeline authorizer, scoped to this API's authorizer", () => {
    t.resourceCountIs("AWS::Lambda::Permission", 3); // the integration's GET and POST permissions, and A2
    const perms = resources(t, "AWS::Lambda::Permission");
    const a2 = perms.filter((p) =>
      JSON.stringify(p.Properties.SourceArn).includes("/authorizers/"),
    );
    expect(a2).toHaveLength(1);
    expect(a2[0]!.Properties.Action).toBe("lambda:InvokeFunction");
    expect(a2[0]!.Properties.Principal).toBe("apigateway.amazonaws.com");
    // FunctionName is the SSM parameter /oracle-la/api/authorizer-arn (a CloudFormation parameter).
    const ref = a2[0]!.Properties.FunctionName!.Ref;
    expect(t.toJSON().Parameters[ref].Default).toBe(
      "/oracle-la/api/authorizer-arn",
    );
    expect(JSON.stringify(a2[0]!.Properties.SourceArn)).toMatch(
      /arn:.*:execute-api:eu-north-1:123456789012:.*\/authorizers\//,
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("permission"),
    );
    expect(warnings).toEqual([]);
  });

  test("negative control: without sameEnvironment CDK creates no permission and warns", () => {
    const s = new cdk.Stack(newApp(), "Control", { env });
    const fn = lambda.Function.fromFunctionArn(
      s,
      "Imported",
      ssm.StringParameter.valueForStringParameter(
        s,
        "/oracle-la/api/authorizer-arn",
      ),
    );
    const api = new apigwv2.HttpApi(s, "Api");
    const target = lambda.Function.fromFunctionArn(
      s,
      "Target",
      "arn:aws:lambda:eu-north-1:123456789012:function:t",
    );
    api.addRoutes({
      path: "/x",
      integration: new HttpLambdaIntegration("I", target),
      authorizer: new HttpLambdaAuthorizer("A", fn, {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
      }),
    });
    const ct = Template.fromStack(s);
    const perms = resources(ct, "AWS::Lambda::Permission");
    expect(
      perms.filter((p) =>
        JSON.stringify(p.Properties.SourceArn).includes("/authorizers/"),
      ),
    ).toEqual([]);
    expect(
      Annotations.fromStack(s).findWarning(
        "*",
        Match.stringLikeRegexp("[Pp]ermission"),
      ).length,
    ).toBeGreaterThan(0);
  });

  test("HTTP API: GET and POST on /trpc/{proxy+} behind the authorizer; CORS for the CRM origin only; throttled", () => {
    const routes = resources(t, "AWS::ApiGatewayV2::Route");
    expect(routes.map((r) => r.Properties.RouteKey).sort()).toEqual([
      "GET /trpc/{proxy+}",
      "POST /trpc/{proxy+}",
    ]);
    for (const r of routes)
      expect(r.Properties.AuthorizationType).toBe("CUSTOM");
    t.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowOrigins: ["https://main.example.amplifyapp.com"],
        AllowMethods: ["GET", "POST", "OPTIONS"],
      },
    });
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerPayloadFormatVersion: "2.0",
      EnableSimpleResponses: true,
      AuthorizerResultTtlInSeconds: 300,
    });
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "$default",
      DefaultRouteSettings: {
        ThrottlingRateLimit: 5,
        ThrottlingBurstLimit: 10,
      },
    });
  });

  test("monitoring: 90-day logs, one 5xx alarm, no Lambda Errors alarm; Lambda on Node 22 arm64 with tracing", () => {
    t.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 90 });
    const alarms = resources(t, "AWS::CloudWatch::Alarm");
    expect(alarms.map((a) => a.Properties.AlarmName)).toEqual([
      "roofing-crm-leads-http-api-5xx",
    ]);
    expect(alarms[0].Properties.MetricName).toBe("5xx");
    t.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      TracingConfig: { Mode: "Active" },
      Environment: {
        Variables: Match.objectLike({
          POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
        }),
      },
    });
  });
});

test("destroy-check stack: the same role and policy, but DESTROY and no deletion protection", () => {
  const s = new CrmLeadsDestroyCheckStack(
    newApp(),
    "RoofingCrmLeadsDestroyCheck",
    { env },
  );
  const t = Template.fromStack(s);
  const table = tableOf(t);
  expect(table.DeletionPolicy).toBe("Delete");
  expect(table.Properties.DeletionProtectionEnabled).toBe(false);
  expect(
    table.Properties.ResourcePolicy!.PolicyDocument.Statement[0].Action,
  ).toEqual(DENIED_WRITE_ACTIONS);
  expect(Object.keys(t.findResources("AWS::Lambda::Function"))).toEqual([]);
});
