/**
 * Pure transformer from published property/permit records to RAG corpus chunks.
 */
import { createHash } from "node:crypto";

import type { SearchInRadiusPropertyRow } from "../routers/search.js";
import {
  isRoofingPropertyPermitDetail,
  mapOraclePropertyPermitRecordToPropertyPermitDetail,
  selectRoofingPropertyPermitDetails,
  type OraclePropertyPermitRecord,
  type OraclePropertyRecord,
  type PropertyPermitDetail,
} from "../routers/properties.js";
import {
  roofingOpportunityChunkSchema,
  type RoofingOpportunityChunk,
} from "./roofing-opportunity-chunk.js";

export const ROOFING_OPPORTUNITY_CHUNK_SCHEMA_VERSION = 1;

const CLOSED_PERMIT_STATUS_PATTERN =
  /^(closed|complete|final|certificate issued|expired)$/i;

/**
 * Whether a mapped permit detail is still open on the published record.
 */
export function isOpenRoofingPermitDetail(permitDetail: PropertyPermitDetail): boolean {
  if (!isRoofingPropertyPermitDetail(permitDetail)) {
    return false;
  }
  const status = permitDetail.status?.trim() ?? "";
  if (status.length === 0) {
    return true;
  }
  return !CLOSED_PERMIT_STATUS_PATTERN.test(status);
}

/**
 * Computes whole-year open duration from the earliest available permit date.
 */
export function resolveOpenPermitYears(
  permitDetail: PropertyPermitDetail,
  referenceDate: Date = new Date(),
): number | null {
  const dateText =
    permitDetail.openedDate ?? permitDetail.issuedDate ?? permitDetail.closedDate;
  if (dateText === null || dateText === undefined || dateText.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(dateText);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const diffMs = referenceDate.getTime() - parsed;
  if (diffMs < 0) {
    return null;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
}

function stableContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function buildSourceUri(county: string, propertyId: string): string {
  return `elephant://${county.trim().toLowerCase()}/property/${propertyId}`;
}

function mapPermitRecords(
  permitRecords: OraclePropertyPermitRecord[] | null | undefined,
): PropertyPermitDetail[] {
  return (permitRecords ?? []).map(mapOraclePropertyPermitRecordToPropertyPermitDetail);
}

export interface BuildRoofingOpportunityChunksInput {
  county: string;
  propertyRow: SearchInRadiusPropertyRow;
  oraclePropertyRecord?: OraclePropertyRecord | null;
  indexedAt?: string;
  provenance?: string;
}

/**
 * Builds property-summary and roofing-permit chunks for one published parcel.
 */
export function buildRoofingOpportunityChunks(
  input: BuildRoofingOpportunityChunksInput,
): RoofingOpportunityChunk[] {
  const { propertyRow, county } = input;
  const oracle = input.oraclePropertyRecord ?? null;
  const permitDetails = selectRoofingPropertyPermitDetails(
    mapPermitRecords(oracle?.permits),
  );
  const openPermitDetails = permitDetails.filter(isOpenRoofingPermitDetail);
  const maxOpenPermitYears =
    openPermitDetails.length === 0
      ? null
      : Math.max(
          ...openPermitDetails.map((permit) => resolveOpenPermitYears(permit) ?? 0),
        );

  const builtYear = propertyRow.builtYear ?? oracle?.builtYear ?? null;
  const addressStreet = propertyRow.addressStreet ?? oracle?.addressStreet ?? null;
  const addressCity = propertyRow.addressCity ?? oracle?.addressCity ?? null;
  const indexedAt = input.indexedAt ?? new Date().toISOString();
  const provenance = input.provenance ?? "published_elephant_mcp";

  const summaryText = [
    `Published ${county} parcel ${propertyRow.propertyId}.`,
    addressStreet !== null
      ? `Address ${addressStreet}${addressCity !== null ? `, ${addressCity}` : ""}.`
      : "",
    builtYear !== null
      ? `Structure built_year ${String(builtYear)} (roof-age proxy).`
      : "Structure built_year unknown (roof-age proxy unavailable).",
    openPermitDetails.length > 0
      ? `${String(openPermitDetails.length)} open roofing permit(s) on consolidated record.`
      : "No open roofing permit on consolidated record.",
  ]
    .filter((line) => line.length > 0)
    .join(" ");

  const chunks: RoofingOpportunityChunk[] = [
    roofingOpportunityChunkSchema.parse({
      chunkId: `${propertyRow.propertyId}#property-summary`,
      propertyId: propertyRow.propertyId,
      parcel_identifier: propertyRow.parcelIdentifier,
      county,
      documentKind: "property_summary",
      text: summaryText,
      sourceUri: buildSourceUri(county, propertyRow.propertyId),
      built_year: builtYear,
      has_open_roofing_permit: openPermitDetails.length > 0,
      open_permit_years: maxOpenPermitYears,
      latitude: propertyRow.latitude,
      longitude: propertyRow.longitude,
      schema_version: ROOFING_OPPORTUNITY_CHUNK_SCHEMA_VERSION,
      source_hash: stableContentHash(summaryText),
      indexed_at: indexedAt,
      permit_id: null,
      contractor_name: openPermitDetails[0]?.contractorName ?? null,
      bbb_rating: null,
      address_street: addressStreet,
      address_city: addressCity,
      provenance,
    }),
  ];

  for (const permitDetail of openPermitDetails) {
    const permitId =
      permitDetail.permitId ??
      `${propertyRow.propertyId}-roof-${stableContentHash(
        `${permitDetail.permitType ?? ""}-${permitDetail.openedDate ?? ""}`,
      )}`;
    const openYears = resolveOpenPermitYears(permitDetail);
    const permitText = [
      `Open roofing permit ${permitId} on ${propertyRow.propertyId}.`,
      permitDetail.permitType !== null ? `Permit type ${permitDetail.permitType}.` : "",
      permitDetail.status !== null ? `Status ${permitDetail.status}.` : "",
      openYears !== null
        ? `Permit has remained open about ${String(openYears)} year(s).`
        : "Permit open duration unknown (missing dates).",
      permitDetail.contractorName !== null
        ? `Contractor ${permitDetail.contractorName}.`
        : "",
    ]
      .filter((line) => line.length > 0)
      .join(" ");

    chunks.push(
      roofingOpportunityChunkSchema.parse({
        chunkId: `${propertyRow.propertyId}#permit-${permitId}`,
        propertyId: propertyRow.propertyId,
        parcel_identifier: propertyRow.parcelIdentifier,
        county,
        documentKind: "roofing_permit",
        text: permitText,
        sourceUri: buildSourceUri(county, propertyRow.propertyId),
        built_year: builtYear,
        has_open_roofing_permit: true,
        open_permit_years: openYears,
        latitude: propertyRow.latitude,
        longitude: propertyRow.longitude,
        schema_version: ROOFING_OPPORTUNITY_CHUNK_SCHEMA_VERSION,
        source_hash: stableContentHash(permitText),
        indexed_at: indexedAt,
        permit_id: permitId,
        contractor_name: permitDetail.contractorName,
        bbb_rating: null,
        address_street: addressStreet,
        address_city: addressCity,
        provenance,
      }),
    );
  }

  return chunks;
}
