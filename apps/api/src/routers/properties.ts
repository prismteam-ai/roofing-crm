/**
 * Properties domain router.
 *
 * Loads one published parcel via `getOracleProperty`, probes
 * `getPermitQuerySchema`, and maps permit / BBB detail into the UI contract.
 * When the permit SQL table is unserved, details come from consolidated
 * `permits[]` on the property payload — never from `getPropertyPermits`.
 */
import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";
import {
  applySyntheticPropertyDetails,
  propertyNeedsDetailEnrichment,
} from "../build-synthetic-property-details.js";
import {
  CHESTER_PERMIT_PROVENANCE_CLASSES,
  isChesterCountyKey,
  isChesterDemoCountyKey,
  type ChesterPermitProvenanceClass,
} from "../classify-chester-permit.js";
import {
  loadChesterDemoContractorRosterByName,
  resolveChesterDemoContractorBbb,
} from "../load-chester-demo-contractor-roster.js";

/**
 * One permit row as returned on consolidated Elephant property JSON.
 *
 * Field names follow live MCP camelCase; missing dates stay undefined/null
 * so we never invent close dates for long-open ranking.
 */
export interface OraclePropertyPermitRecord {
  permitNumber?: string | null;
  permitType?: string | null;
  status?: string | null;
  issuedDate?: string | null;
  openedDate?: string | null;
  closedDate?: string | null;
  expiresDate?: string | null;
  description?: string | null;
  contractor?: string | null;
  improvementType?: string | null;
  sourceSystem?: string | null;
  provenanceClass?: ChesterPermitProvenanceClass | null;
}

/**
 * Optional BBB / reputation block on consolidated property JSON.
 *
 * Absent profiles mean empty BBB in the UI — never invent a letter or score.
 */
export interface OraclePropertyBusinessReputationProfile {
  bbbRating?: string | null;
  ratingScore?: number | null;
  ratingLetter?: string | null;
}

/**
 * Consolidated `getOracleProperty` payload fields this router consumes.
 *
 * Other appraisal fields may exist on the wire; we only project what the CRM
 * drawer and lead snapshot need.
 */
export interface OraclePropertyRecord {
  propertyId: string;
  parcelIdentifier?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  builtYear?: number | null;
  builtYearSource?: string | null;
  hasPermits?: boolean | null;
  permitCount?: number | null;
  hasBbbContractor?: boolean | null;
  permits?: OraclePropertyPermitRecord[] | null;
  businessReputationProfiles?: OraclePropertyBusinessReputationProfile[] | null;
}

/**
 * One permit row after mapping to the CRM property-detail contract.
 */
export interface PropertyPermitDetail {
  permitId: string | null;
  permitType: string | null;
  status: string | null;
  issuedDate: string | null;
  openedDate: string | null;
  closedDate: string | null;
  description: string | null;
  contractorName: string | null;
  sourceSystem: string | null;
  provenanceClass: ChesterPermitProvenanceClass | null;
}

/**
 * BBB block for the property drawer when a live profile exists.
 */
export interface PropertyBbbProfile {
  ratingLetter: string | null;
  ratingScore: number | null;
}

/**
 * Where permit detail rows for this response came from.
 *
 * `consolidated_permits` is the Lee path when `getPermitQuerySchema` fails.
 * `query_permits` is used only after a successful schema probe.
 */
export type PropertyPermitDetailsSource =
  "consolidated_permits" | "query_permits" | "synthetic_demo";

/**
 * How aggressively properties.get resolves permit/BBB detail rows.
 *
 * `drawer` tries consolidated IPFS JSON before synthetic fallback.
 * `scan` skips IPFS and uses synthetic when query-table flags need detail.
 */
export type PropertyDetailResolution = "drawer" | "scan";

/**
 * Output of `properties.get` for the map drawer and lead snapshot.
 */
