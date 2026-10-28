import {
  answerQuestion,
  answerFromEvidence,
  interpretPrompt,
} from "../../../packages/agent/src/index";
import {
  DomainError,
  type SearchResponse,
  type QueryInput,
} from "../../../packages/contracts/src/index";
import { createHash, randomUUID } from "node:crypto";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  REVIEW_REGION,
  MICRO_MODEL,
  reviewModel,
  reviewRegion,
} from "../../../packages/runtime-config/src/index";
import {
  DynamoCampaignStore,
  CAMPAIGN_PHASE,
  CAMPAIGN_LIMITS,
  reserveCost,
  type CampaignStore,
  type VerifiedPrice,
} from "../../../packages/agent/src/campaign";
import { verifiedPriceProvider } from "../../../packages/agent/src/prices";
import { mapConfiguration } from "../../../packages/hosted-runtime/src/map-config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { OracleReader } from "../../../packages/oracle-client/src/index";
import type { LeadRepository } from "../../../packages/lead-domain/src/dynamo";
import type { ConverseTransport } from "../../../packages/agent/src/bedrock";
import type { SessionStore } from "../../../packages/hosted-runtime/src/sessions";
import type { QuotaStore } from "../../../packages/hosted-runtime/src/quota";
import type { AccessService } from "../../../packages/hosted-runtime/src/access";
import { OracleClient } from "../../../packages/oracle-client/src/index";
import {
  DynamoLeadStore,
  documentTransport,
} from "../../../packages/lead-domain/src/dynamo";
import {
  answerWithBedrock,
  bedrockTransport,
  ROUTING_ARCHITECTURE,
} from "../../../packages/agent/src/bedrock";
import {
  readSessionCookie,
  sessionCookie,
  clearSessionCookie,
} from "../../../packages/hosted-runtime/src/access";
import { DynamoSessionStore } from "../../../packages/hosted-runtime/src/sessions";
import { AccessError } from "../../../packages/hosted-runtime/src/access";
import { DynamoQuotaStore } from "../../../packages/hosted-runtime/src/quota";
import { secretAccessProvider } from "../../../packages/hosted-runtime/src/secrets";
import { createApp, type AppRequest, type AppResponse } from "./app";
export interface HttpEvent {
  version?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}
