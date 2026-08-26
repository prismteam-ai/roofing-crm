/**
 * Chester permit provenance classes locked by the elephant-pipeline contract.
 *
 * County GIS health/planning rows are never roofing UCC. Synthetic demo rows
 * are labeled separately under chester-demo.
 */

/** Canonical provenance class values (single source for types and Zod enums). */
export const CHESTER_PERMIT_PROVENANCE_CLASSES = [
  "smartgov_ucc",
  "county_gis_well",
  "county_gis_sewage",
  "county_gis_act247",
  "synthetic_demo",
] as const;

export type ChesterPermitProvenanceClass =
  (typeof CHESTER_PERMIT_PROVENANCE_CLASSES)[number];

/**
 * Classifies a Chester permit by improvement_type / source_system.
 *
 * Synthetic rows win when source_system is chester_synthetic_demo or the id
 * uses the SYNTHETIC-CHESTER- prefix. GIS prefixes are exact contract strings.
 */
export function classifyChesterPermit(arguments_: {
  improvementType: string | null | undefined;
  sourceSystem: string | null | undefined;
  permitId: string | null | undefined;
}): ChesterPermitProvenanceClass {
  const sourceSystem = arguments_.sourceSystem?.trim().toLowerCase() ?? "";
  const permitId = arguments_.permitId?.trim() ?? "";
  if (
    sourceSystem === "chester_synthetic_demo" ||
    permitId.startsWith("SYNTHETIC-CHESTER-")
  ) {
    return "synthetic_demo";
  }

  const improvementType = arguments_.improvementType ?? "";
  if (improvementType.startsWith("County health well /")) {
    return "county_gis_well";
  }
  if (improvementType.startsWith("County health sewage /")) {
    return "county_gis_sewage";
  }
  if (improvementType.startsWith("Act 247 ")) {
    return "county_gis_act247";
  }
  return "smartgov_ucc";
}

/**
 * Human-readable label for a Chester permit provenance class.
 */
export function formatChesterPermitProvenanceLabel(
  provenanceClass: ChesterPermitProvenanceClass,
): string {
  switch (provenanceClass) {
    case "synthetic_demo":
      return "Synthetic demo roofing";
    case "county_gis_well":
      return "County GIS well";
    case "county_gis_sewage":
      return "County GIS sewage";
    case "county_gis_act247":
      return "County GIS Act 247 planning";
    case "smartgov_ucc":
      return "SmartGov municipal UCC candidate";
  }
}

/**
 * Whether a county key is a Chester challenge dataset (real or demo).
 */
export function isChesterCountyKey(countyKey: string): boolean {
  const normalized = countyKey.trim().toLowerCase();
  return normalized === "chester" || normalized === "chester-demo";
}

/**
 * Whether a county key is the labeled synthetic Chester demo dataset.
 */
export function isChesterDemoCountyKey(countyKey: string): boolean {
  return countyKey.trim().toLowerCase() === "chester-demo";
}