export interface PropertiesGetResult {
  propertyId: string;
  county: string;
  parcelIdentifier: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  latitude: number | null;
  longitude: number | null;
  builtYear: number | null;
  builtYearSource: string | null;
  roofAgeBasis: "structure_year_built";
  hasPermits: boolean | null;
  permitCount: number | null;
  permits: PropertyPermitDetail[];
  permitDetailsSource: PropertyPermitDetailsSource;
  hasBbbContractor: boolean | null;
  bbb: PropertyBbbProfile | null;
}

/**
 * Dependencies for the properties router.
 *
 * Injectable so Vitest can fail the schema probe and supply consolidated JSON
 * without live MCP. `getPropertyPermits` is intentionally absent — harvest is
 * forbidden at this boundary.
 */
export interface PropertiesRouterDependencies {
  getOracleProperty: (arguments_: {
    county: string;
    propertyId: string;
  }) => Promise<OraclePropertyRecord>;
  getPermitQuerySchema: (arguments_: { county: string }) => Promise<unknown>;
  queryPermits: (arguments_: {
    county: string;
    propertyId: string;
    parcelIdentifier: string | null;
  }) => Promise<OraclePropertyPermitRecord[]>;
  /**
   * Optional consolidated `getOracleProperty` loader for drawer detail enrichment.
   */
  loadConsolidatedOracleProperty?: (arguments_: {
    county: string;
    propertyId: string;
  }) => Promise<OraclePropertyRecord | null>;
  consolidatedPropertyTimeoutMs?: number;
}

const propertiesGetInputSchema = z.object({
  county: z.string().min(1),
  propertyId: z.string().min(1),
  detailResolution: z.enum(["drawer", "scan"]).optional(),
});

const propertyPermitDetailSchema = z.object({
  permitId: z.string().nullable(),
  permitType: z.string().nullable(),
  status: z.string().nullable(),
  issuedDate: z.string().nullable(),
  openedDate: z.string().nullable(),
  closedDate: z.string().nullable(),
  description: z.string().nullable(),
  contractorName: z.string().nullable(),
  sourceSystem: z.string().nullable(),
  provenanceClass: z.enum(CHESTER_PERMIT_PROVENANCE_CLASSES).nullable(),
});

const propertyBbbProfileSchema = z.object({
  ratingLetter: z.string().nullable(),
  ratingScore: z.number().nullable(),
});

const propertiesGetResultSchema = z.object({
  propertyId: z.string().min(1),
  county: z.string().min(1),
  parcelIdentifier: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressZip: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  builtYear: z.number().int().nullable(),
  builtYearSource: z.string().nullable(),
  roofAgeBasis: z.literal("structure_year_built"),
  hasPermits: z.boolean().nullable(),
  permitCount: z.number().int().nullable(),
  permits: z.array(propertyPermitDetailSchema),
  permitDetailsSource: z.enum([
    "consolidated_permits",
    "query_permits",
    "synthetic_demo",
  ]),
  hasBbbContractor: z.boolean().nullable(),
  bbb: propertyBbbProfileSchema.nullable(),
});

/**
 * Maps one consolidated / query permit row into the CRM detail contract.
 *
 * Null dates stay null so callers do not invent close dates for ranking.
 */
export function mapOraclePropertyPermitRecordToPropertyPermitDetail(
  permitRecord: OraclePropertyPermitRecord,
): PropertyPermitDetail {
  return {
    permitId: permitRecord.permitNumber ?? null,
    permitType: permitRecord.permitType ?? permitRecord.improvementType ?? null,
    status: permitRecord.status ?? null,
    issuedDate: permitRecord.issuedDate ?? null,
    openedDate: permitRecord.openedDate ?? null,
    closedDate: permitRecord.closedDate ?? null,
    description: permitRecord.description ?? null,
    contractorName: permitRecord.contractor ?? null,
    sourceSystem: permitRecord.sourceSystem ?? null,
    provenanceClass: permitRecord.provenanceClass ?? null,
  };
}

/** Matches roof / roofing / shingle / membrane wording on type or description. */
const ROOFING_PROPERTY_PERMIT_TYPE_PATTERN = /roof/i;

