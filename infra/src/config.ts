// infra/bin/app.ts's loadConfig: region from @crm/config (fails fast on a disallowed region,
// CLAUDE.md "region-locked to eu-north-1"), plus the cdk.json context values the CDK app needs
// (crm:githubRepository, crm:githubRef, crm:allowedRegions, crm:alarmEmail — see infra/cdk.json),
// plus the per-synth deploy nonce CrmSync's deploy-time sync start is named by.
import { loadConfig as loadRuntimeConfig, type RuntimeConfig } from "@crm/config";

export interface CrmAppConfig extends RuntimeConfig {
  readonly githubRepository: string;
  readonly githubRef: string;
  readonly additionalBranches: readonly string[];
  /** cdk.json context `crm:alarmEmail`: the SNS email subscriber for the FetchPart DLQ alarm and
   *  the citation-groundedness alarm (ARD-B §13's SNS-instead-of-PagerDuty deviation). */
  readonly alarmEmail: string;
  /** cdk.json context `crm:explorerBaseUrl`: CountyLens's origin, set on the API Lambda as
   *  `EXPLORER_BASE_URL` (the lineage link and the Apps menu). The API has no built-in default. */
  readonly explorerBaseUrl: string;
  /** cdk.json context `crm:taskACloudFrontBaseUrl`: Task A's CloudFront host, the first gateway
   *  CrmSync's Plan and FetchPart try (ADR-02). */
  readonly taskACloudFrontBaseUrl: string;
  /** cdk.json context `crm:domainName`: the custom domain CrmDomain associates with the web app. */
  readonly domainName: string;
  /** Changes on every synth unless pinned via `CRM_DEPLOY_NONCE`: CrmSync's deploy-time
   *  StartExecution is named `{manifestCid}-{deployNonce}`, so every deploy re-attempts the sync
   *  (a failed first sync of a CID is retried; A→B→A re-syncs A) and Plan's AlreadyPromoted
   *  check makes a repeat of an already-served CID a no-op. */
  readonly deployNonce: string;
  readonly account?: string;
}

export type ContextGetter = (key: string) => unknown;

export type LoadConfigEnv = Record<string, string | undefined>;

/** Constitution VI: Bedrock is the default and Golden Path (ADR-06 §6.1) — a safe, documented
 *  default, unlike `DATA_MANIFEST_CID`, which has none and must fail fast. `@crm/config`'s
 *  `loadConfig` itself no longer defaults `AI_PROVIDER`/`AGENT_MODEL_ID` (it fails fast like every
 *  other field); this composition layer is where the actual default selection lives, since it
 *  has `process.env` in scope before `loadRuntimeConfig` validates it. */
function withAiProviderDefaults(env: LoadConfigEnv): LoadConfigEnv {
  const aiProvider = env.AI_PROVIDER ?? "bedrock";
  const agentModelId =
    env.AGENT_MODEL_ID ??
    (aiProvider === "bedrock" ? "eu.anthropic.claude-sonnet-4-6" : "anthropic/claude-sonnet-4.6");
  return { ...env, AI_PROVIDER: aiProvider, AGENT_MODEL_ID: agentModelId };
}

/** Deliberately loose (a typo'd domain is not caught here) — it only refuses values that are
 *  clearly not an address at all; SNS itself confirms the subscription by email. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An https origin with no path (`https://host`); a trailing slash is dropped. */
function originFrom(getContext: ContextGetter, key: string): string {
  const value = getContext(key);
  if (typeof value !== "string" || !/^https:\/\/[^\s/]+\/?$/.test(value)) {
    throw new Error(`cdk.json context ${key} is required and must be an https origin`);
  }
  return value.replace(/\/$/, "");
}

/** Step Functions execution names allow [A-Za-z0-9_-]; 16 chars keeps `{59-char CID}-{nonce}`
 *  inside the 80-char limit. */
const DEPLOY_NONCE_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

function deployNonceFrom(env: LoadConfigEnv, now: () => number): string {
  const nonce = env.CRM_DEPLOY_NONCE ?? now().toString(36);
  if (!DEPLOY_NONCE_PATTERN.test(nonce)) {
    throw new Error(
      `CRM_DEPLOY_NONCE must match ${DEPLOY_NONCE_PATTERN.source} (it becomes part of a Step Functions execution name)`,
    );
  }
  return nonce;
}

export function loadConfig(
  env: LoadConfigEnv,
  getContext: ContextGetter,
  now: () => number = Date.now,
): CrmAppConfig {
  const runtime = loadRuntimeConfig(withAiProviderDefaults(env));
  const githubRepository = getContext("crm:githubRepository");
  const githubRef = getContext("crm:githubRef");
  if (typeof githubRepository !== "string" || githubRepository === "") {
    throw new Error("cdk.json context crm:githubRepository is required");
  }
  if (typeof githubRef !== "string" || githubRef === "") {
    throw new Error("cdk.json context crm:githubRef is required");
  }
  const alarmEmail = getContext("crm:alarmEmail");
  if (typeof alarmEmail !== "string" || !EMAIL_PATTERN.test(alarmEmail)) {
    throw new Error("cdk.json context crm:alarmEmail is required and must be an email address");
  }
  const explorerBaseUrl = originFrom(getContext, "crm:explorerBaseUrl");
  const taskACloudFrontBaseUrl = originFrom(getContext, "crm:taskACloudFrontBaseUrl");
  const domainName = getContext("crm:domainName");
  if (typeof domainName !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domainName)) {
    throw new Error("cdk.json context crm:domainName is required and must be a host name");
  }
  const additionalBranchesRaw = getContext("crm:additionalBranches");
  const additionalBranches = Array.isArray(additionalBranchesRaw)
    ? additionalBranchesRaw.filter((b): b is string => typeof b === "string")
    : [];
  return {
    ...runtime,
    githubRepository,
    githubRef,
    additionalBranches,
    alarmEmail,
    explorerBaseUrl,
    taskACloudFrontBaseUrl,
    domainName,
    deployNonce: deployNonceFrom(env, now),
    ...(env.CDK_DEFAULT_ACCOUNT === undefined ? {} : { account: env.CDK_DEFAULT_ACCOUNT }),
  };
}
