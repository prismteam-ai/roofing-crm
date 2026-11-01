import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LeadStore } from "../packages/lead-domain/src/index";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
const dir = mkdtempSync(join(tmpdir(), "prism-crm-benchmark-")),
  file = join(dir, "leads.sqlite");
const store = new LeadStore(file);
const samples: number[] = [];
const count = 1000;
try {
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    const input = {
      sessionId: "benchmark-synthetic",
      propertyId: `SYN-BENCH-${i}`,
      snapshotId: "benchmark-synthetic-v1",
      idempotencyKey: `request-${i}`,
    };
    const first = store.create(input);
    const retry = store.create(input);
    if (first.id !== retry.id) throw new Error("Idempotency regression");
    store.update(first.id, {
      sessionId: input.sessionId,
      expectedVersion: 1,
      status: "qualified",
      note: "Synthetic local benchmark",
    });
    samples.push(performance.now() - start);
  }
  const loaded = store.list("benchmark-synthetic");
  if (loaded.length !== count || loaded.some((x) => x.version !== 2))
    throw new Error("Persistence regression");
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        benchmark: "sqlite-create-retry-update",
        mode: "synthetic-only",
        contractVersion: CONTRACT_VERSION,
        node: process.version,
        iterations: count,
        p50Ms: samples[Math.floor(count * 0.5)],
        p95Ms: samples[Math.floor(count * 0.95)],
        maxMs: samples.at(-1),
        databaseBytes: statSync(file).size,
        verifiedLeads: loaded.length,
        outboundRequests: 0,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
