// B-09 review fix (/code-review Major): what BuildIndex actually bound, compared against the
// manifest's own export-batch list. Full-county manifests publish no parcel count, so on a first
// run this is the only evidence that every batch made it into the index: vendored query-core's
// bindManifest skips (never guesses) a batch whose data group it can't resolve, and a skipped or
// empty batch would otherwise validate as a smaller-but-plausible county. Pure, no I/O.
import { tablesForViews, type BoundTable, type ContractView } from "@crm/oracle-views";

export interface BatchCoverage {
  /** Manifest export batches holding at least one table the bound views read. */
  readonly batchesListed: number;
  /** Of those, the batches none of whose parts was bound. */
  readonly unboundBatches: readonly string[];
  /** County batches that were bound but contributed no county.property rows. */
  readonly emptyCountyBatches: readonly string[];
}

/** An export batch is everything before a table artifact's last two path segments
 *  (`<batch>/<table>/<part>`) — the same rule query-core's bindManifest groups parts by. */
function batchOf(name: string): { batch: string; table: string } | null {
  const segs = name.split("/");
  if (segs.length < 3) return null;
  const table = segs[segs.length - 2];
  if (table === undefined || table === "") return null;
  return { batch: segs.slice(0, -2).join("/"), table };
}

/** The manifest's `kind: "table"` artifact names. bindManifest has already schema-validated the
 *  same bytes; this reads only the two fields it needs. */
export function manifestTableArtifactNames(manifestBytes: Uint8Array): string[] {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
  const artifacts =
    typeof parsed === "object" && parsed !== null && "artifacts" in parsed
      ? (parsed as { artifacts: unknown }).artifacts
      : [];
  if (!Array.isArray(artifacts)) return [];
  return artifacts
    .filter(
      (a): a is { kind: string; name: string } =>
        typeof a === "object" &&
        a !== null &&
        (a as { kind?: unknown }).kind === "table" &&
        typeof (a as { name?: unknown }).name === "string",
    )
    .map((a) => a.name);
}

export interface BatchCoverageInput {
  readonly tableArtifactNames: readonly string[];
  /** bindManifest's `BoundRun.tables`. */
  readonly boundTables: readonly BoundTable[];
  /** Row count per `_part` of the bound county.property relation. */
  readonly countyPropertyRowsByPart: ReadonlyMap<string, number>;
  /** The views BuildIndex binds; defaults to the two it reads. */
  readonly views?: readonly ContractView[];
}

export const BUILD_INDEX_VIEWS = ["v_property", "v_roofing_permit"] as const;

export function batchCoverage(input: BatchCoverageInput): BatchCoverage {
  const needed = new Set(tablesForViews(input.views ?? BUILD_INDEX_VIEWS).map((r) => r.table));

  const listed = new Map<string, string[]>();
  for (const name of input.tableArtifactNames) {
    const loc = batchOf(name);
    if (loc === null) continue;
    const parts = listed.get(loc.batch) ?? [];
    parts.push(name);
    listed.set(loc.batch, parts);
  }
  const batchesNeedingBind = [...listed.entries()].filter(([, parts]) =>
    parts.some((name) => needed.has(batchOf(name)?.table ?? "")),
  );

  const boundGroupOfPart = new Map<string, string>();
  for (const t of input.boundTables) {
    if (!t.emitted) continue;
    for (const part of t.parts) boundGroupOfPart.set(part, t.group);
  }

  const unboundBatches: string[] = [];
  const emptyCountyBatches: string[] = [];
  for (const [batch, parts] of batchesNeedingBind) {
    const boundParts = parts.filter((p) => boundGroupOfPart.has(p));
    if (boundParts.length === 0) {
      unboundBatches.push(batch);
      continue;
    }
    const isCounty = boundParts.some((p) => boundGroupOfPart.get(p) === "county");
    if (!isCounty) continue;
    const propertyRows = parts.reduce(
      (sum, p) => sum + (input.countyPropertyRowsByPart.get(p) ?? 0),
      0,
    );
    if (propertyRows === 0) emptyCountyBatches.push(batch);
  }

  return { batchesListed: batchesNeedingBind.length, unboundBatches, emptyCountyBatches };
}
