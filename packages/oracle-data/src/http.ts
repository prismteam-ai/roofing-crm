import type { z } from "zod";

/** The Oracle could not be reached, timed out, or answered 5xx. */
export class OracleUnavailable extends Error {
  readonly name = "OracleUnavailable";
}
/** The Oracle serves another run than the one this CRM is pinned to (Review Focus 6). */
export class OracleManifestMismatch extends Error {
  readonly name = "OracleManifestMismatch";
  constructor(
    readonly expected: string,
    readonly actual: string | null,
  ) {
    super(`Oracle serves manifest ${actual ?? "(unpublished run)"}, the CRM is pinned to ${expected}`);
  }
}
/** A response that does not match the Oracle contract. */
export class OracleContractError extends Error {
  readonly name = "OracleContractError";
}

export interface HttpOpts {
  apiUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

/** GET an Oracle API path; `null` on 404, the parsed body otherwise. */
export async function oracleGet<T extends z.ZodType>(
  o: HttpOpts,
  pathAndQuery: string,
  schema: T,
): Promise<z.infer<T> | null> {
  let res: Response;
  try {
    res = await o.fetchImpl(`${o.apiUrl.replace(/\/$/, "")}${pathAndQuery}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (err) {
    const e = err as Error;
    throw new OracleUnavailable(
      e.name === "TimeoutError"
        ? `Oracle timed out after ${o.timeoutMs} ms`
        : `Oracle unreachable: ${e.message}`,
    );
  }
  if (res.status === 404) return null;
  if (res.status >= 500)
    throw new OracleUnavailable(`Oracle answered HTTP ${res.status} for ${pathAndQuery}`);
  if (!res.ok) throw new OracleContractError(`Oracle answered HTTP ${res.status} for ${pathAndQuery}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new OracleContractError(
      `${pathAndQuery}: response does not match the Oracle contract (${issue?.path.join(".")}: ${issue?.message})`,
    );
  }
  return parsed.data;
}
