import { z } from "zod";
import {
  PropertySchema,
  QuerySchema,
  SearchResponseSchema,
  DomainError,
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
  count: z.number().int().nonnegative().optional(),
  contractVersion: z.string(),
});
export type OracleHealth = z.infer<typeof OracleHealthSchema>;
export interface OracleReader {
  search(input: QueryInput): Promise<SearchResponse>;
  detail(id: string, snapshotId: string): Promise<Property>;
  health?(): Promise<OracleHealth>;
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
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.perform(path, init, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new DomainError(
                "QUERY_TIMEOUT",
                "Oracle request exceeded its deadline",
              ),
            );
          }, this.timeout);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
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
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
      const codes = [
        "INVALID_CURSOR",
        "SNAPSHOT_UNAVAILABLE",
        "INVALID_INPUT",
        "NOT_AUTHORIZED",
        "RATE_LIMITED",
        "QUERY_TIMEOUT",
      ] as const;
      throw new DomainError(
        codes.find((c) => c === record.code) ?? "INVALID_INPUT",
        typeof record.message === "string"
          ? record.message
          : "Oracle query failed",
      );
    }
    return body;
  }
  async health(): Promise<OracleHealth> {
    return OracleHealthSchema.parse(await this.request("/api/health"));
  }
  async search(input: QueryInput): Promise<SearchResponse> {
    const query = QuerySchema.parse(input);
    const response = SearchResponseSchema.parse(
      await this.request("/api/search", {
        method: "POST",
        body: JSON.stringify(query),
      }),
    );
    if (response.snapshotId !== query.snapshotId)
      throw new DomainError(
        "SNAPSHOT_UNAVAILABLE",
        "Producer response does not match requested snapshot",
      );
    return response;
  }
  async detail(id: string, snapshotId: string): Promise<Property> {
    const property = PropertySchema.parse(
      await this.request(
        `/api/properties/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshotId)}`,
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
