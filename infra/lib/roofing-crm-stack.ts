import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { join } from "node:path";

export interface RoofingCrmStackProps extends StackProps {
  /** Name of the SSM SecureString parameter holding the Gemini API key. Created outside this stack. */
  geminiKeyParameter: string;
  /** How many function instances a five-minute schedule keeps ready. 0 turns the schedule off. */
  keepWarmInstances: number;
}

/**
 * The roofing CRM: one Lambda function and one table.
 *
 * - The function serves the pages and the API from a container image of this repository.
 * - The table holds lead records, the only data the CRM owns. Property and permit
 *   data are never stored here: the function asks the Oracle pipeline's MCP endpoint.
 *
 * Nothing runs while idle, and the table bills per request.
 */
export class RoofingCrmStack extends Stack {
  constructor(scope: Construct, id: string, props: RoofingCrmStackProps) {
    super(scope, id, props);
    Tags.of(this).add("project", "roofing-crm");
    Tags.of(this).add("cost-centre", "roofing-crm");

    // Partition by workspace so one query returns a visitor's leads and nobody else's.
    const leads = new dynamodb.Table(this, "Leads", {
      partitionKey: { name: "workspace", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "leadId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Demonstration data: removing the stack removes the leads with it.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const logGroup = new logs.LogGroup(this, "WebLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const web = new lambda.DockerImageFunction(this, "Web", {
      description: "Roofing lead CRM: pages, lead API and assistant",
      code: lambda.DockerImageCode.fromImageAsset(join(__dirname, "..", "..")),
      architecture: lambda.Architecture.X86_64,
      memorySize: 1024,
      // The longest request is an assistant question: several model calls and tool runs.
      timeout: Duration.seconds(120),
      logGroup,
      environment: {
        LEADS_TABLE: leads.tableName,
        GEMINI_KEY_PARAMETER: props.geminiKeyParameter,
        // Lambda Web Adapter sends events that are not HTTP requests (the keep-warm schedule) here.
        AWS_LWA_PASS_THROUGH_PATH: "/api/warm",
      },
    });

    // Least privilege: this table's items, and one parameter.
    leads.grantReadWriteData(web);
    web.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [this.formatArn({ service: "ssm", resource: "parameter", resourceName: props.geminiKeyParameter.replace(/^\//, "") })],
      }),
    );

    // Keep-warm: a schedule calls the function every five minutes so a reviewer never waits
    // for a cold start. Each target is one simultaneous call, so that many instances stay
    // ready. This is the only thing that runs while idle; set keepWarmInstances to 0 to remove
    // it. At 2 GB and about half a second per call it uses under 5% of Lambda's monthly free tier.
    if (props.keepWarmInstances > 0) {
      new events.Rule(this, "KeepWarm", {
        description: "Calls the web function so visitors do not meet a cold start",
        schedule: events.Schedule.rate(Duration.minutes(5)),
        targets: Array.from(
          { length: props.keepWarmInstances },
          (_, i) => new targets.LambdaFunction(web, { event: events.RuleTargetInput.fromObject({ warm: i }), retryAttempts: 0 }),
        ),
      });
    }

    // Public by design: the assignment requires a runtime anyone can open. Leads are
    // scoped to an unguessable workspace ID held in the visitor's browser.
    const url = web.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    new CfnOutput(this, "Url", { value: url.url, description: "Public address of the CRM" });
    new CfnOutput(this, "LeadsTable", { value: leads.tableName });
  }
}
