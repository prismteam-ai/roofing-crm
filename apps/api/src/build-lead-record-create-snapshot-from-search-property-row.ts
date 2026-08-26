/**
 * Lead snapshot from a radius-search property row (no second MCP round-trip).
 */
import {
  resolveLeadProvenanceTier,
  scoreLead,
  type CountyCatalogKey,
} from "@roofing-crm-challenge/shared";
import type { LeadRecordCreateSnapshot } from "./leads-record-repository.js";
import type { LeadPermitSignals } from "./resolve-lead-permit-signals.js";
import type { SearchInRadiusPropertyRow } from "./routers/search.js";

/**
 * Freezes address and structure-year fields onto a LeadRecord at create time.
 *
 * `permitSignals` carries server-side recomputed open-permit years and permit
 * provenance so the stamped score and tier never depend on client claims.
 */
export function buildLeadRecordCreateSnapshotFromSearchPropertyRow(arguments_: {
  countyKey: CountyCatalogKey;
  propertyRow: SearchInRadiusPropertyRow;
  permitIds?: string[];
  permitSignals?: LeadPermitSignals;
  currentUtcYear: number;
}): LeadRecordCreateSnapshot {
  const street = arguments_.propertyRow.addressStreet?.trim() ?? "";
  const city = arguments_.propertyRow.addressCity?.trim() ?? "";
  const addressParts = [street, city].filter((part) => part.length > 0);
  const addressSnapshot =
    addressParts.length > 0
      ? addressParts.join(", ")
      : arguments_.propertyRow.propertyId;
  const structureAgeYears =
    arguments_.propertyRow.builtYear === null
      ? null
      : arguments_.currentUtcYear - arguments_.propertyRow.builtYear;
  const maxOpenPermitYears = arguments_.permitSignals?.maxOpenPermitYears ?? null;
  const provenanceTier = resolveLeadProvenanceTier({
    builtYearSource: arguments_.propertyRow.builtYearSource ?? null,
    permitProvenanceClasses: arguments_.permitSignals?.permitProvenanceClasses ?? [],
  });

  return {
    propertyId: arguments_.propertyRow.propertyId,
    parcelIdentifier:
      arguments_.propertyRow.parcelIdentifier ?? arguments_.propertyRow.propertyId,
    countyKey: arguments_.countyKey,
    municipalityName: arguments_.propertyRow.addressCity,
    gisMuni: arguments_.propertyRow.gisMuni,
    addressSnapshot,
    builtYear: arguments_.propertyRow.builtYear,
    roofAgeBasis: "structure_year_built",
    structureAgeYears,
    // Prefer the server-recomputed open permits; client permitIds are only a
    // fallback when the permit lookup produced nothing.
    openPermitIds:
      arguments_.permitSignals !== undefined &&
      arguments_.permitSignals.openPermitIds.length > 0
        ? arguments_.permitSignals.openPermitIds
        : (arguments_.permitIds ?? []),
    maxOpenPermitYears,
    contractorName: arguments_.permitSignals?.contractorName ?? null,
    bbbRating: null,
    provenanceTier,
    leadScore: scoreLead({
      structureAgeYears,
      maxOpenPermitYears,
      hasSyntheticSignal: provenanceTier === "synthetic_demo",
    }),
  };
}