/**
 * Whether a permit belongs on the long-open roofing lead layer.
 *
 * Non-roofing permits stay available for drawer detail but are excluded from
 * the layer filter (type or description must match `/roof/i`).
 */
export function isRoofingPropertyPermitDetail(
  permitDetail: PropertyPermitDetail,
): boolean {
  const typeText = permitDetail.permitType ?? "";
  const descriptionText = permitDetail.description ?? "";
  return (
    ROOFING_PROPERTY_PERMIT_TYPE_PATTERN.test(typeText) ||
    ROOFING_PROPERTY_PERMIT_TYPE_PATTERN.test(descriptionText)
  );
}

/**
 * Selects roofing permit rows for the long-open lead layer.
 *
 * Preserves input order; does not invent close dates or drop null dates.
 */
export function selectRoofingPropertyPermitDetails(
  permitDetails: PropertyPermitDetail[],
): PropertyPermitDetail[] {
  return permitDetails.filter(isRoofingPropertyPermitDetail);
}

/**
 * Extracts BBB from the first reputation profile when present.
 *
 * Returns null when no profile or no letter/score exists — empty BBB is valid.
 */
export function mapOraclePropertyBusinessReputationToPropertyBbbProfile(
  reputationProfiles: OraclePropertyBusinessReputationProfile[] | null | undefined,
): PropertyBbbProfile | null {
  if (!reputationProfiles || reputationProfiles.length === 0) {
    return null;
  }

  const firstProfile = reputationProfiles[0];
  if (!firstProfile) {
    return null;
  }

  const ratingLetter = firstProfile.ratingLetter ?? firstProfile.bbbRating ?? null;
  const ratingScore =
    typeof firstProfile.ratingScore === "number" ? firstProfile.ratingScore : null;

  if (ratingLetter === null && ratingScore === null) {
    return null;
  }

  return { ratingLetter, ratingScore };
}

/**
 * Resolves permit detail rows after probing the county permit query schema.
 *
 * Schema failure → consolidated `permits[]`. Schema success → `queryPermits`.
 * Never calls harvest tools.
 */
export async function resolvePropertyPermitDetails(arguments_: {
  county: string;
  propertyId: string;
  oraclePropertyRecord: OraclePropertyRecord;
  getPermitQuerySchema: PropertiesRouterDependencies["getPermitQuerySchema"];
  queryPermits: PropertiesRouterDependencies["queryPermits"];
}): Promise<{
  permits: PropertyPermitDetail[];
  permitDetailsSource: PropertyPermitDetailsSource;
}> {
  let permitQuerySchemaAvailable: boolean;
  try {
    await arguments_.getPermitQuerySchema({ county: arguments_.county });
    permitQuerySchemaAvailable = true;
  } catch {
    permitQuerySchemaAvailable = false;
  }

  if (!permitQuerySchemaAvailable) {
    const consolidatedPermits = arguments_.oraclePropertyRecord.permits ?? [];
    return {
      permitDetailsSource: "consolidated_permits",
      permits: consolidatedPermits.map(
        mapOraclePropertyPermitRecordToPropertyPermitDetail,
      ),
    };
  }

  try {
    const queriedPermits = await arguments_.queryPermits({
      county: arguments_.county,
      propertyId: arguments_.propertyId,
      parcelIdentifier: arguments_.oraclePropertyRecord.parcelIdentifier ?? null,
    });
    return {
      permitDetailsSource: "query_permits",
      permits: queriedPermits.map(mapOraclePropertyPermitRecordToPropertyPermitDetail),
    };
  } catch {
    const consolidatedPermits = arguments_.oraclePropertyRecord.permits ?? [];
    return {
      permitDetailsSource: "consolidated_permits",
      permits: consolidatedPermits.map(
        mapOraclePropertyPermitRecordToPropertyPermitDetail,
      ),
    };
  }
}

/**
 * Builds the CRM property-detail result from an oracle record and permit probe.
 */
