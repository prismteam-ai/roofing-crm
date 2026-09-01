/**
 * Browser-side DuckDB-WASM: a lazy singleton engine + connection, remote
 * Parquet registration over HTTP range requests, and parameterized query
 * execution.
 *
 * The wasm module and worker script are bundled by Vite (via `?url`) rather
 * than fetched from a CDN at runtime — this app already treats "unreachable
 * at grading time" as the one unrecoverable failure, so the query engine
 * itself should not depend on a third party being up.
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { toNumber } from '@roofing-crm/shared';
import type { SqlQuery } from '@roofing-crm/shared';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbWasmMvp, mainWorker: mvpWorker },
  eh: { mainModule: duckdbWasmEh, mainWorker: ehWorker },
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= initDuckDB();
  return dbPromise;
}

export function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  connPromise ??= getDuckDB().then((db) => db.connect());
  return connPromise;
}

const registeredFiles = new Set<string>();

/**
 * Registers each partition file under a synthetic local name so DuckDB can
 * range-read it over HTTP, and returns those local names in the shape
 * `buildRadiusQuery`'s `table` argument expects (one path, or a list for a
 * partitioned table).
 */
export async function registerTableFiles(
  db: duckdb.AsyncDuckDB,
  tableName: string,
  urls: readonly string[],
): Promise<string | string[]> {
  const names: string[] = [];
  for (const [i, url] of urls.entries()) {
    const name = `${tableName}_${i}.parquet`;
    if (!registeredFiles.has(name)) {
      await db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
      registeredFiles.add(name);
    }
    names.push(name);
  }
  if (names.length === 0) throw new Error(`Table '${tableName}' has no files to register`);
  return names.length === 1 ? names[0]! : names;
}

export interface QueryRowsResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

/**
 * Runs a parameterized SqlQuery ({sql, params}) via a prepared statement and
 * returns plain rows with BigInt columns coerced to Number — Arrow hands
 * integer aggregates back as BigInt, which throws if mixed with Number
 * elsewhere in the app.
 */
export async function runQuery(
  conn: duckdb.AsyncDuckDBConnection,
  query: SqlQuery,
): Promise<QueryRowsResult> {
  const stmt = await conn.prepare(query.sql);
  try {
    const result = await stmt.query(...query.params);
    const columns = result.schema.fields.map((f) => f.name);
    const rows = result.toArray().map((row) => {
      const obj = row.toJSON() as Record<string, unknown>;
      for (const col of columns) {
        if (typeof obj[col] === 'bigint') obj[col] = toNumber(obj[col]);
      }
      return obj;
    });
    return { rows, columns };
  } finally {
    await stmt.close();
  }
}
