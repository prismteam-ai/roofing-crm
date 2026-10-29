import {
  sourceContext,
  type SourceContext,
} from "../../hosted-runtime/src/source-context";
import { z } from "zod";
import {
  PropertySchema,
  QuerySchema,
  SearchResponseSchema,
  DomainError,
  ErrorCode,
  CONTRACT_VERSION,
  type Property,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
export const OracleHealthSchema = z.object({
  snapshotId: z.string().min(1),
  mode: z.string().min(1),
  digest: z.string().optional(),
  snapshotDigest: z.string().optional(),
  buildId: z.string().optional(),
  head: z.string().optional(),
  tree: z.string().optional(),
  region: z.string().optional(),
  stage: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  contractVersion: z.string(),
  dataMode: z
    .enum(["synthetic", "real-public", "protected-real", "provider-licensed"])
    .optional(),
  publicSnapshotId: z.string().optional(),
});
export type OracleHealth = z.infer<typeof OracleHealthSchema>;
export interface OracleReadBudget {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface OracleReader {
  search(
    input: QueryInput,
    options?: OracleReadBudget,
  ): Promise<SearchResponse>;
  detail(
    id: string,
    snapshotId: string,
    options?: OracleReadBudget,
  ): Promise<Property>;
  health?(options?: OracleReadBudget): Promise<OracleHealth>;
  sourceContext?(
    sourceId: string,
    snapshotId: string,
    page?: number,
    options?: OracleReadBudget,
  ): Promise<SourceContext>;
}
export interface OracleUrlPolicy {
  /** Exact HTTPS origins approved at deployment; wildcards and URL credentials are forbidden. */
  approvedOrigins?: readonly string[];
  allowLoopback?: boolean;
  sameOrigin?: string;
  timeoutMs?: number;
}
export function approvedOracleUrl(
  value: string,
  policy: OracleUrlPolicy = {},
): URL {
  const relative = value.startsWith("/") && !value.startsWith("//");
  const url =
    relative && policy.sameOrigin
      ? new URL(value, policy.sameOrigin)
      : new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Oracle endpoint must be an origin without credentials, path, query or fragment",
    );
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const local =
    loopback &&
    policy.allowLoopback !== false &&
    ["http:", "https:"].includes(url.protocol);
  const nonPublic =
    loopback ||
    /^[0-9.]+$/.test(url.hostname) ||
    url.hostname.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname);
  const approved = (policy.approvedOrigins ?? []).some((origin) => {
    const candidate = new URL(origin);
    return (
      candidate.protocol === "https:" &&
      !candidate.username &&
      !candidate.password &&
      candidate.pathname === "/" &&
      !candidate.search &&
      !candidate.hash &&
      candidate.origin === url.origin
    );
  });
  const same =
    policy.sameOrigin &&
    new URL(policy.sameOrigin).origin === url.origin &&
    url.protocol === "https:";
  if (
    !local &&
    !(url.protocol === "https:" && !nonPublic && (approved || same))
  )
    throw new Error(
      "Oracle endpoint is outside the exact approved HTTPS or loopback origins",
    );
  return url;
}
export class OracleClient implements OracleReader {
  private readonly origin: URL;
  private readonly timeout: number;
  constructor(
    origin = "http://127.0.0.1:4310",
    private readonly transport: typeof fetch = fetch,
    policy: OracleUrlPolicy = {},
  ) {
    this.origin = approvedOracleUrl(origin, policy);
    this.timeout = policy.timeoutMs ?? 10000;
    if (
      !Number.isInteger(this.timeout) ||
      this.timeout < 1 ||
      this.timeout > 30000
    )
      throw new Error("Oracle deadline must be 1–30000 milliseconds");
  }
  private async request(
    path: string,
    init?: RequestInit,
    budget?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<unknown> {
    const timeout = Math.min(this.timeout, budget?.timeoutMs ?? this.timeout);
    if (!Number.isFinite(timeout) || timeout <= 0 || budget?.signal?.aborted)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Oracle request deadline exceeded before dispatch",
      );
    const controller = new AbortController();
    const signal = budget?.signal
      ? AbortSignal.any([controller.signal, budget.signal])
      : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: () => void = () => {};
    try {
      return await Promise.race([
        this.perform(path, init, signal),
        new Promise<never>((_, reject) => {
          rejectAbort = () =>
            reject(
              new DomainError(
                "QUERY_TIMEOUT",
                "Oracle request exceeded its shared deadline",
              ),
            );
          signal.addEventListener("abort", rejectAbort, { once: true });
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new DomainError(
                "QUERY_TIMEOUT",
                "Oracle request exceeded its deadline",
              ),
            );
          }, timeout);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", rejectAbort);
    }
  }
  private async perform(
    path: string,
    init: RequestInit | undefined,
    signal: AbortSignal,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(new URL(path, this.origin), {
        ...init,
        signal,
        redirect: "error",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Oracle request failed or exceeded its deadline",
      );
    }
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    )
      throw new DomainError(
        "INVALID_INPUT",
        "Oracle redirects are not permitted",
      );
    let text = "",
      bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 4000000) {
            await reader.cancel();
            throw new DomainError(
              "COST_LIMIT_REACHED",
              "Oracle response exceeded the consumer byte limit",
            );
          }
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new DomainError(
        "INVALID_INPUT",
        "Oracle response was not valid JSON",
      );
    }
    if (!response.ok) {
      const record =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
      const parsed = ErrorCode.safeParse(
        Object.hasOwn(record, "code") ? record.code : undefined,
      );
      throw new DomainError(
        parsed.success ? parsed.data : "INVALID_INPUT",
        Object.hasOwn(record, "message") && typeof record.message === "string"
          ? record.message
          : "Oracle query failed",
      );
    }
    return body;
  }
  async sourceContext(
    sourceId: string,
    snapshotId: string,
    page?: number,
    budget?: OracleReadBudget,
  ): Promise<SourceContext> {
    const expected = sourceContext(sourceId, page);
    if (!expected)
      throw new DomainError("INVALID_INPUT", "Unknown report source or page");
    const query = new URLSearchParams({ sourceId });
    if (page !== undefined) query.set("page", String(page));
    const response = z
      .object({
        version: z.literal("1"),
        contractVersion: z.literal(CONTRACT_VERSION),
        snapshotId: z.string(),
        digest: z.string(),
        source: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(
        await this.request(`/api/source-context?${query}`, undefined, budget),
      );
    const canonical = (x: unknown): string =>
      Array.isArray(x)
        ? `[${x.map(canonical).join(",")}]`
        : x && typeof x === "object"
          ? `{${Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
              .join(",")}}`
          : JSON.stringify(x);
    if (
      response.snapshotId !== snapshotId ||
      canonical(response.source) !== canonical(expected)
    )
      throw new DomainError(
        "SNAPSHOT_UNAVAILABLE",
        "Report source context identity mismatch",
      );
    return expected;
  }
  async health(budget?: OracleReadBudget): Promise<OracleHealth> {
    return OracleHealthSchema.parse(
      await this.request("/api/health", undefined, budget),
    );
  }
  async search(
    input: QueryInput,
    budget?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SearchResponse> {
    const query = QuerySchema.parse(input);
    const response = SearchResponseSchema.parse(
      await this.request(
        "/api/search",
        {
          method: "POST",
          body: JSON.stringify(query),
        },
        budget,
      ),
    );
    if (response.snapshotId !== query.snapshotId)
      throw new DomainError(
        "SNAPSHOT_UNAVAILABLE",
        "Producer response does not match requested snapshot",
      );
    return response;
  }
  async detail(
    id: string,
    snapshotId: string,
    budget?: OracleReadBudget,
  ): Promise<Property> {
    const property = PropertySchema.parse(
      await this.request(
        `/api/properties/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshotId)}`,
        undefined,
        budget,
      ),
    );
    if (property.id !== id)
      throw new DomainError(
        "SNAPSHOT_UNAVAILABLE",
        "Producer detail does not match the requested property identity",
      );
    return property;
  }
}
