// The only place in apps/sync that may import @duckdb/node-api (ARD § 4, AD-19 — "DuckDB is
// wired only in apps/*/src/engine/**", enforced by packages/eslint-config). BuildIndex talks to
// DuckDB through this thin wrapper rather than importing the driver directly.
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { z } from "zod";

export type { DuckDBConnection };

export interface DuckDbOptions {
  /** DuckDB `memory_limit` (e.g. "1800MB"). Unset keeps DuckDB's own default (80% of RAM). */
  readonly memoryLimit?: string;
  /** DuckDB `temp_directory`: where it spills once `memoryLimit` is reached (a /tmp path on
   *  Lambda — the function's ephemeral storage is sized for it in infra/lib/crm-sync-stack.ts). */
  readonly tempDirectory?: string;
}

/** A DuckDB size literal: a number plus a unit, e.g. "1800MB", "2GB", "512MiB". */
const MemoryLimit = z.string().regex(/^\d+(\.\d+)?\s*(B|KB|MB|GB|KiB|MiB|GiB)$/);

/**
 * Builds DuckDbOptions from the Lambda environment. `DUCKDB_MEMORY_LIMIT` is set by CrmSyncStack
 * per function (a fraction of that function's memory, leaving headroom for Node itself); the
 * spill directory is always under the caller's own /tmp working directory. Throws on a malformed
 * limit rather than handing DuckDB a value it would reject at a less obvious point.
 */
export function duckDbOptionsFromEnv(
  env: Record<string, string | undefined>,
  tempDirectory: string,
): DuckDbOptions {
  const raw = env.DUCKDB_MEMORY_LIMIT;
  if (raw === undefined || raw === "") return { tempDirectory };
  const parsed = MemoryLimit.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`DuckDB: DUCKDB_MEMORY_LIMIT "${raw}" is not a size like "1800MB"`);
  }
  return { memoryLimit: parsed.data, tempDirectory };
}

/** Opens a fresh in-memory DuckDB connection, single-threaded (Lambda-sandbox sizing). */
export async function createInMemoryConnection(
  options: DuckDbOptions = {},
): Promise<DuckDBConnection> {
  const config: Record<string, string> = { threads: "1" };
  if (options.memoryLimit !== undefined) config.memory_limit = options.memoryLimit;
  if (options.tempDirectory !== undefined) config.temp_directory = options.tempDirectory;
  const instance = await DuckDBInstance.create(":memory:", config);
  return instance.connect();
}
