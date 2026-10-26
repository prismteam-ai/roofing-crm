// The only place in apps/api that may import @duckdb/node-api (ARD § 4, AD-19 — "DuckDB is
// wired only in apps/*/src/engine/**", enforced by packages/eslint-config). Everything else
// (apps/api/src/adapters/duckDbParquet.ts) talks to the index through this thin wrapper.
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export type { DuckDBConnection };

/** Opens an in-memory DuckDB connection with crm_property/crm_permit views bound to the given
 *  Parquet files, per ADR-01 (DuckDB over Parquet, no OpenSearch domain). */
export async function openParquetConnection(
  propertyFile: string,
  permitFile: string,
): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(":memory:", { threads: "1" });
  const connection = await instance.connect();
  // Pinned per Task A's ADR-0001 (vendored query-core follows the same rule): an unpinned
  // session timezone reads timestamp/date columns back in the machine's local zone, which would
  // silently shift dates depending on where this Lambda or test happens to run.
  await connection.run("SET TimeZone = 'UTC';");
  await connection.run(
    `CREATE VIEW crm_property AS SELECT * FROM read_parquet('${propertyFile}');` +
      `CREATE VIEW crm_permit AS SELECT * FROM read_parquet('${permitFile}');`,
  );
  return connection;
}
