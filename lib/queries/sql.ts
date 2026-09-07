/**
 * SQL building primitives. Every value that reaches the MCP SQL string goes through one
 * of these helpers: numbers are validated as finite and clamped, enums are whitelisted,
 * identifiers are pattern-checked and free text is escaped for ILIKE.
 *
 * @module queries/sql
 */

/** Throw unless `value` is a finite number; returns it rounded to `decimals`. */
export function num(
  value: unknown,
  opts: { min?: number; max?: number; decimals?: number } = {},
): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n))
    throw new RangeError(`Expected a finite number, got ${String(value)}`);
  const clamped = Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, n));
  const f = 10 ** (opts.decimals ?? 6);
  return Math.round(clamped * f) / f;
}

/** Positive integer helper (row limits, day counts). */
export function int(value: unknown, opts: { min?: number; max?: number } = {}): number {
  return Math.trunc(num(value, opts));
}

/** Return `value` if it is one of `allowed`, else throw. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new RangeError(`Expected one of ${allowed.join(", ")}, got ${String(value)}`);
}

/** Parcel / permit identifiers: letters, digits, dash, space, dot, slash (Osceola formats). */
const ID_PATTERN = /^[A-Za-z0-9 ._/-]{1,64}$/;

/** Validate an identifier and return it as a single-quoted SQL literal. */
export function idLiteral(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value))
    throw new RangeError(`Invalid identifier: ${String(value)}`);
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Escape free text for use inside an ILIKE pattern: quotes are doubled and the
 * wildcard characters `%`, `_` and `\` are escaped (with `ESCAPE '\'`).
 */
export function ilikeTerm(value: unknown, maxLen = 80): string {
  const s = String(value ?? "").slice(0, maxLen);
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/'/g, "''");
  return `'%${escaped}%' ESCAPE '\\'`;
}

/**
 * Defence in depth for agent-authored SQL: a single read-only SELECT/WITH statement,
 * no comments, no mutation / administrative keywords, no file or network table functions.
 * This is a coarse token filter, not a parser; the MCP server's own read-only enforcement
 * and row cap are the real guard.
 */
export function assertReadOnlySelect(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(trimmed))
    throw new RangeError("Only SELECT / WITH statements are allowed");
  if (trimmed.includes(";")) throw new RangeError("Only a single statement is allowed");
  if (/--|\/\*/.test(trimmed)) throw new RangeError("SQL comments are not allowed");
  if (
    /\b(insert|update|delete|drop|alter|create|attach|detach|copy|pragma|install|load|export|import|call|set|reset|vacuum|checkpoint)\b/i.test(
      trimmed,
    )
  ) {
    throw new RangeError("Mutating or administrative statements are not allowed");
  }
  // DuckDB table functions / extensions that could read arbitrary files or URLs.
  if (
    /\b(read_parquet|read_csv|read_csv_auto|read_json|read_json_auto|read_text|read_blob|parquet_scan|glob|httpfs|sniff_csv)\b/i.test(
      trimmed,
    )
  ) {
    throw new RangeError("File and network table functions are not allowed");
  }
  return trimmed;
}
