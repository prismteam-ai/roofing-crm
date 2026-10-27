import { App, Stack, Tags, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
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
/** Synth-only resource candidate. Runtime adapters are intentionally not deploy-ready in P1. */
class CrmCandidateStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, { env: { region: "us-east-2" } });
    Tags.of(this).add("Project", "PrismAssessment");
    Tags.of(this).add("Phase", "P1-SYNTH-ONLY");
    Tags.of(this).add("Retention", "Review-window-unapproved");
    const leads = new Table(this, "DemoLeads", {
      partitionKey: { name: "sessionId", type: AttributeType.STRING },
      sortKey: { name: "leadId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const assets = new Bucket(this, "FrontendAssets", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const fn = new LambdaFunction(this, "CrmCandidateHandler", {
      runtime: Runtime.NODEJS_24_X,
      handler: "index.handler",
      reservedConcurrentExecutions: 2,
      memorySize: 512,
      code: Code.fromInline(
        'exports.handler = async () => ({statusCode:503,body:JSON.stringify({message:"P1 synth only; deployment and runtime adapter approval required"})});',
      ),
    });
    leads.grantReadWriteData(fn);
    const api = new HttpApi(this, "CrmHttpApi");
    api.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration("CrmIntegration", fn),
    });
    new CfnOutput(this, "StagingStatus", {
      value:
        "Not deployed; production auth, Dynamo adapter and hosted runtime remain later gates",
    });
    new CfnOutput(this, "AssetBucketRef", { value: assets.bucketName });
  }
}
const app = new App();
new CrmCandidateStack(app, "PrismCrmP1Candidate");
app.synth();
