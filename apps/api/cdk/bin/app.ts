#!/usr/bin/env node
/**
 * CDK app entry that synthesizes LeadsStack and ApiStack.
 *
 * Region defaults to us-east-2. No custom API domain — ApiStack outputs the
 * default execute-api HTTPS URL.
 *
 * After Amplify Hosting exists, redeploy with the real SPA origin so API
 * Gateway CORS matches (exact origin; no *.amplifyapp.com wildcard):
 *
 *   AMPLIFY_WEB_ORIGIN=https://<branch>.dxxxxxx.amplifyapp.com cdk deploy ...
 *
 * Or: cdk deploy -c amplifyWebOrigin=https://...
 */
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.js";
import { LeadsStack } from "../lib/leads-stack.js";
import { RagStack } from "../lib/rag-stack.js";

const app = new cdk.App();

const stackEnvironment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-2",
};

/**
 * Resolves browser CORS origins for ApiStack.
 *
 * Prefers AMPLIFY_WEB_ORIGIN, then CDK context `amplifyWebOrigin`.
 * When unset, ApiStack keeps the placeholder until the SPA URL exists.
 */
function resolveAmplifyWebOrigins(): string[] | undefined {
  const fromEnv = process.env.AMPLIFY_WEB_ORIGIN?.trim();
  const fromContext = app.node.tryGetContext("amplifyWebOrigin");
  const fromContextString = typeof fromContext === "string" ? fromContext.trim() : "";
  const origin = fromEnv || fromContextString;
  if (origin.length === 0) {
    return undefined;
  }
  return [origin.replace(/\/$/, "")];
}

const leadsStack = new LeadsStack(app, "RoofingCrmLeadsStack", {
  env: stackEnvironment,
  description: "LeadRecord DynamoDB table for roofing-crm-challenge outreach snapshots",
});

/**
 * RagStack is optional. Set SKIP_RAG_STACK=1 (or `-c skipRagStack=true`) to
 * deploy Api + Leads only (agent.ask stays not-indexed).
 */
const skipRagStack =
  process.env.SKIP_RAG_STACK === "1" || app.node.tryGetContext("skipRagStack") === true;

const ragStack = skipRagStack
  ? undefined
  : new RagStack(app, "RoofingCrmRagStack", {
      env: stackEnvironment,
      description:
        "Managed OpenSearch domain + S3 corpus + indexer for roofing opportunity RAG",
      fixtureOnlyIndexer: false,
    });

const apiStack = new ApiStack(app, "RoofingCrmApiStack", {
  env: stackEnvironment,
  description:
    "tRPC Lambda + HTTP API for roofing-crm-challenge (execute-api URL, no custom domain)",
  leadRecordTable: leadsStack.leadRecordTable,
  amplifyWebOrigins: resolveAmplifyWebOrigins(),
  ...(ragStack !== undefined
    ? {
        ragOpenSearchEndpoint: `https://${ragStack.openSearchEndpoint}`,
        ragIndexName: ragStack.indexName,
        ragCorpusBucket: ragStack.corpusBucket,
        ragOpenSearchDomainArn: ragStack.openSearchDomain.domainArn,
      }
    : {}),
});

if (ragStack !== undefined) {
  apiStack.addDependency(ragStack);
}

app.synth();
