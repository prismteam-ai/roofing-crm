import * as duckdb from "@duckdb/duckdb-wasm";
import { tableUrl, type TableName } from "../config";

let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

/** One DuckDB-WASM instance; each Parquet file is registered as a view that reads over HTTP range requests. */
export function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    const p: Promise<duckdb.AsyncDuckDBConnection> = (async () => {
      // Engine files (the eh wasm is ~34 MiB, over Cloudflare Pages' 25 MiB per-file limit) load from jsDelivr, not our dist/.
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      // Browsers refuse cross-origin Workers, so wrap the CDN worker script in a same-origin blob.
      const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }));
      const worker = new Worker(workerUrl);
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
      await db.instantiate(bundle.mainModule);
      const conn = await db.connect();
      for (const t of ["properties", "permits"] as TableName[]) {
        const url = new URL(tableUrl(t), window.location.href).href;
        await db.registerFileURL(`${t}.parquet`, url, duckdb.DuckDBDataProtocol.HTTP, false);
        await conn.query(`CREATE VIEW ${t} AS SELECT * FROM read_parquet('${t}.parquet')`);
      }
      return conn;
    })();
    // A failed first connect (bad network blip, cold CDN/gateway) must not poison every future query:
    // clear the cache so the next getConn() call retries instead of re-awaiting the same rejection forever.
    p.catch(() => { if (connPromise === p) connPromise = null; });
    connPromise = p;
  }
  return connPromise;
}

const DATE_COLS = new Set(["applied_date", "issued_date", "finaled_date", "close_date", "open_since", "expiration_date_valid"]);

export async function query<T>(sql: string): Promise<T[]> {
  const conn = await getConn();
  const res = await conn.query(sql);
  return res.toArray().map((r) => {
    const o: Record<string, unknown> = r.toJSON();
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "bigint") o[k] = Number(v);
      // DuckDB-WASM returns DATE columns as epoch milliseconds; the UI wants ISO yyyy-mm-dd strings.
      else if (DATE_COLS.has(k)) o[k] = v == null ? null : new Date(Number(v)).toISOString().slice(0, 10);
    }
    return o as T;
  });
}
