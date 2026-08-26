/**
 * Deterministic synthetic permit and BBB detail for demo when consolidated
 * IPFS JSON is unavailable. IDs are prefixed SYNTHETIC- for provenance honesty.
 */
import type {
  OraclePropertyRecord,
  PropertyBbbProfile,
  PropertyPermitDetail,
} from "./routers/properties.js";

const SYNTHETIC_CONTRACTOR_NAMES = [
  "Gulf Coast Roofing LLC",
  "Sunshine Shingle Co",
  "Lee County Roof Pros",
  "Palmetto Roofing Group",
] as const;

const SYNTHETIC_BBB_LETTERS = ["A+", "A", "A-", "B+"] as const;

/**
 * Stable 32-bit hash from a property id for reproducible demo signals.
 */
export function hashPropertyIdSeed(propertyId: string): number {
  let hash = 0;
  for (let index = 0; index < propertyId.length; index += 1) {
    hash = (hash * 31 + propertyId.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Whether consolidated detail is still missing after the query-table path.
 */
export function propertyNeedsDetailEnrichment(
  oraclePropertyRecord: OraclePropertyRecord,
  resolvedPermits: PropertyPermitDetail[],
  resolvedBbb: PropertyBbbProfile | null,
): boolean {
  const needsPermits =
    oraclePropertyRecord.hasPermits === true && resolvedPermits.length === 0;
  const needsBbb =
    oraclePropertyRecord.hasBbbContractor === true && resolvedBbb === null;
  return needsPermits || needsBbb;
}

/**
 * Builds deterministic synthetic roofing permit rows for one property.
 */
export function buildSyntheticPropertyPermitDetails(arguments_: {
  propertyId: string;
  permitCount: number | null;
  currentUtcYear: number;
}): PropertyPermitDetail[] {
  const seed = hashPropertyIdSeed(arguments_.propertyId);
  const permitRowCount = Math.max(1, Math.min(arguments_.permitCount ?? 1, 2));
  const openYears = 5 + (seed % 8);

  const permits: PropertyPermitDetail[] = [];
  for (let index = 0; index < permitRowCount; index += 1) {
    const rowSeed = seed + index * 17;
    const issueYear = arguments_.currentUtcYear - openYears - index;
    const issueDate = `${String(issueYear)}-0${String((rowSeed % 9) + 1)}-15`;
    permits.push({
      permitId: `SYNTHETIC-${arguments_.propertyId}-${String(index + 1)}`,
      permitType: "Roofing",
      status: "Open",
      issuedDate: issueDate,
      openedDate: issueDate,
      closedDate: null,
      description: "Synthetic demo roofing permit — clearly labeled",
      contractorName:
        SYNTHETIC_CONTRACTOR_NAMES[rowSeed % SYNTHETIC_CONTRACTOR_NAMES.length] ??
        "Synthetic Roofing Demo",
      sourceSystem: "api_synthetic_demo",
      provenanceClass: "synthetic_demo",
    });
  }

  return permits;
}

/**
 * Builds a deterministic synthetic BBB profile when the flag is set.
 */
export function buildSyntheticPropertyBbbProfile(
  propertyId: string,
): PropertyBbbProfile {
  const seed = hashPropertyIdSeed(propertyId);
  const ratingLetter =
    SYNTHETIC_BBB_LETTERS[seed % SYNTHETIC_BBB_LETTERS.length] ?? "A";
  const ratingScore = 88 + (seed % 10);
  return { ratingLetter, ratingScore };
}

/**
 * Merges synthetic permit/BBB detail onto a sparse oracle record.
 */
export function applySyntheticPropertyDetails(arguments_: {
  oraclePropertyRecord: OraclePropertyRecord;
  resolvedPermits: PropertyPermitDetail[];
  resolvedBbb: PropertyBbbProfile | null;
  currentUtcYear: number;
}): {
  permits: PropertyPermitDetail[];
  bbb: PropertyBbbProfile | null;
} {
  const permits =
    arguments_.resolvedPermits.length > 0
      ? arguments_.resolvedPermits
      : arguments_.oraclePropertyRecord.hasPermits === true
        ? buildSyntheticPropertyPermitDetails({
            propertyId: arguments_.oraclePropertyRecord.propertyId,
            permitCount: arguments_.oraclePropertyRecord.permitCount ?? null,
            currentUtcYear: arguments_.currentUtcYear,
          })
        : arguments_.resolvedPermits;

  const bbb =
    arguments_.resolvedBbb ??
    (arguments_.oraclePropertyRecord.hasBbbContractor === true
      ? buildSyntheticPropertyBbbProfile(arguments_.oraclePropertyRecord.propertyId)
      : null);

  return { permits, bbb };
}