export async function buildPropertiesGetResult(arguments_: {
  county: string;
  propertyId: string;
  oraclePropertyRecord: OraclePropertyRecord;
  getPermitQuerySchema: PropertiesRouterDependencies["getPermitQuerySchema"];
  queryPermits: PropertiesRouterDependencies["queryPermits"];
  loadConsolidatedOracleProperty?: PropertiesRouterDependencies["loadConsolidatedOracleProperty"];
  consolidatedPropertyTimeoutMs?: number;
  detailResolution?: PropertyDetailResolution;
  currentUtcYear?: number;
}): Promise<PropertiesGetResult> {
  const detailResolution = arguments_.detailResolution ?? "drawer";
  const currentUtcYear = arguments_.currentUtcYear ?? new Date().getUTCFullYear();

  let { permits, permitDetailsSource } = await resolvePropertyPermitDetails({
    county: arguments_.county,
    propertyId: arguments_.propertyId,
    oraclePropertyRecord: arguments_.oraclePropertyRecord,
    getPermitQuerySchema: arguments_.getPermitQuerySchema,
    queryPermits: arguments_.queryPermits,
  });

  const hasBbbContractor = arguments_.oraclePropertyRecord.hasBbbContractor ?? null;
  let bbb =
    hasBbbContractor === false
      ? null
      : mapOraclePropertyBusinessReputationToPropertyBbbProfile(
          arguments_.oraclePropertyRecord.businessReputationProfiles,
        );

  let workingOracleRecord = arguments_.oraclePropertyRecord;

  if (
    detailResolution === "drawer" &&
    arguments_.loadConsolidatedOracleProperty !== undefined &&
    propertyNeedsDetailEnrichment(workingOracleRecord, permits, bbb)
  ) {
    const consolidatedRecord = await arguments_.loadConsolidatedOracleProperty({
      county: arguments_.county,
      propertyId: arguments_.propertyId,
    });
    if (consolidatedRecord !== null) {
      workingOracleRecord = {
        ...workingOracleRecord,
        permits: consolidatedRecord.permits ?? workingOracleRecord.permits,
        businessReputationProfiles:
          consolidatedRecord.businessReputationProfiles ??
          workingOracleRecord.businessReputationProfiles,
      };
      const consolidatedResolved = await resolvePropertyPermitDetails({
        county: arguments_.county,
        propertyId: arguments_.propertyId,
        oraclePropertyRecord: workingOracleRecord,
        getPermitQuerySchema: arguments_.getPermitQuerySchema,
        queryPermits: arguments_.queryPermits,
      });
      permits = consolidatedResolved.permits;
      permitDetailsSource = consolidatedResolved.permitDetailsSource;
      bbb =
        hasBbbContractor === false
          ? null
          : mapOraclePropertyBusinessReputationToPropertyBbbProfile(
              workingOracleRecord.businessReputationProfiles,
            );
    }
  }

  if (
    propertyNeedsDetailEnrichment(workingOracleRecord, permits, bbb) &&
    !isChesterCountyKey(arguments_.county)
  ) {
    const syntheticDetails = applySyntheticPropertyDetails({
      oraclePropertyRecord: workingOracleRecord,
      resolvedPermits: permits,
      resolvedBbb: bbb,
      currentUtcYear,
    });
    permits = syntheticDetails.permits;
    bbb = syntheticDetails.bbb;
    permitDetailsSource = "synthetic_demo";
  }

  if (isChesterDemoCountyKey(arguments_.county) && bbb === null) {
    try {
      const rosterByName = await loadChesterDemoContractorRosterByName();
      for (const permit of permits) {
        if (permit.provenanceClass !== "synthetic_demo") {
          continue;
        }
        const rosterBbb = resolveChesterDemoContractorBbb(
          rosterByName,
          permit.contractorName,
        );
        if (rosterBbb !== null) {
          bbb = rosterBbb;
          break;
        }
      }
    } catch {
      // Roster fetch failure must not fail the drawer — empty BBB is valid.
    }
  }

  return {
    propertyId: workingOracleRecord.propertyId,
    county: arguments_.county,
    parcelIdentifier: workingOracleRecord.parcelIdentifier ?? null,
    addressStreet: workingOracleRecord.addressStreet ?? null,
    addressCity: workingOracleRecord.addressCity ?? null,
    addressZip: workingOracleRecord.addressZip ?? null,
    latitude: workingOracleRecord.latitude ?? null,
    longitude: workingOracleRecord.longitude ?? null,
    builtYear: workingOracleRecord.builtYear ?? null,
    builtYearSource: workingOracleRecord.builtYearSource ?? null,
    roofAgeBasis: "structure_year_built",
    hasPermits: workingOracleRecord.hasPermits ?? null,
    permitCount: workingOracleRecord.permitCount ?? null,
    permits,
    permitDetailsSource,
    hasBbbContractor,
    bbb,
  };
}

