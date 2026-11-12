import * as amplify from "@aws-cdk/aws-amplify-alpha";
import * as cdk from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

/**
 * The app ID, published for the pipeline repository: its Explorer is a second branch (`explorer`) of this
 * app, and its data API builds both CORS origins from the ID. Read there at deploy time.
 */
export const APP_ID_PARAM = "/roofing-crm/web/app-id";

export interface CrmWebStackProps extends cdk.StackProps {
  siteDir: string;
  basicUser: string;
  basicPass: string;
}

/** Amplify Hosting app without a Git connection: one branch deployed from the built dist, behind basic auth. */
export class CrmWebStack extends cdk.Stack {
  readonly origin: string;
  constructor(scope: Construct, id: string, props: CrmWebStackProps) {
    super(scope, id, props);
    const app = new amplify.App(this, "App", {
      appName: "roofing-crm",
      platform: amplify.Platform.WEB,
      customRules: [amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT],
    });
    app.addBranch("main", {
      asset: new Asset(this, "Site", { path: props.siteDir }),
      // The password sits in the CloudFormation template, so there is no Secrets Manager standing cost.
      basicAuth: amplify.BasicAuth.fromCredentials(
        props.basicUser,
        cdk.SecretValue.unsafePlainText(props.basicPass),
      ),
    });
    this.origin = `https://main.${app.defaultDomain}`;
    // App-level settings (rewrite rule, basic auth off at app level, service role) apply to every branch,
    // the pipeline's Explorer branch included; this stack creates only `main`.
    new ssm.StringParameter(this, "AppIdParam", {
      parameterName: APP_ID_PARAM,
      stringValue: app.appId,
      description:
        "Amplify app ID of roofing-crm; read by the pipeline's Explorer branch stack and data API CORS",
    });
    // The token-hash SSM parameter is owned by the data API stack (pipeline apps/api/cdk/clients.json).
    new cdk.CfnOutput(this, "AppId", { value: app.appId });
    new cdk.CfnOutput(this, "Origin", { value: this.origin });
  }
}
