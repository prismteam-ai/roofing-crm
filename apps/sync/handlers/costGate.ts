// T036: the cost gate called from Plan (apps/sync/handlers/plan.ts, T024) — ADR-05, research.md's
// machamp refinement: sized from the manifest's own declared byte size, never a live HEAD request
// (avoids adding another throttled call to the gateway FetchPart already has to be polite to).
import type { RunManifestV1 } from "@crm/oracle-contract";
import { withObservability } from "@crm/observability";

/** ADR-05's three independent thresholds; exceeding any one holds the run. */
export const COST_GATE_THRESHOLDS = {
  maxSpendUsd: 1.0,
  // The document count is the SUM of every coverage counter in the manifest (see
  // `estimateCostFromManifest`), not a count of distinct documents: it double-counts rows and
  // permit diagnostics that appear under more than one counter. Run 3 (full county) sums to
  // 848,164 (Run 2: about 406k), because Run 3 added `parcels_published` (441,961). The limit is
  // 1,000,000: about 18% headroom over Run 3, still a real ceiling for a run twice the size.
  // It was 600,000 until 2026-10-25.
  maxDocCount: 1_000_000,
  maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
} as const;

/** A conservative, documented per-GB estimate (not a live AWS Price List lookup) used only to
 * turn the manifest's declared byte size into a rough predicted spend for the gate — intentionally
 * pessimistic so the gate holds early rather than silently permitting an expensive run. */
export const COST_PER_GB_USD = 0.09;

export interface CostEstimate {
  readonly predictedSpendUsd: number;
  readonly predictedDocCount: number;
  readonly predictedBytes: number;
}

export type CostGateResult =
  | { readonly held: false }
  | { readonly held: true; readonly heldReason: "cost_gate_exceeded" };

/** Sums the manifest's own declared artifact byte sizes and published coverage counts — no
 * network call, no live HEAD request (ADR-05's explicit requirement). */
export function estimateCostFromManifest(
  manifest: Pick<RunManifestV1, "artifacts" | "coverage">,
): CostEstimate {
  // B-09: only `kind: "table"` artifacts are ever fetched (Plan's PART_KIND). Full-county manifests
  // also list ~2.3 GB of CAR/directory containers the sync never downloads; counting those held
  // every full-county run on the 2 GB byte gate for bytes it would not spend.
  const predictedBytes = manifest.artifacts
    .filter((artifact) => artifact.kind === "table")
    .reduce((sum, artifact) => sum + artifact.size, 0);
  const predictedDocCount = Object.values(manifest.coverage).reduce(
    (sum, coverage) => sum + coverage.count,
    0,
  );
  const predictedSpendUsd = (predictedBytes / (1024 * 1024 * 1024)) * COST_PER_GB_USD;
  return { predictedSpendUsd, predictedDocCount, predictedBytes };
}

/** Strictly greater-than each threshold holds the run (ADR-05); exactly at a threshold passes. */
export function evaluateCostGate(estimate: CostEstimate): CostGateResult {
  const exceeded =
    estimate.predictedSpendUsd > COST_GATE_THRESHOLDS.maxSpendUsd ||
    estimate.predictedDocCount > COST_GATE_THRESHOLDS.maxDocCount ||
    estimate.predictedBytes > COST_GATE_THRESHOLDS.maxBytes;
  return exceeded ? { held: true, heldReason: "cost_gate_exceeded" } : { held: false };
}

/** Standalone Lambda-shaped entry point (not currently wired into the state machine directly —
 * Plan, T024, imports `estimateCostFromManifest`/`evaluateCostGate` and calls them in-process, per
 * contracts/sync-pipeline.md's PlanResult shape). Kept for parity with every other handler in this
 * story (Powertools-wrapped, constitution Article VIII) and for an isolated integration check. */
export const handler = withObservability(
  "crm-sync-cost-gate",
  async (manifest: Pick<RunManifestV1, "artifacts" | "coverage">, obs) => {
    const estimate = estimateCostFromManifest(manifest);
    const result = evaluateCostGate(estimate);
    if (result.held) {
      obs.logger.warn("cost gate held the run", { estimate });
    }
    return { estimate, ...result };
  },
);
