import {
  DomainError,
  LeadCreateSchema,
  LeadUpdateSchema,
  QuerySchema,
  CONTRACT_VERSION,
} from "../../../packages/contracts/src/index";
import type { OracleReader } from "../../../packages/oracle-client/src/index";
import type { LeadRepository } from "../../../packages/lead-domain/src/dynamo";
import {
  BUILD_IDENTITY,
  type BuildIdentity,
} from "../../../packages/runtime-config/src/index";
import { AccessError } from "../../../packages/hosted-runtime/src/access";
import {
  answerQuestion,
  interpretPrompt,
  type AgentAnswer,
} from "../../../packages/agent/src/index";
export interface AppRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}
export interface AppResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
export interface SessionIdentity {
  id: string;
  expiresAt?: number;
  workspaceId?: string;
}
export interface AccessAdapter {
  current(
    headers: Record<string, string | undefined>,
  ): SessionIdentity | Promise<SessionIdentity>;
  issue(code: string): Promise<{ session: SessionIdentity; cookie: string }>;
  logout(headers: Record<string, string | undefined>): string | Promise<string>;
}
export interface AppDependencies {
  release?: BuildIdentity;
  model?: {
    id: string;
    region: "us-east-1";
    promptRevision: "base" | "repair-1";
    architecture: "one-call-tool-router-v1";
    phase: "prism-assessment-p4";
    limits: Readonly<Record<string, number>>;
  };
  mapConfig?: () => Promise<unknown>;
  oracle: OracleReader;
  leads: LeadRepository;
  access?: AccessAdapter;
  quota?: (
    subject: string,
    category: "read" | "write" | "auth" | "model",
  ) => Promise<void>;
  agent?: (
    prompt: string,
    query: ReturnType<typeof QuerySchema.parse>,
    subject: string,
  ) => Promise<AgentAnswer>;
}
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const response = (
  statusCode: number,
  value: unknown,
  extra: Record<string, string> = {},
): AppResponse => {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 4000000)
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        code: "COST_LIMIT_REACHED",
        message:
          "Response exceeds the review byte limit. Refine the query; stored history was preserved.",
      }),
    };
  return { statusCode, headers: { ...headers, ...extra }, body };
};
export function createApp(deps: AppDependencies) {
  return async (req: AppRequest): Promise<AppResponse> => {
    let agentInvoked = false;
    try {
      const url = new URL(req.path, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/api/health") {
        if (!deps.oracle.health)
          throw new DomainError(
            "SNAPSHOT_UNAVAILABLE",
            "Oracle health is unavailable",
          );
        return response(200, {
          ...(await deps.oracle.health()),
          ...(deps.release ?? BUILD_IDENTITY),
          contractVersion: CONTRACT_VERSION,
          accessMode: deps.access ? "review-session" : "local",
          provider: deps.agent
            ? "bedrock-tool-routed"
            : "deterministic-offline",
          ...(deps.model ? { model: deps.model } : {}),
        });
      }
      const object = () => {
        if (
          !req.body ||
          typeof req.body !== "object" ||
          Array.isArray(req.body)
        )
          throw new DomainError("INVALID_INPUT", "Request object required");
        return req.body as Record<string, unknown>;
      };
      if (url.pathname === "/api/session") {
        if (!deps.access)
          return response(200, { mode: "local", session: null });
        if (req.method === "POST") {
          await deps.quota?.("review-entry", "auth");
          const input = object();
          if (
            Object.keys(input).some((k) => k !== "accessCode") ||
            typeof input.accessCode !== "string"
          )
            throw new DomainError(
              "INVALID_INPUT",
              "Review access code required",
            );
          const issued = await deps.access.issue(input.accessCode);
          return response(
            200,
            { session: issued.session },
            { "Set-Cookie": issued.cookie },
          );
        }
        if (req.method === "DELETE")
          return response(
            200,
            { session: null },
            { "Set-Cookie": await deps.access.logout(req.headers) },
          );
        if (req.method === "GET")
          return response(200, {
            session: await deps.access.current(req.headers),
          });
      }
      const verified = await deps.access?.current(req.headers);
      const scoped = (supplied: unknown): string => {
        if (verified) {
          if (supplied !== undefined && supplied !== verified.id)
            throw new DomainError(
              "NOT_AUTHORIZED",
              "Session namespace does not match the signed review session",
            );
          return verified.id;
        }
        if (typeof supplied !== "string" || !supplied || supplied.length > 100)
          throw new DomainError("INVALID_INPUT", "Local session is required");
        return supplied;
      };
      const subject = verified?.id ?? "local";
      await deps.quota?.(
        subject,
        req.method === "GET" || url.pathname === "/api/search"
          ? "read"
          : url.pathname === "/api/agent"
            ? "model"
            : "write",
      );
      if (req.method === "GET" && url.pathname === "/api/map-config")
        return response(
          200,
          deps.mapConfig ? await deps.mapConfig() : { kind: "offline" },
        );
      if (req.method === "GET" && url.pathname === "/api/source-context") {
        const sourceId = url.searchParams.get("sourceId"),
          snapshotId = url.searchParams.get("snapshotId"),
          rawPage = url.searchParams.get("page"),
          page = rawPage === null ? undefined : Number(rawPage);
        if (
          !sourceId ||
          !snapshotId ||
          !deps.oracle.sourceContext ||
          (page !== undefined &&
            (!Number.isInteger(page) || page < 1 || page > 1000))
        )
          throw new DomainError(
            "INVALID_INPUT",
            "Report source context requires a supported source, snapshot and page",
          );
        return response(200, {
          source: await deps.oracle.sourceContext(sourceId, snapshotId, page),
        });
      }
      if (req.method === "POST" && url.pathname === "/api/search")
        return response(
          200,
          await deps.oracle.search(QuerySchema.parse(req.body)),
        );
      if (req.method === "GET" && url.pathname.startsWith("/api/properties/")) {
        const snapshot = url.searchParams.get("snapshotId");
        if (!snapshot)
          throw new DomainError("INVALID_INPUT", "Snapshot is required");
        return response(
          200,
          await deps.oracle.detail(
            decodeURIComponent(url.pathname.split("/").pop() ?? ""),
            snapshot,
          ),
        );
      }
      if (req.method === "GET" && url.pathname === "/api/leads")
        return response(
          200,
          await deps.leads.list(
            scoped(url.searchParams.get("sessionId") ?? undefined),
          ),
        );
      if (req.method === "POST" && url.pathname === "/api/leads") {
        const raw = object();
        const input = LeadCreateSchema.parse({
          ...raw,
          sessionId: scoped(raw.sessionId),
        });
        await deps.oracle.detail(input.propertyId, input.snapshotId);
        return response(200, await deps.leads.create(input));
      }
      if (req.method === "PATCH" && url.pathname.startsWith("/api/leads/")) {
        const raw = object(),
          id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const input = LeadUpdateSchema.parse({
          ...raw,
          id,
          sessionId: scoped(raw.sessionId),
        });
        return response(200, await deps.leads.update(id, input));
      }
      if (req.method === "POST" && url.pathname === "/api/agent") {
        const input = object();
        if (
          Object.keys(input).some((k) => !["prompt", "query"].includes(k)) ||
          typeof input.prompt !== "string"
        )
          throw new DomainError(
            "INVALID_INPUT",
            "Typed agent prompt and query required",
          );
        const query = QuerySchema.parse(input.query);
        interpretPrompt(input.prompt, query);
        agentInvoked = Boolean(deps.agent);
        return response(
          200,
          await (deps.agent
            ? deps.agent(input.prompt, query, subject)
            : answerQuestion(deps.oracle, input.prompt, query)),
        );
      }
      return response(404, {
        code: "INVALID_INPUT",
        message: "Route not found",
      });
    } catch (error) {
      if (error instanceof AccessError)
        return response(error.status, {
          code: error.status === 429 ? "RATE_LIMITED" : "NOT_AUTHORIZED",
          message: error.message,
        });
      const domain = error instanceof DomainError;
      return response(
        domain
          ? error.code === "CONFLICT"
            ? 409
            : error.code === "NOT_AUTHORIZED"
              ? 403
              : error.code === "RATE_LIMITED" ||
                  error.code === "COST_LIMIT_REACHED"
                ? 429
                : error.code === "QUERY_TIMEOUT"
                  ? 504
                  : 400
          : 400,
        {
          ...(req.path.split("?")[0] === "/api/agent" &&
          !agentInvoked &&
          (domain
            ? ["UNSUPPORTED_TOOL", "INVALID_INPUT"].includes(error.code)
            : (error as Error).name === "ZodError")
            ? { mode: "refused-before-model" }
            : {}),
          code: domain ? error.code : "INVALID_INPUT",
          message: domain
            ? error.message
            : (error as Error).name === "ZodError"
              ? "Invalid request fields"
              : "Request could not be completed. Check the configured Oracle service.",
        },
      );
    }
  };
}
