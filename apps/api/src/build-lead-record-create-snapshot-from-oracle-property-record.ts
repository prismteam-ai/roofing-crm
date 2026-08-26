/**
 * Lead snapshot from consolidated `getOracleProperty` when radius cache misses.
 */
import {
  resolveLeadProvenanceTier,
  scoreLead,
  type CountyCatalogKey,
} from "@roofing-crm-challenge/shared";

import type { LeadRecordCreateSnapshot } from "./leads-record-repository.js";
import type { LeadPermitSignals } from "./resolve-lead-permit-signals.js";
import type { OraclePropertyRecord } from "./routers/properties.js";

/**
 * Freezes address and structure-year fields from consolidated property JSON.
 *
 * `permitSignals` carries server-side recomputed open-permit years and permit
 * provenance so the stamped score and tier never depend on client claims.
 */
export function buildLeadRecordCreateSnapshotFromOraclePropertyRecord(arguments_: {
  countyKey: CountyCatalogKey;
  oraclePropertyRecord: OraclePropertyRecord;
  permitIds?: string[];
  permitSignals?: LeadPermitSignals;
  currentUtcYear: number;
}): LeadRecordCreateSnapshot {
  const street = arguments_.oraclePropertyRecord.addressStreet?.trim() ?? "";
  const city = arguments_.oraclePropertyRecord.addressCity?.trim() ?? "";
  const addressParts = [street, city].filter((part) => part.length > 0);
  const addressSnapshot =
    addressParts.length > 0
      ? addressParts.join(", ")
      : arguments_.oraclePropertyRecord.propertyId;
  const builtYear = arguments_.oraclePropertyRecord.builtYear ?? null;
  const structureAgeYears =
    builtYear === null ? null : arguments_.currentUtcYear - builtYear;
  const maxOpenPermitYears = arguments_.permitSignals?.maxOpenPermitYears ?? null;
  const provenanceTier = resolveLeadProvenanceTier({
    builtYearSource: arguments_.oraclePropertyRecord.builtYearSource ?? null,
    permitProvenanceClasses: arguments_.permitSignals?.permitProvenanceClasses ?? [],
  });

  return {
    propertyId: arguments_.oraclePropertyRecord.propertyId,
    parcelIdentifier:
      arguments_.oraclePropertyRecord.parcelIdentifier ??
      arguments_.oraclePropertyRecord.propertyId,
    countyKey: arguments_.countyKey,
    municipalityName: arguments_.oraclePropertyRecord.addressCity ?? null,
    gisMuni: null,
    addressSnapshot,
    builtYear,
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
