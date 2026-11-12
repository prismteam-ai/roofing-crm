/** CDK app for the Roofing CRM frontend (Amplify, no Git) and its Amazon Location map key. */
import { readFileSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { CrmWebStack } from "../lib/crm-web-stack.ts";
import { CrmMapKeyStack } from "../lib/crm-map-key-stack.ts";

const root = new URL("../../../../", import.meta.url).pathname;
const secrets = JSON.parse(readFileSync(`${root}.secrets/crm.json`, "utf8"));
// The AWS account comes from the CDK CLI (the credentials in use), never from source.
const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account)
  throw new Error(
    "CDK_DEFAULT_ACCOUNT is not set: run this app through the CDK CLI with credentials for the target account",
  );
const env = { account, region: "eu-north-1" };
const app = new cdk.App();
const siteDir = app.node.tryGetContext("siteDir") ?? `${root}apps/crm/dist`;

const web = new CrmWebStack(app, "RoofingCrmWeb", {
  env,
  siteDir,
  basicUser: secrets.basicUser,
  basicPass: secrets.basicPass,
});
new CrmMapKeyStack(app, "RoofingCrmMapKey", {
  env,
  origin: web.origin,
  allowActions: (
    app.node.tryGetContext("mapActions") ?? "geo-maps:GetTile"
  ).split(","),
  alertTopicParam: app.node.tryGetContext("alertTopicParam"), // set once OracleLaGuards exists
});
for (const s of app.node.children)
  if (s instanceof cdk.Stack) cdk.Tags.of(s).add("project_name", "roofing-crm");
