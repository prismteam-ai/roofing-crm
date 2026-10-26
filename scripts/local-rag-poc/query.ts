#!/usr/bin/env -S npx tsx
// espeon's local, query-only prototype (build-local-rag-pocs discipline, T012/T013): reads Task
// A's published contract/v1 run manifest by CID, over a real public CID gateway, through the
// vendored packages/oracle-views' bindManifest()/QueryEngine — never Task A's internal API,
// Query DB, or any non-published store (FR-001). No AWS resource exists yet; this is the cheap
// local proof the story's rule 5 requires before apps/sync/handlers/buildIndex.ts (T014+) is
// written. Data is never copied into this repo (docs/reuse-log.md's header) — only the vendored
// *code* is; the manifest and parquet bytes are fetched fresh, every run.
//
// This script deliberately reaches into packages/oracle-views' and packages/oracle-contract's
// source directly (relative import, not the @crm/* workspace specifier) because
// scripts/local-rag-poc is intentionally NOT a pnpm workspace member (tasks.md T004) — it is a
// standalone tsx script. Node resolves each vendored file's own bare imports ("@crm/oracle-contract",
// "zod", …) relative to that file's own location, so this still uses the one real, pinned copy of
// Task A's semantics (ADR-07) rather than re-implementing anything.
import { DuckDBInstance } from "@duckdb/node-api";
import { bindManifest } from "../../packages/oracle-views/src/index.js";
import { RunManifestV1, isCidV1 } from "../../packages/oracle-contract/src/index.js";

// ADR-02's gateway order: CloudFront's public CID copy first (if configured — this is a dev
// script, so an unset CLOUDFRONT_CID_HOST just skips straight to the two always-public gateways),
// then Filebase, then Pinata. Never ipfs.io/dweb.link (retired, per ADR-02 and checks.md §6.1's
// measured 429s on those two).
function gateways(): string[] {
  const cloudfrontHost = process.env.CLOUDFRONT_CID_HOST;
  return [
    ...(cloudfrontHost ? [`https://${cloudfrontHost}/ipfs`] : []),
    "https://ipfs.filebase.io/ipfs",
    "https://gateway.pinata.cloud/ipfs",
  ];
}

export interface QueryResult {
  manifestCid: string;
  runId: string;
  propertyCount: number;
  permitCount: number;
  /**
   * One real, published "missing" reason straight off the bound v_property view, preserved
   * exactly — never a guessed or interpolated value (AC-3/FR-003). `null` only if a run somehow
   * ships zero missing fields across every row (not expected of real Travis County data).
   */
  sampleMissingReason: { field: string; reason: string } | null;
}

const FETCH_TIMEOUT_MS = 15_000;

/** Fetches one CID's bytes, trying each gateway in ADR-02 order; returns which gateway answered
 *  so the caller can keep using that same, already-working gateway for every other part in this
 *  run (checks.md §6.1: Filebase measured 429s after ~50-65 rapid requests — ADR-02's whole
 *  reason to have a fallback chain at all). A 15 s per-attempt timeout stops a stalled gateway
 *  from hanging the run forever. */
async function fetchByCid(
  cid: string,
  debug: boolean,
): Promise<{ bytes: Uint8Array; base: string }> {
  let lastError: unknown;
  for (const base of gateways()) {
    const url = `${base}/${cid}`;
    try {
      if (debug) console.error(`[debug] GET ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), base };
    } catch (error) {
      if (debug) console.error(`[debug] gateway failed: ${url}: ${(error as Error).message}`);
      lastError = error;
    }
  }
  throw new Error(
    `fetchByCid: every gateway failed for ${cid}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/** Binds the manifest over a fresh in-memory DuckDB and runs one query against it. Every part is
 *  read from the same gateway that successfully answered the manifest fetch (`workingBase`) —
 *  content-addressed by the part's own `cid`, not the directory CID. */
async function withBoundManifest<T>(
  manifestBytes: Uint8Array,
  workingBase: string,
  debug: boolean,
  run: (all: (sql: string) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  const instance = await DuckDBInstance.create(":memory:", { threads: "1" });
  const connection = await instance.connect();
  try {
    await connection.run("INSTALL httpfs; LOAD httpfs;");
    await connection.run("SET TimeZone = 'UTC'");
    const all = async (sql: string): Promise<Record<string, unknown>[]> => {
      const reader = await connection.runAndReadAll(sql);
      return reader.getRowObjectsJS() as Record<string, unknown>[];
    };
    const engine = {
      run: async (sql: string) => {
        await connection.run(sql);
      },
      all,
    };
    await bindManifest(manifestBytes, "", engine, {
      partUrl: ({ cid }) => `${workingBase}/${cid}`,
    });
    if (debug)
      console.error("[debug] bindManifest ok: v_property, v_roofing_permit, v_contractor, v_run");
    return await run(all);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

export async function runQuery(
  manifestCid: string,
  debug = process.env.RAG_DEBUG === "true",
): Promise<QueryResult> {
  if (!isCidV1(manifestCid)) {
    throw new Error(`runQuery: "${manifestCid}" is not a base32 CIDv1 string`);
  }
  const { bytes: manifestBytes, base: workingBase } = await fetchByCid(manifestCid, debug);
  const manifest = RunManifestV1.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));

  return withBoundManifest(manifestBytes, workingBase, debug, async (all) => {
    const [propertyRow] = (await all("SELECT count(*) AS n FROM v_property")) as { n: bigint }[];
    const [permitRow] = (await all("SELECT count(*) AS n FROM v_roofing_permit")) as {
      n: bigint;
    }[];
    const missingRows = (await all(
      "SELECT missing FROM v_property WHERE len(missing) > 0 LIMIT 1",
    )) as {
      missing: { field: string; reason: string }[];
    }[];

    return {
      manifestCid,
      runId: manifest.runId,
      propertyCount: Number(propertyRow?.n ?? 0n),
      permitCount: Number(permitRow?.n ?? 0n),
      sampleMissingReason: missingRows[0]?.missing[0] ?? null,
    };
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && (entry.endsWith("query.ts") || entry.endsWith("query.js"));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cidFlagIndex = args.indexOf("--cid");
  // DATA_MANIFEST_CID is always read from the environment, never hard-coded in source — the
  // story's explicit rule, so the later full-county switch is a config change only.
  const manifestCid = cidFlagIndex >= 0 ? args[cidFlagIndex + 1] : process.env.DATA_MANIFEST_CID;
  if (manifestCid === undefined || manifestCid === "") {
    console.error(
      "usage: pnpm query -- --cid <manifestCid>  (or set DATA_MANIFEST_CID; never hard-code a CID)",
    );
    process.exitCode = 2;
    return;
  }
  const result = await runQuery(manifestCid);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
