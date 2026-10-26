// createCrmStacks: the CDK app's stack graph (infra/bin/app.ts). Deploy order for this story
// (plan.md "Data Flow & Integration Points"): CrmOps → CrmApi → CrmWeb → CrmDomain. CrmData and
// CrmSync are declared as empty stubs (T005) so every story's CDK app has the same six-stack
// shape (architecture-constitution.md §9); they carry no dependency edges yet because they hold
// no resources this story depends on.
import { App, Aspects, Tags } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmDataStack } from "../lib/crm-data-stack.js";
import { CrmDomainStack } from "../lib/crm-domain-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";
import { CrmWebStack } from "../lib/crm-web-stack.js";
import type { CrmAppConfig } from "./config.js";

/** NodejsFunction bundles these directly from source (esbuild) — no separate build step. */
const HEALTH_HANDLER_ENTRY = "../../apps/api/src/handlers/health.ts";
const LOCKOUT_HANDLER_ENTRY = "../../apps/api/src/auth/lockout-handler.ts";
const PLAN_HANDLER_ENTRY = "../../apps/sync/handlers/plan.ts";
const FETCH_PART_HANDLER_ENTRY = "../../apps/sync/handlers/fetchPart.ts";
const BUILD_INDEX_HANDLER_ENTRY = "../../apps/sync/handlers/buildIndex.ts";
const VALIDATE_HANDLER_ENTRY = "../../apps/sync/handlers/validate.ts";
const PROMOTE_HANDLER_ENTRY = "../../apps/sync/handlers/promote.ts";
/** B-07 creates this table; CrmSync only ever references it by name for the META#index pointer
 * item (architecture-constitution.md §9 — no new table here, per infra/test/crm-sync-stack.test.ts's
 * own literal fixture value). */
const CRM_LEADS_TABLE_NAME = "crm-leads";

/** The git branch of the Amplify app that crm.aldarraj.com is served from: the feature branch (the
 *  PR head) when it is deployed, else the primary branch. Never the stale primary one by accident. */
export function domainBranchName(
  deployed: readonly { readonly branchName: string }[],
  primaryBranchName: string,
): string {
  return (
    deployed.find((b) => b.branchName === "feature/roofing-crm")?.branchName ?? primaryBranchName
  );
}

export function createCrmStacks(app: App, config: CrmAppConfig): void {
  const env = {
    region: config.region,
    ...(config.account === undefined ? {} : { account: config.account }),
  };

  const dataStack = new CrmDataStack(app, "CrmData", { env });
  const syncStack = new CrmSyncStack(app, "CrmSync", {
    env,
    planHandlerEntry: new URL(PLAN_HANDLER_ENTRY, import.meta.url).pathname,
    fetchPartHandlerEntry: new URL(FETCH_PART_HANDLER_ENTRY, import.meta.url).pathname,
    buildIndexHandlerEntry: new URL(BUILD_INDEX_HANDLER_ENTRY, import.meta.url).pathname,
    validateHandlerEntry: new URL(VALIDATE_HANDLER_ENTRY, import.meta.url).pathname,
    promoteHandlerEntry: new URL(PROMOTE_HANDLER_ENTRY, import.meta.url).pathname,
    indexBucketName: dataStack.indexBucket.bucketName,
    leadsTableName: CRM_LEADS_TABLE_NAME,
    // B-09 auto-sync: the one place the served Task A run is chosen. Changing DATA_MANIFEST_CID and
    // deploying updates CrmSync's SSM-pinned CID and starts one sync of that run.
    dataManifestCid: config.dataManifestCid,
    // B-09 review fix: a new nonce every synth, so every deploy re-attempts the sync start
    // (crm-sync-stack.ts's deploy-time StartExecution).
    deployNonce: config.deployNonce,
    // B-09 T050/T052 (AC-6): the FetchPart DLQ alarm's (and CrmOps's groundedness alarm's) SNS
    // email subscriber. From cdk.json context `crm:alarmEmail` (infra/src/config.ts), never a
    // literal here.
    alarmEmail: config.alarmEmail,
    // From cdk.json context `crm:taskACloudFrontBaseUrl` (infra/src/config.ts), never a literal.
    taskACloudFrontBaseUrl: config.taskACloudFrontBaseUrl,
  });
  syncStack.addDependency(dataStack);

  const opsStack = new CrmOpsStack(app, "CrmOps", {
    env,
    lockoutHandlerEntry: new URL(LOCKOUT_HANDLER_ENTRY, import.meta.url).pathname,
    // B-09 T053: the `RoofingCrm` dashboard's DLQ-depth/alarm-status widgets read these straight
    // from CrmSyncStack's own public queue/alarm references (no second DLQ, no duplicated alarm
    // definition).
    fetchPartDlq: syncStack.fetchPartDlq,
    fetchPartDlqAlarm: syncStack.fetchPartDlqAlarm,
    alarmTopic: syncStack.alarmTopic,
  });
  opsStack.addDependency(syncStack);

  const apiStack = new CrmApiStack(app, "CrmApi", {
    env,
    healthHandlerEntry: new URL(HEALTH_HANDLER_ENTRY, import.meta.url).pathname,
    userPool: opsStack.userPool,
    userPoolClient: opsStack.userPoolClient,
    lockoutTable: opsStack.lockoutTable,
    // B-03: search.properties/search.permits/property.get read the B-02 index this way too.
    indexBucketName: dataStack.indexBucket.bucketName,
    leadsTableName: CRM_LEADS_TABLE_NAME,
    // B-09 T017: rateLimiter.ts/spendCap.ts read/write this table.
    agentUsageTableName: dataStack.agentUsageTable.tableName,
    // B-09: apps/api/src/agent/getModel.ts reads these via the Lambda's environment.
    aiProvider: config.aiProvider,
    agentModelId: config.agentModelId,
    // From cdk.json context `crm:explorerBaseUrl`: the API Lambda's EXPLORER_BASE_URL.
    explorerBaseUrl: config.explorerBaseUrl,
  });
  // The recorded deviation from architecture-constitution.md §11's literal stack order
  // (plan.md's Complexity Tracking table): CrmApi's JWT authorizer needs CrmOps's pool first.
  apiStack.addDependency(opsStack);
  // B-03: the API Lambda now reads CrmData's index bucket directly.
  apiStack.addDependency(dataStack);

  const webStack = new CrmWebStack(app, "CrmWeb", {
    env,
    githubRepository: config.githubRepository,
    githubRef: config.githubRef,
    additionalBranches: config.additionalBranches,
    apiUrl: apiStack.apiUrl,
    userPoolId: opsStack.userPool.userPoolId,
    userPoolClientId: opsStack.userPoolClient.userPoolClientId,
  });
  webStack.addDependency(apiStack);

  const domainStack = new CrmDomainStack(app, "CrmDomain", {
    env,
    domainName: config.domainName,
    // Round 1 decision D-2 (cut over only after the stories merge) is now executed: B-01, B-02,
    // B-03 and B-07 are merged on feature/roofing-crm. The two DNS records go in at Namecheap.
    cutover: true,
    web: {
      appId: webStack.app.attrAppId,
      branchName: domainBranchName(webStack.additionalBranches, webStack.branch.branchName),
    },
  });
  domainStack.addDependency(webStack);

  for (const stack of [dataStack, syncStack, opsStack, apiStack, webStack, domainStack]) {
    // constitution Article III: every resource tagged project_name=roofing-crm (TN01).
    Tags.of(stack).add("project_name", "roofing-crm");
  }

  // TN02: cdk-nag on every stack, enumerated explicitly.
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