export interface HttpResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
  cookies?: string[];
}
/** Exact API Gateway v2 boundary, also used by the packaged local emulation proof. */
export function createLambdaHandler(
  app: (request: AppRequest) => Promise<AppResponse>,
) {
  return async (event: HttpEvent): Promise<HttpResult> => {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    if (Buffer.byteLength(raw) > 64000)
      return {
        statusCode: 413,
        body: JSON.stringify({
          code: "INVALID_INPUT",
          message: "Request too large",
        }),
      };
    let body: unknown;
    try {
      body = raw ? (JSON.parse(raw) as unknown) : undefined;
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({
          code: "INVALID_INPUT",
          message: "Invalid JSON",
        }),
      };
    }
    const result = await app({
      method: event.requestContext?.http?.method ?? "GET",
      path:
        (event.rawPath ?? "/") +
        (event.rawQueryString ? `?${event.rawQueryString}` : ""),
      headers: {
        ...event.headers,
        ...(event.cookies ? { cookie: event.cookies.join("; ") } : {}),
      },
      body,
    });
    const cookie = result.headers["Set-Cookie"];
    return {
      ...result,
      headers: Object.fromEntries(
        Object.entries(result.headers).filter(([key]) => key !== "Set-Cookie"),
      ),
      ...(cookie ? { cookies: [cookie] } : {}),
    };
  };
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required deployment parameter missing: ${name}`);
  return value;
}
export interface HostedRuntime {
  leads: LeadRepository;
  quota: QuotaStore;
  sessions: SessionStore;
  access: () => Promise<AccessService>;
  provider?: ConverseTransport;
  campaign?: CampaignStore;
  price?: () => Promise<VerifiedPrice>;
  mapConfig?: () => Promise<unknown>;
}
let runtime: HostedRuntime | undefined;
function makeRuntime() {
  const region = reviewRegion(required("AWS_REGION"));
  reviewRegion(process.env.PRISM_REGION ?? region);
  if (
    process.env.AWS_DEFAULT_REGION &&
    process.env.AWS_DEFAULT_REGION !== region
  )
    throw new Error("Mixed runtime regions");
  const secretId = required("REVIEW_ACCESS_SECRET_ARN");
  const secrets = new SecretsManagerClient({ region, maxAttempts: 1 });
  const enabledModel =
    process.env.PRISM_ENABLE_MODEL === "true"
      ? required("BEDROCK_MODEL_ID")
      : undefined;
  const price = enabledModel
    ? verifiedPriceProvider(enabledModel, async () => {
        const out = await secrets.send(
          new GetSecretValueCommand({ SecretId: secretId }),
        );
        const root = JSON.parse(out.SecretString ?? "{}");
        return root.modelPrices?.[enabledModel];
      })
    : undefined;
  const document = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region, maxAttempts: 1 }),
  );
  return {
    leads: new DynamoLeadStore(
      documentTransport(document),
      required("LEADS_TABLE_NAME"),
    ),
    quota: new DynamoQuotaStore(document, required("QUOTA_TABLE_NAME")),
    sessions: new DynamoSessionStore(document, required("QUOTA_TABLE_NAME")),
    access: secretAccessProvider(secretId, secrets),
    campaign: new DynamoCampaignStore(document, required("QUOTA_TABLE_NAME")),
    price,
    mapConfig:
      process.env.PRISM_ENABLE_MAP === "true"
        ? mapConfiguration(secretId, secrets)
        : async () => ({ kind: "offline" }),
    provider:
      process.env.PRISM_ENABLE_MODEL === "true"
        ? bedrockTransport(region)
        : undefined,
  };
}
export function createHostedHandler(
  loadRuntime: () => HostedRuntime | Promise<HostedRuntime>,
  oracleFactory: (cookie: string) => OracleReader,
  modelId = () => "",
  clock = Date.now,
) {
  return async (event: HttpEvent): Promise<HttpResult> => {
    try {
      const r = await loadRuntime();
      const access = await r.access();
      const cookie =
        (event.cookies ?? []).join("; ") || event.headers?.cookie || "";
      const oracle = oracleFactory(cookie);
      const app = createApp({
        oracle,
        leads: r.leads,
        mapConfig: r.mapConfig,
        model: r.provider
          ? {
              id: reviewModel(modelId() || MICRO_MODEL, true),
              architecture: ROUTING_ARCHITECTURE,
              phase: CAMPAIGN_PHASE,
              limits: CAMPAIGN_LIMITS,
              region: REVIEW_REGION,
              promptRevision:
                process.env.PRISM_MODEL_PROMPT_REVISION === "repair-1"
                  ? "repair-1"
                  : "base",
            }
          : undefined,
        access: {
          current: async (headers) => {
            const verified = access.verify(readSessionCookie(headers));
            const stored = await r.sessions.get(verified.id);
            if (
              !stored ||
              stored.expiresAt !== verified.expiresAt ||
              stored.expiresAt <= clock() / 1000
            )
              throw new AccessError(401, "Review session expired or revoked");
            return verified;
          },
          issue: async (code) => {
            const result = access.issue(code);
            await r.sessions.put(result.session);
            return {
              session: result.session,
              cookie: sessionCookie(result.token, access.ttl),
            };
          },
          logout: async (headers) => {
            const verified = access.verify(readSessionCookie(headers));
            await r.sessions.revoke(verified.id);
            return clearSessionCookie();
          },
        },
        quota: async (subject, category) => {
          const nowMs = clock();
          const limits = { read: 600, write: 100, auth: 10, model: 20 };
          await r.quota.consume({
            subject,
            category,
            limit: limits[category],
            windowSeconds: category === "auth" ? 60 : 3600,
            nowMs,
          });
          if (category === "model")
            await r.quota.consume({
              subject: "global-model-budget",
              category,
              limit: 60,
              windowSeconds: 86400,
              nowMs,
            });
        },
        ...(r.provider
          ? {
              agent: async (prompt, query, subject) => {
                interpretPrompt(prompt, query);
                const startedAt = Date.now();
                let evidenceDigest: string | undefined,
                  minimizedRowCount = 0;
                const revision =
                  process.env.PRISM_MODEL_PROMPT_REVISION === "repair-1"
                    ? "repair-1"
                    : "base";
                const model = reviewModel(modelId() || MICRO_MODEL, true);
                if (!r.campaign || !r.price)
                  throw new Error(
                    "Durable model campaign and current price configuration required",
                  );
                const requestId = randomUUID(),
                  promptDigest = createHash("sha256")
                    .update(prompt)
                    .digest("hex"),
                  subjectDigest = createHash("sha256")
                    .update(subject)
                    .digest("hex");
                let inputTokens = 0,
                  outputTokens = 0,
                  converseCalls = 0,
                  reservedMicroUsd = 0,
                  measuredMicroUsd = 0,
                  measuredCalls = 0;
                let reads = 0,
                  cached:
                    { data: SearchResponse; query: QueryInput } | undefined;
                const boundedOracle: OracleReader = {
                  detail: (id, snapshot) => oracle.detail(id, snapshot),
                  health: oracle.health ? () => oracle.health!() : undefined,
                  search: async (q) => {
                    if (++reads > 1)
                      throw new DomainError(
                        "COST_LIMIT_REACHED",
                        "Read budget exhausted",
                      );
                    const data = await oracle.search(q);
                    if (
                      data.snapshotId !== query.snapshotId ||
                      data.rows.length > 50
                    )
                      throw new DomainError(
                        "SNAPSHOT_UNAVAILABLE",
                        "Evidence boundary mismatch",
                      );
                    cached = { data, query: q };
                    return data;
                  },
                };
                try {
                  await r.campaign.authorize(model, revision);
                  await r.campaign.reserve({
                    subject,
                    kind: "request",
                    modelId: model,
                    nowMs: clock(),
                  });
                  const price = await r.price();
                  if (price.modelId !== model)
                    throw new Error("Model price identity mismatch");
                  const result = await answerWithBedrock(
                    boundedOracle,
                    r.provider!,
                    prompt,
                    query,
                    {
                      modelId: model,
                      promptRevision: revision,
                      maxRows: 50,
                      maxTurns: 1,
                      maxToolCalls: 1,
                      maxTotalTokens: 12000,
                      deadlineMs: Math.max(1, 28000 - (Date.now() - startedAt)),
                      beforeConverse: async (projection) => {
                        const { inputBytes } = projection;
                        evidenceDigest = projection.evidenceDigest;
                        minimizedRowCount = projection.minimizedRowCount;
                        const cost = reserveCost(inputBytes, price, clock());
                        await r.campaign!.reserve({
                          subject,
                          kind: "converse",
                          modelId: model,
                          nowMs: clock(),
                          reservedMicroUsd: cost,
                        });
                        converseCalls++;
                        reservedMicroUsd += cost;
                      },
                      onUsage: async (usage) => {
                        await r.campaign!.record({
                          requestId,
                          subjectDigest,
                          promptDigest,
                          modelId: model,
                          revision,
                          architecture: ROUTING_ARCHITECTURE,
                          evidenceDigest,
                          minimizedRowCount,
                          region: REVIEW_REGION,
                          at: new Date(clock()).toISOString(),
                          ...usage,
                          measuredMicroUsd: Math.ceil(
                            usage.inputTokens * price.inputUsdPerMillion +
                              usage.outputTokens * price.outputUsdPerMillion,
                          ),
                        });
                        measuredCalls++;
                        measuredMicroUsd += Math.ceil(
                          usage.inputTokens * price.inputUsdPerMillion +
                            usage.outputTokens * price.outputUsdPerMillion,
                        );
                        inputTokens += usage.inputTokens;
                        outputTokens += usage.outputTokens;
                      },
                    },
                  );
                  await r.campaign.record({
                    requestId,
                    subjectDigest,
                    promptDigest,
                    modelId: model,
                    revision,
                    architecture: ROUTING_ARCHITECTURE,
                    evidenceDigest,
                    minimizedRowCount,
                    region: REVIEW_REGION,
                    at: new Date(clock()).toISOString(),
                    callIndex: 0,
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                    evidence: {
                      queryHash: result.toolTrace.map((x) => x.queryHash),
                      snapshotId: query.snapshotId,
                      propertyIds: result.results.map((x) => x.id),
                      citations: result.citations,
                    },
                  });
                  return {
                    ...result,
                    modelAudit: {
                      modelId: model,
                      region: REVIEW_REGION,
                      promptRevision: revision,
                      promptDigest,
                      architecture: ROUTING_ARCHITECTURE,
                      evidenceDigest,
                      minimizedRowCount,
                      inputTokens,
                      outputTokens,
                      converseCalls,
                      reservedMicroUsd,
                      measuredMicroUsd,
                      unmeasuredCalls: converseCalls - measuredCalls,
                    },
                  };
                } catch (error) {
                  if (
                    !(error instanceof DomainError) ||
                    (!["COST_LIMIT_REACHED", "QUERY_TIMEOUT"].includes(
                      error.code,
                    ) &&
                      !(
                        converseCalls > 0 &&
                        ["INVALID_INPUT", "UNSUPPORTED_TOOL"].includes(
                          error.code,
                        )
                      ))
                  )
                    throw error;
                  await r.campaign.record({
                    requestId,
                    subjectDigest,
                    promptDigest,
                    modelId: model,
                    revision,
                    architecture: ROUTING_ARCHITECTURE,
                    evidenceDigest,
                    minimizedRowCount,
                    region: REVIEW_REGION,
                    at: new Date(clock()).toISOString(),
                    callIndex: 0,
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                    reservedMicroUsd,
                    measuredMicroUsd,
                    unmeasuredCalls: converseCalls - measuredCalls,
                    converseCalls,
                    failureCode: error.code,
                    status: "provider-failed",
                  });
                  const fallback = cached
                    ? answerFromEvidence(
                        cached.data,
                        cached.query,
                        "deterministic-fallback",
                      )
                    : reads === 0
                      ? await answerQuestion(boundedOracle, prompt, query)
                      : (() => {
                          throw error;
                        })();
                  return {
                    ...fallback,
                    mode: "deterministic-fallback",
                    caveats: [
                      "Live model could not produce a valid bounded answer; this answer used deterministic evidence. No provider facts were used. Failed attempts retain reserved allowance; unmeasured usage is not claimed as zero spend.",
                      ...fallback.caveats,
                    ],
                    modelAudit: {
                      modelId: model,
                      region: REVIEW_REGION,
                      promptRevision: revision,
                      promptDigest,
                      architecture: ROUTING_ARCHITECTURE,
                      evidenceDigest,
                      minimizedRowCount,
                      inputTokens,
                      outputTokens,
                      converseCalls,
                      reservedMicroUsd,
                      measuredMicroUsd,
                      unmeasuredCalls: converseCalls - measuredCalls,
                      failureCode: error.code,
                    },
                  };
                }
              },
            }
          : {}),
      });
      return await createLambdaHandler(app)(event);
    } catch {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          code: "SNAPSHOT_UNAVAILABLE",
          message: "Review runtime configuration or dependency unavailable",
        }),
      };
    }
  };
}
export async function handler(event: HttpEvent) {
  return createHostedHandler(
    () => (runtime ??= makeRuntime()),
    (cookie) =>
      new OracleClient(
        required("ORACLE_API_URL"),
        (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...init?.headers, Cookie: cookie },
          }),
        {
          allowLoopback: false,
          approvedOrigins: required("ORACLE_APPROVED_ORIGINS").split(","),
          timeoutMs: 20000,
        },
      ),
    () => required("BEDROCK_MODEL_ID"),
  )(event);
}
// Pure exports support local emulation of the exact bundled routing and orchestration code.
export { createApp, answerWithBedrock };
export { DomainError };
