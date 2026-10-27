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
/** Exact API Gateway v2 boundary, also used by the packaged local emulation proof. */
export function createLambdaHandler(
  app: (request: AppRequest) => Promise<AppResponse>,
) {
  return async (event: HttpEvent) => {
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
}
let runtime: HostedRuntime | undefined;
function makeRuntime() {
  const region = required("AWS_REGION");
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
    access: secretAccessProvider(required("REVIEW_ACCESS_SECRET_ARN")),
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
  return async (event: HttpEvent) => {
    try {
      const r = await loadRuntime();
      const access = await r.access();
      const cookie =
        (event.cookies ?? []).join("; ") || event.headers?.cookie || "";
      const oracle = oracleFactory(cookie);
      const app = createApp({
        oracle,
        leads: r.leads,
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
              agent: (prompt, query) =>
                answerWithBedrock(oracle, r.provider!, prompt, query, {
                  modelId: modelId(),
                  maxRows: 50,
                  maxTurns: 3,
                  maxToolCalls: 2,
                  maxTotalTokens: 12000,
                  deadlineMs: 15000,
                }),
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
        },
      ),
    () => required("BEDROCK_MODEL_ID"),
  )(event);
}
// Pure exports support local emulation of the exact bundled routing and orchestration code.
export { createApp, answerWithBedrock };
export { DomainError } from "../../../packages/contracts/src/index";
