/**
 * The permit API as the CRM uses it: every permit type, and the one cast of the API client to it.
 *
 * The shape follows the increment-5 plan because the real client does not exist yet: the data API's permit
 * routes are not built, and the vendored @oracle-la/api-client has no `permits` router. Names are the plan's;
 * every field or parameter the plan does not name is marked `ASSUMED:`. When the real client lands, only this
 * module should need to change (replace these types with the client's and drop the cast).
 *
 * Permit descriptions are never requested, typed or shown: no description field exists in these types.
 */
import type { ApiClient } from "@oracle-la/api-client";

/**
 * How the API classifies a raw permit status. open-issued, open-application, closed and unmapped are the
 * plan's; unclear is the fourth class for statuses that are neither open nor closed (Quality Review
 * Completed, CofO in Progress). unmapped: a raw status that is not in the mapping table.
 */
export type StatusClass =
  "open-issued" | "open-application" | "closed" | "unclear" | "unmapped";

/** How a permit was tied to the parcel. */
export type JoinMethod = "direct" | "address" | "condo-building";

/** permits.longOpen input. Only open-issued permits count as open (decided by the server). */
export interface LongOpenInput {
  lat: number;
  lon: number;
  /** At most 10. */
  radius_miles: number;
  /** The roof-age filter; the CRM always passes the current one. */
  threshold_years?: number;
  min_open_days: number;
  /**
   * ASSUMED: the plan's route has no maximum; an optional maximum open duration, unset by default, was added
   * to it. The CRM sends this key ONLY when the user set a maximum.
   */
  max_open_days?: number;
  /** Server default: open_days descending, ties by permit_nbr. */
  sort: "open_days" | "distance";
  offset: number;
  /** At most 100. */
  limit: number;
}

export interface LongOpenItem {
  permit_nbr: string;
  /** The raw status as published. */
  status: string;
  status_class: StatusClass;
  issue_date: string | null;
  status_date: string | null;
  open_days: number | null;
  distance_miles: number;
  address: string | null;
  parcel_count: number;
  building_level: boolean;
  join_method: JoinMethod | null;
  /** ASSUMED name: the plan says "effective roof year of the parcel". */
  effective_roof_year: number | null;
}

export interface LongOpenResult {
  count: number;
  /** ASSUMED: the rule's inner shape (the plan names a rule, not its fields). */
  rule: { text: string };
  items: LongOpenItem[];
  next_offset: number | null;
}

export interface PermitContractor {
  /** Normalized licence class. */
  licence_class: string | null;
  /** Licence class as published. */
  licence_class_raw: string | null;
  class_note: "certification" | "unmapped" | "owner-builder" | null;
  owner_builder: boolean;
  licence_expiration_date: string | null;
  contractor_city: string | null;
  contractor_state: string | null;
  business_name: string | null;
  licence_number: string | null;
}

/**
 * A permit of one parcel. ASSUMED: the plan writes these as "{…, join_method, building_level, contractors}";
 * "…" is taken as the LongOpenItem fields without distance_miles.
 */
export interface ParcelPermit extends Omit<LongOpenItem, "distance_miles"> {
  contractors: PermitContractor[];
}

/** permits.forParcel input. */
export interface ForParcelInput {
  parcel_id: string;
}

export interface ParcelPermits {
  permit_data_available: boolean;
  jurisdiction: string | null;
  permits: ParcelPermit[];
  /** BBB ratings are never served: always unavailable, with the reason. */
  bbb: { available: false; reason: string };
}

/** Where the effective roof year comes from: the latest finaled roofing permit, else the assessor year built. */
export type RoofYearBasis = "permit" | "year_built";

/**
 * Fields that parcels.search items gain (plan). Optional, because the API served today does not send them.
 */
export interface SearchItemRoofYear {
  effective_roof_year?: number | null;
  roof_year_basis?: RoofYearBasis | null;
}

/**
 * Fields that parcels.detail `property` (a record, from v_property) gains (plan). Optional, as above.
 * Note: the pipeline table currently names the basis column roof_age_basis (labels PROXY / PERMIT) and the
 * permit column roof_year_permit_number; the served names are decided when the API is built.
 */
export interface PropertyRoofYear extends SearchItemRoofYear {
  roof_year_permit_nbr?: string | null;
  permit_data_available?: boolean;
}

/** The permit procedures, typed. */
export interface PermitsApi {
  longOpen(input: LongOpenInput): Promise<LongOpenResult>;
  forParcel(input: ForParcelInput): Promise<ParcelPermits>;
}

/** The procedures as the plan routes them on the tRPC client: api.permits.longOpen / api.permits.forParcel. */
interface PermitsRouterClient {
  permits: {
    longOpen: { query(input: LongOpenInput): Promise<LongOpenResult> };
    forParcel: { query(input: ForParcelInput): Promise<ParcelPermits> };
  };
}

/**
 * The permit procedures of an API client. No runtime support check: against an API without the routes a call
 * simply fails (a rejected promise, also when the client object lacks them), and the caller shows that error
 * inside its permits section only.
 */
export function permitsApi(api: ApiClient): PermitsApi {
  const client = api as unknown as PermitsRouterClient;
  return {
    longOpen: async (input) => client.permits.longOpen.query(input),
    forParcel: async (input) => client.permits.forParcel.query(input),
  };
}