/**
 * Builds the properties tRPC router over injectable Elephant loaders.
 */
export function createPropertiesRouter(dependencies: PropertiesRouterDependencies) {
  return router({
    /**
     * Returns one property with permit and BBB detail for the map drawer.
     *
     * Probes permit schema first; on failure uses consolidated `permits[]`.
     * Does not call `getPropertyPermits`.
     */
    get: publicProcedure
      .input(propertiesGetInputSchema)
      .output(propertiesGetResultSchema)
      .query(async ({ ctx, input }) => {
        ctx.logger.debug("properties.get", {
          county: input.county,
          propertyId: input.propertyId,
        });

        const oraclePropertyRecord = await dependencies.getOracleProperty({
          county: input.county,
          propertyId: input.propertyId,
        });

        return buildPropertiesGetResult({
          county: input.county,
          propertyId: input.propertyId,
          oraclePropertyRecord,
          getPermitQuerySchema: dependencies.getPermitQuerySchema,
          queryPermits: dependencies.queryPermits,
          loadConsolidatedOracleProperty: dependencies.loadConsolidatedOracleProperty,
          consolidatedPropertyTimeoutMs: dependencies.consolidatedPropertyTimeoutMs,
          detailResolution: input.detailResolution ?? "drawer",
        });
      }),
  });
}

/**
 * Production properties router.
 *
 * MCP transports throw until Lambda wiring lands; unit tests inject mocks
 * through `createPropertiesRouter`.
 */
export const propertiesRouter = createPropertiesRouter({
  getOracleProperty: loadOracleProperty,
  getPermitQuerySchema: loadPermitQuerySchema,
  queryPermits: loadQueryPermits,
});

/**
 * Loads one consolidated property from Elephant MCP.
 *
 * Throws until the Lambda MCP transport is configured.
 */
export async function loadOracleProperty(_arguments: {
  county: string;
  propertyId: string;
}): Promise<OraclePropertyRecord> {
  throw new Error(
    "Oracle property transport is not configured; inject getOracleProperty in createPropertiesRouter or wire MCP in the Lambda handler",
  );
}

/**
 * Probes whether the county permit query table is served.
 *
 * Throws until MCP is wired; Vitest injects a failing or succeeding probe.
 */
export async function loadPermitQuerySchema(_arguments: {
  county: string;
}): Promise<unknown> {
  throw new Error(
    "Permit query schema transport is not configured; inject getPermitQuerySchema in createPropertiesRouter or wire MCP in the Lambda handler",
  );
}

/**
 * Loads permit rows via queryPermits after a successful schema probe.
 *
 * Throws until MCP is wired. Never used when the schema probe fails.
 */
export async function loadQueryPermits(_arguments: {
  county: string;
  propertyId: string;
  parcelIdentifier: string | null;
}): Promise<OraclePropertyPermitRecord[]> {
  throw new Error(
    "Permit query transport is not configured; inject queryPermits in createPropertiesRouter or wire MCP in the Lambda handler",
  );
}
