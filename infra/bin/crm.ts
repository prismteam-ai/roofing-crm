/**
 * CDK app for the hosted CRM. Settings: deploy/hosted.json (committed, no secrets).
 * Alarm email at deploy time only: `-c alarmEmail=…`. Full deploy (stack, then the web build):
 * deploy/deploy.sh.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { App, Tags } from "aws-cdk-lib";
import { CrmStack, PROJECT_TAG } from "../lib/crm-stack.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = JSON.parse(readFileSync(path.join(root, "deploy", "hosted.json"), "utf8"));
const app = new App();

new CrmStack(app, "RoofingCrm", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-2" },
  root,
  oracleUrl: cfg.oracleUrl,
  oracleMcpUrl: cfg.oracleMcpUrl,
  oracleManifestCid: cfg.oracleManifestCid,
  anthropicKeyParam: cfg.anthropicKeyParam,
  agentModel: cfg.agentModel,
  agentDailyTokens: cfg.agentDailyTokens,
  agentPerIpPerMinute: cfg.agentPerIpPerMinute,
  leadCreatesPerDay: cfg.leadCreatesPerDay,
  monthlyBudgetUsd: cfg.monthlyBudgetUsd,
  alarmEmail: app.node.tryGetContext("alarmEmail"),
});
Tags.of(app).add("project_name", PROJECT_TAG);
