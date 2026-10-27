import {
  PropertySchema,
  QuerySchema,
  SearchResponseSchema,
  DomainError,
  type Property,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
export interface OracleReader {
  search(input: QueryInput): Promise<SearchResponse>;
  detail(id: string, snapshotId: string): Promise<Property>;
}
export class OracleClient implements OracleReader {
  constructor(
    private readonly origin = "http://127.0.0.1:4310",
    private readonly transport: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username !== "" ||
      url.password !== ""
    )
      throw new Error(
        "P1 Oracle client permits a local consumer endpoint only",
      );
  }
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.transport(new URL(path, this.origin), {
      ...init,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      headers: { "Content-Type": "application/json" },
    });
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    ) {
      throw new DomainError(
        "INVALID_INPUT",
        "Oracle redirects are not permitted by the P1 local consumer boundary",
      );
    }
    const body: unknown = await response.json();
    if (!response.ok) {
      const record =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
      const codes = [
        "INVALID_CURSOR",
        "SNAPSHOT_UNAVAILABLE",
        "INVALID_INPUT",
      ] as const;
      const code = codes.find((c) => c === record.code) ?? "INVALID_INPUT";
      throw new DomainError(
        code,
        typeof record.message === "string"
          ? record.message
          : "Oracle query failed",
      );
    }
    return body;
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
    return PropertySchema.parse(
      await this.request(
        `/api/properties/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshotId)}`,
      ),
    );
  }
}
