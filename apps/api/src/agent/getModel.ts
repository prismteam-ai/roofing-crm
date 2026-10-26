// T033 (B-09, Phase 4/US1): the `AI_PROVIDER` switch (ADR-06 §6.1, docs/decisions/
// 0000-agent-architecture.md: "Selected by AI_PROVIDER... Model ids come from config and never
// appear in agent code."). The switch's two branch names (`bedrock`/`gateway`) are the only
// literals this module hard-codes; the model id itself always comes from `AGENT_MODEL_ID` (never
// a fallback default — same fail-fast rule as `@crm/config`'s `loadConfig`), so a misconfigured
// deploy throws at the first `agent.ask` rather than silently calling some other model.
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createGateway, type LanguageModel } from "ai";

export type AiProviderEnv = Record<string, string | undefined>;

export class UnsupportedAiProviderError extends Error {
  constructor(readonly provider: string | undefined) {
    super(
      `getModel: unsupported AI_PROVIDER "${String(provider)}" — expected "bedrock" or "gateway".`,
    );
  }
}

export class MissingAgentModelIdError extends Error {
  constructor() {
    super("getModel: AGENT_MODEL_ID is not set — refusing to default to any model.");
  }
}

/** The gateway provider needs a key. In the deployed Lambda it is read from Secrets Manager (the
 *  secret named by `AI_GATEWAY_SECRET_ARN`, granted by CDK only when the `crm:aiGatewaySecretArn`
 *  context is set); locally `AI_GATEWAY_API_KEY` (sourced from ~/.config/assessment/ai-gateway.env)
 *  works. Anywhere neither exists, or the secret cannot be read, fail typed here rather than with a
 *  provider auth error at the first model call. The message never carries the key. */
export class GatewayKeyNotWiredError extends Error {
  constructor(reason = "no AI Gateway key is available") {
    super(
      `getModel: AI_PROVIDER=gateway but ${reason} (set AI_GATEWAY_SECRET_ARN via the crm:aiGatewaySecretArn CDK context, or AI_GATEWAY_API_KEY locally).`,
    );
    this.name = "GatewayKeyNotWiredError";
  }
}

/** Module-scope cache of the key read from Secrets Manager: one read per Lambda sandbox. The
 *  in-flight promise is cached so concurrent first calls share the read; a failed read is dropped
 *  so the next call retries. Never logged, never copied into `process.env`. */
let gatewayKeyPromise: Promise<string> | undefined;
let gatewayKey: string | undefined;

async function readGatewayKey(secretArn: string, client: SecretsManagerClient): Promise<string> {
  let secretString: string | undefined;
  try {
    secretString = (await client.send(new GetSecretValueCommand({ SecretId: secretArn })))
      .SecretString;
  } catch (error) {
    // Only the error class is surfaced; the SDK message can echo request details.
    throw new GatewayKeyNotWiredError(
      `the AI Gateway secret could not be read (${error instanceof Error ? error.name : "error"})`,
    );
  }
  let key = secretString?.trim() ?? "";
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { AI_GATEWAY_API_KEY?: unknown };
      key = typeof parsed.AI_GATEWAY_API_KEY === "string" ? parsed.AI_GATEWAY_API_KEY.trim() : "";
    } catch {
      key = "";
    }
  }
  if (key === "") throw new GatewayKeyNotWiredError("the AI Gateway secret is empty");
  return key;
}

// Lazy singleton per provider+modelId combination — the same per-Lambda-sandbox caching pattern
// as `usageGuard.ts`'s `requireUsageGuard`/`leadIndex.ts`'s `tryLeadIndex`, built once rather than on
// every `agent.ask` — but keyed on the inputs (not a single unconditional cache) since a test may
// call `getModel` with different `env` values in the same process.
const cache = new Map<string, Exclude<LanguageModel, string>>();

/** Reads `AI_PROVIDER` (`"bedrock" | "gateway"`) and `AGENT_MODEL_ID` from `env` (defaults to
 *  `process.env`, injectable for tests) and returns the corresponding Vercel AI SDK
 *  `LanguageModel` — `@ai-sdk/amazon-bedrock`'s provider for `bedrock` (ADR §6.1: `eu.` inference
 *  profile ids, read from config, e.g. `eu.anthropic.claude-sonnet-4-6`), or the AI SDK's own
 *  `gateway` provider for `gateway` (e.g. `anthropic/claude-sonnet-4.6`). Any other value throws
 *  `UnsupportedAiProviderError`, never a silent fallback (constitution VI).
 */
export function getModel(env: AiProviderEnv = process.env): Exclude<LanguageModel, string> {
  const modelId = env.AGENT_MODEL_ID;
  if (modelId === undefined || modelId === "") {
    throw new MissingAgentModelIdError();
  }
  const provider = env.AI_PROVIDER;
  const key = `${String(provider)}:${modelId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let model: Exclude<LanguageModel, string>;
  switch (provider) {
    case "bedrock": {
      const bedrock = createAmazonBedrock({});
      model = bedrock(modelId);
      break;
    }
    case "gateway": {
      const local = env.AI_GATEWAY_API_KEY;
      const apiKey = local !== undefined && local !== "" ? local : gatewayKey;
      if (apiKey === undefined || apiKey === "") throw new GatewayKeyNotWiredError();
      model = createGateway({ apiKey })(modelId);
      break;
    }
    default:
      throw new UnsupportedAiProviderError(provider);
  }
  cache.set(key, model);
  return model;
}

/** Async entry point for the request path: for `AI_PROVIDER=gateway` with no local key it first
 *  loads the key from Secrets Manager (cached for the sandbox), then returns `getModel(env)`. Every
 *  other provider is exactly `getModel(env)`. */
export async function resolveModel(
  env: AiProviderEnv = process.env,
  secrets?: SecretsManagerClient,
): Promise<Exclude<LanguageModel, string>> {
  const secretArn = env.AI_GATEWAY_SECRET_ARN;
  if (
    env.AI_PROVIDER === "gateway" &&
    gatewayKey === undefined &&
    (env.AI_GATEWAY_API_KEY === undefined || env.AI_GATEWAY_API_KEY === "") &&
    secretArn !== undefined &&
    secretArn !== "" &&
    env.AGENT_MODEL_ID !== undefined &&
    env.AGENT_MODEL_ID !== ""
  ) {
    gatewayKeyPromise ??= readGatewayKey(secretArn, secrets ?? new SecretsManagerClient({}));
    try {
      gatewayKey = await gatewayKeyPromise;
    } catch (error) {
      gatewayKeyPromise = undefined;
      throw error;
    }
  }
  return getModel(env);
}

/** Test-only reset point, same shape as `setLeadIndexForTest`/`setUsageGuardForTest`: clears the
 *  per-provider+modelId cache so a test that varies `AI_PROVIDER`/`AGENT_MODEL_ID` doesn't read
 *  back a previous test's cached model instance. */
export function resetModelCacheForTest(): void {
  cache.clear();
  gatewayKey = undefined;
  gatewayKeyPromise = undefined;
}
