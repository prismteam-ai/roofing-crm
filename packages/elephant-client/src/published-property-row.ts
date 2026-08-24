import { z } from "zod";

/**
 * Coerces MCP numeric fields that may arrive as strings on some county tables.
 */
function nullableCoercedNumber() {
  return z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, z.number().nullable());
}

/**
 * Coerces integer MCP fields (e.g. Montgomery `built_year` as a string).
 * Non-numeric leftovers become null so one bad year cannot 500 radius search.
 */
function nullableCoercedInt() {
  return z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }, z.number().int().nullable());
}

/**
 * Zod schema for one Lee published-properties MCP row (37 columns).
 *
 * Matches the live `queryProperties` / property view for Lee. `gis_muni` is
 * not on this view — do not expect or invent it for Lee clipping. Prefer
 * `has_permits` / embedded `permits[]` over any harvest-adjacent permit tool.
 */
export const publishedPropertyRowSchema = z.object({
  property_id: z.string().min(1),
  property_cid: z.string().nullable(),
  request_identifier: z.string().nullable(),
  parcel_identifier: z.string().nullable(),
  source_system: z.string().nullable(),
  county_name: z.string().nullable(),
  state_code: z.string().nullable(),
  address_street: z.string().nullable(),
  address_city: z.string().nullable(),
  address_zip: z.string().nullable(),
  latitude: nullableCoercedNumber(),
  longitude: nullableCoercedNumber(),
  lot_size_acre: z.number().nullable(),
  lot_area_sqft: z.number().nullable(),
  exterior_wall_material: z.string().nullable(),
  roof_covering_material: z.string().nullable(),
  property_type: z.string().nullable(),
  property_usage_type: z.string().nullable(),
  /** Structure year built; null means exclude from aging-roof proxy only. */
  built_year: nullableCoercedInt(),
  /** Present on chester-demo only; absent elsewhere (defaults null via fill). */
  built_year_source: z.string().nullable().optional(),
  livable_floor_area: z.number().nullable(),
  total_area: z.number().nullable(),
  assessed_value: z.number().nullable(),
  market_value: z.number().nullable(),
  land_value: z.number().nullable(),
  avm_value: z.number().nullable(),
  owner_name: z.string().nullable(),
  owners_text: z.string().nullable(),
  owner_count: z.number().int().nullable(),
  owner_occupied: z.boolean().nullable(),
  last_sale_date: z.string().nullable(),
  last_sale_price: z.number().nullable(),
  subdivision: z.string().nullable(),
  has_permits: z.boolean().nullable(),
  /** Lee's published view returns this as a string (e.g. "0"); coerce it. */
  permit_count: nullableCoercedInt(),
  has_sunbiz_tenant: z.boolean().nullable(),
  has_bbb_contractor: z.boolean().nullable(),
  hoa_flag: z.boolean().nullable(),
});

/**
 * One published property row from Elephant MCP (Lee 37-column view).
 *
 * Wire field names stay snake_case to match MCP. This type never includes
 * `gis_muni` because Lee's published view does not expose it.
 */
export type PublishedPropertyRow = z.infer<typeof publishedPropertyRowSchema>;

/**
 * Parses an unknown MCP property row into a PublishedPropertyRow.
 *
 * Throws ZodError when `property_id` is missing or the row fails the Lee view.
 */
export function parsePublishedPropertyRow(
  rawPublishedPropertyRow: unknown,
): PublishedPropertyRow {
  return publishedPropertyRowSchema.parse(rawPublishedPropertyRow);
}

/**
 * Search-row fields the API Haversine filter needs from a published view row.
 *
 * Returns null when lat/lng are unpublished so the map never pins a missing centroid.
 */
export function mapPublishedPropertyRowToSearchFields(
  publishedPropertyRow: PublishedPropertyRow,
): {
  propertyId: string;
  parcelIdentifier: string | null;
  latitude: number;
  longitude: number;
  builtYear: number | null;
  builtYearSource: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  hasPermits: boolean | null;
  permitCount: number | null;
  hasBbbContractor: boolean | null;
  gisMuni: null;
} | null {
  if (
    publishedPropertyRow.latitude === null ||
    publishedPropertyRow.longitude === null
  ) {
    return null;
  }

  return {
    propertyId: publishedPropertyRow.property_id,
    parcelIdentifier: publishedPropertyRow.parcel_identifier,
    latitude: publishedPropertyRow.latitude,
    longitude: publishedPropertyRow.longitude,
    builtYear: publishedPropertyRow.built_year,
    builtYearSource: publishedPropertyRow.built_year_source ?? null,
    addressStreet: publishedPropertyRow.address_street,
    addressCity: publishedPropertyRow.address_city,
    addressZip: publishedPropertyRow.address_zip,
    hasPermits: publishedPropertyRow.has_permits,
    permitCount: publishedPropertyRow.permit_count,
    hasBbbContractor: publishedPropertyRow.has_bbb_contractor,
    gisMuni: null,
  };
}
