// B-09 review fix (/code-review Major): full-county manifests publish no parcel count, so on a
// first run nothing checked that the property count was plausible — 0 rows, or a bind that
// silently dropped a batch, would validate. Vendored query-core's bindManifest skips (never
// guesses) a batch whose data group it can't resolve (`if (!group) continue`), so BuildIndex now
// compares what was bound against the manifest's own batch list and reports the gaps; Validate
// holds on them (validate.fullCounty.test.ts).
import { describe, expect, it } from "vitest";
import type { BoundTable } from "@crm/oracle-views";
import { batchCoverage, manifestTableArtifactNames } from "../handlers/buildIndex.js";

const b = (batch: string, table: string, part = "part-00000.parquet"): string =>
  `run/county-batched/tables/${batch}/${table}/${part}`;
const pi = (batch: string, table: string, part = "part-00000.parquet"): string =>
  `run/permits-batched/tables/${batch}/${table}/${part}`;

function bound(group: string, table: string, parts: string[]): BoundTable {
  return { group, table, emitted: true, parts };
}

describe("BuildIndex: batch coverage against the manifest's own batch list", () => {
  const names = [
    b("b01", "property"),
    b("b01", "geometry"),
    b("b02", "property"),
    b("b02", "geometry"),
    pi("b01", "property_improvement"),
  ];

  it("reports full coverage when every batch was bound and every county batch has property rows", () => {
    const coverage = batchCoverage({
      tableArtifactNames: names,
      boundTables: [
        bound("county", "property", [b("b01", "property"), b("b02", "property")]),
        bound("county", "geometry", [b("b01", "geometry"), b("b02", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([
        [b("b01", "property"), 40_000],
        [b("b02", "property"), 41_000],
      ]),
    });
    expect(coverage).toEqual({ batchesListed: 3, unboundBatches: [], emptyCountyBatches: [] });
  });

  it("names a batch bindManifest skipped (data group unresolved) as unbound", () => {
    const coverage = batchCoverage({
      tableArtifactNames: names,
      boundTables: [
        bound("county", "property", [b("b01", "property")]),
        bound("county", "geometry", [b("b01", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([[b("b01", "property"), 40_000]]),
    });
    expect(coverage.unboundBatches).toEqual(["run/county-batched/tables/b02"]);
  });

  it("names a county batch that contributed no property rows as empty", () => {
    const coverage = batchCoverage({
      tableArtifactNames: names,
      boundTables: [
        bound("county", "property", [b("b01", "property"), b("b02", "property")]),
        bound("county", "geometry", [b("b01", "geometry"), b("b02", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([[b("b01", "property"), 40_000]]),
    });
    expect(coverage.emptyCountyBatches).toEqual(["run/county-batched/tables/b02"]);
    expect(coverage.unboundBatches).toEqual([]);
  });

  it("ignores batches that hold no table the two bound views read (nothing to bind there)", () => {
    const coverage = batchCoverage({
      tableArtifactNames: [b("b01", "property"), "run/places/tables/b01/place/part-00000.parquet"],
      boundTables: [bound("county", "property", [b("b01", "property")])],
      countyPropertyRowsByPart: new Map([[b("b01", "property"), 10]]),
    });
    expect(coverage).toEqual({ batchesListed: 1, unboundBatches: [], emptyCountyBatches: [] });
  });

  it("reads table artifact names from the manifest bytes, ignoring non-table artifacts", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        artifacts: [
          { kind: "table", name: b("b01", "property"), cid: "x" },
          { kind: "directory", name: "run/county-batched/tables/b01", cid: "y" },
        ],
      }),
    );
    expect(manifestTableArtifactNames(bytes)).toEqual([b("b01", "property")]);
    expect(manifestTableArtifactNames(new TextEncoder().encode("{}"))).toEqual([]);
  });

  // --- B-09: Plan now fetches only boundPartNames(artifacts, [v_property, v_roofing_permit]) ---

  it("does not hold on tables the views never read, which Plan no longer fetches", () => {
    // b01 is fully bound for what the views need; its address/parcel parts were never fetched.
    const coverage = batchCoverage({
      tableArtifactNames: [
        b("b01", "property"),
        b("b01", "geometry"),
        b("b01", "address"),
        b("b01", "parcel"),
        pi("b01", "property_improvement"),
        pi("b01", "property"), // property_improvement.property: same name, a table no view reads
      ],
      boundTables: [
        bound("county", "property", [b("b01", "property")]),
        bound("county", "geometry", [b("b01", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([[b("b01", "property"), 40_000]]),
    });
    expect(coverage).toEqual({ batchesListed: 2, unboundBatches: [], emptyCountyBatches: [] });
  });

  it("still holds when a needed county batch contributed nothing to the bind", () => {
    const coverage = batchCoverage({
      tableArtifactNames: names,
      boundTables: [
        bound("county", "property", [b("b01", "property")]),
        bound("county", "geometry", [b("b01", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([[b("b01", "property"), 40_000]]),
    });
    expect(coverage.unboundBatches).toEqual(["run/county-batched/tables/b02"]);
  });

  it("still holds on a batch whose data group cannot be resolved but which carries a table the views read", () => {
    // Only `company` (listed for both groups, never an anchor) and an unknown table: bindManifest
    // cannot resolve this batch's group, so boundPartNames lists none of it — the conservative
    // name rule must still flag it rather than letting a skipped batch validate.
    const coverage = batchCoverage({
      tableArtifactNames: [...names, b("b09", "company"), b("b09", "mystery_table")],
      boundTables: [
        bound("county", "property", [b("b01", "property"), b("b02", "property")]),
        bound("county", "geometry", [b("b01", "geometry"), b("b02", "geometry")]),
        bound("property_improvement", "property_improvement", [pi("b01", "property_improvement")]),
      ],
      countyPropertyRowsByPart: new Map([
        [b("b01", "property"), 40_000],
        [b("b02", "property"), 41_000],
      ]),
    });
    expect(coverage.unboundBatches).toEqual(["run/county-batched/tables/b09"]);
  });
});
