#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { RoofingCrmStack } from "../lib/roofing-crm-stack";

const app = new App();

// Deploy with an explicit profile:  npx cdk deploy --profile <your-profile>
new RoofingCrmStack(app, "RoofingCrm", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-2" },
  geminiKeyParameter: "/miami-dade-oracle/gemini-api-key",
  keepWarmInstances: 2,
  description: "Roofing lead CRM: one Lambda function with a public URL and one DynamoDB table for leads",
});
